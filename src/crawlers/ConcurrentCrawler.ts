import pLimit from 'p-limit';
import * as path from 'path';
import * as fs from 'fs';
import fetch from 'node-fetch';
import { SmartFetcher } from '../fetchers/SmartFetcher';
import { FeedParser } from '../parsers/FeedParser';
import { GraphCache } from '../cache/GraphCache';
import { CacheManager } from '../cache/CacheManager';

export interface CrawlOptions {
  concurrency?: number;
  staticDir: string;
  sourceDomain: string;
  allowlist404?: string[];
}

interface CrawlError {
  url: string;
  status: number;
  referrer?: string;
  timestamp: string;
}

export class ConcurrentCrawler {
  private fetcher: SmartFetcher;
  private parser: FeedParser;
  private graphCache: GraphCache;
  private options: Required<CrawlOptions>;

  // Concurrency control
  private crawled = new Set<string>();
  private inProgress = new Set<string>();
  private queue = new Set<string>();

  // Error tracking
  private errors: CrawlError[] = [];

  // Track known valid URLs (from sitemap, explicitly provided, etc.)
  private knownValidUrls = new Set<string>();

  // New graph for this crawl session
  private newGraph = new Map<string, { outLinks: string[]; resources: string[] }>();

  constructor(
    fetcher: SmartFetcher,
    graphCache: GraphCache,
    options: CrawlOptions,
  ) {
    this.fetcher = fetcher;
    this.parser = new FeedParser();
    this.graphCache = graphCache;
    this.options = {
      concurrency: options.concurrency || 10,
      staticDir: options.staticDir,
      sourceDomain: options.sourceDomain,
      allowlist404: options.allowlist404 || [],
    };
  }

  private urlToFilePath(url: string): string {
    const urlObj = new URL(url);
    let pathname = urlObj.pathname;

    if (pathname.startsWith('/')) {
      pathname = pathname.substring(1);
    }

    if (!pathname || pathname === '') {
      pathname = 'index.html';
    }

    if (pathname.endsWith('/')) {
      pathname += 'index.html';
    }

    // Don't add /index.html for:
    // 1. URLs with extensions
    // 2. URLs in /content/files/ (raw file downloads)
    // 3. URLs in /content/media/ (videos, etc.)
    // 4. URLs in /content/images/ (thumbnails, etc.)
    if (
      !path.extname(pathname) &&
      !pathname.startsWith('content/files/') &&
      !pathname.startsWith('content/media/') &&
      !pathname.startsWith('content/images/')
    ) {
      pathname += '/index.html';
    }

    // Handle query string versioning (e.g., screen.css?v=abc123 -> screen.abc123.css)
    if (urlObj.search && urlObj.searchParams.has('v')) {
      const version = urlObj.searchParams.get('v');
      const ext = path.extname(pathname);
      const base = pathname.substring(0, pathname.length - ext.length);
      pathname = `${base}.${version}${ext}`;
    }

    return path.join(this.options.staticDir, pathname);
  }

  private isHtmlContent(contentType?: string, url?: string): boolean {
    if (contentType?.includes('text/html')) {
      return true;
    }
    // Ghost URLs without extensions are typically HTML pages
    if (url) {
      const urlObj = new URL(url);
      const ext = path.extname(urlObj.pathname);
      return !ext || ext === '.html';
    }
    return false;
  }

  private isCssContent(contentType?: string, url?: string): boolean {
    if (contentType?.includes('text/css')) {
      return true;
    }
    if (url) {
      return url.endsWith('.css');
    }
    return false;
  }

  private isRSSFeed(filePath: string): boolean {
    return filePath.includes('/rss/') || filePath.endsWith('/rss');
  }

  private isVideoUrl(url: string): boolean {
    const videoExtensions = ['.mp4', '.mov', '.webm', '.avi', '.mkv'];
    const urlPath = new URL(url).pathname.toLowerCase();
    return videoExtensions.some(ext => urlPath.endsWith(ext));
  }

  private getVideoThumbnailUrl(videoUrl: string): string {
    // Ghost generates thumbnails with _thumb.jpg suffix
    // e.g., video.mp4 -> video_thumb.jpg
    const url = new URL(videoUrl);
    const pathname = url.pathname;
    const lastDot = pathname.lastIndexOf('.');
    const basePath = pathname.substring(0, lastDot);
    const thumbnailPath = `${basePath}_thumb.jpg`;
    return `${url.origin}${thumbnailPath}`;
  }

  private normalizeRSSContent(content: string): string {
    // Remove lastBuildDate tag which changes on every build even when content is the same
    let normalized = content.replace(/<lastBuildDate>.*?<\/lastBuildDate>/g, '<lastBuildDate></lastBuildDate>');

    // Normalize domain differences (blog.home.ndbroadbent.com vs madebynathan.com)
    normalized = normalized.replace(/https:\/\/blog\.home\.ndbroadbent\.com/g, 'DOMAIN');
    normalized = normalized.replace(/https:\/\/madebynathan\.com/g, 'DOMAIN');

    return normalized;
  }

  private addError(error: CrawlError): void {
    // Check allowlist
    if (
      this.options.allowlist404.some((pattern) => error.url.includes(pattern))
    ) {
      console.log(`  ℹ️  Allowlisted 404: ${error.url}`);
      return;
    }

    this.errors.push(error);
  }

  private async crawlUrl(url: string, referrer?: string): Promise<void> {
    url = this.normalizeUrl(url);

    if (this.crawled.has(url) || this.inProgress.has(url)) {
      return;
    }

    this.inProgress.add(url);
    const outputPath = this.urlToFilePath(url);

    try {
      // Fetch with conditional request
      const result = await this.fetcher.fetch(url);

      // Handle errors
      if (result.status === 404) {
        this.addError({
          url,
          status: 404,
          referrer,
          timestamp: new Date().toISOString(),
        });
        this.crawled.add(url);
        this.inProgress.delete(url);
        return;
      }

      if (result.status !== 200 && result.status !== 304) {
        this.addError({
          url,
          status: result.status,
          referrer,
          timestamp: new Date().toISOString(),
        });
        this.crawled.add(url);
        this.inProgress.delete(url);
        return;
      }

      // Get previous node from graph
      const oldNode = this.graphCache.getNode(url);

      if (result.status === 304) {
        // Not modified - but verify file exists on disk
        if (!fs.existsSync(outputPath)) {
          console.log(`  ! File missing, forcing re-download: ${outputPath}`);
          // Clear cache entry to force fresh download
          this.fetcher['cacheManager'].clearEntry(url);
          // Retry without cache
          const freshResult = await this.fetcher.fetch(url);
          if (freshResult.status === 200 && freshResult.content) {
            const dir = path.dirname(outputPath);
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }
            if (Buffer.isBuffer(freshResult.content)) {
              fs.writeFileSync(outputPath, freshResult.content);
            } else {
              fs.writeFileSync(outputPath, freshResult.content, 'utf8');
            }
          }
        }

        console.log(`  ✓ Using cached links for ${url}`);

        if (oldNode) {
          // Reuse old node's links for the new graph
          this.newGraph.set(url, {
            outLinks: oldNode.outLinks,
            resources: oldNode.resources,
          });

          // Add all child URLs to queue
          const childUrls = this.graphCache.getChildUrls(url);
          childUrls.forEach((childUrl) => {
            if (!this.crawled.has(childUrl) && !this.inProgress.has(childUrl)) {
              this.queue.add(childUrl);
            }
          });
        }
      } else if (result.status === 200 && result.content) {
        // Modified or new - save and parse
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // Special handling for RSS feeds - check if only timestamp changed
        let shouldSkipWrite = false;
        if (this.isRSSFeed(outputPath) && typeof result.content === 'string') {
          if (fs.existsSync(outputPath)) {
            const existingContent = fs.readFileSync(outputPath, 'utf8');
            const normalizedNew = this.normalizeRSSContent(result.content);
            const normalizedExisting = this.normalizeRSSContent(existingContent);

            if (normalizedNew === normalizedExisting) {
              console.log(`  ⊘ RSS content unchanged (only timestamp differs), skipping write`);
              shouldSkipWrite = true;
            }
          }
        }

        if (!shouldSkipWrite) {
          if (Buffer.isBuffer(result.content)) {
            fs.writeFileSync(outputPath, result.content);
          } else {
            fs.writeFileSync(outputPath, result.content, 'utf8');
          }
        }

        // Parse content to extract links
        let outLinks: string[] = [];
        let resources: string[] = [];

        if (
          this.isHtmlContent(result.contentType, url) &&
          typeof result.content === 'string'
        ) {
          // Parse HTML
          const newLinks = this.parser.extractUrlsFromHtml(
            result.content,
            this.options.sourceDomain,
          );

          // Separate links from resources
          for (const link of newLinks) {
            if (this.isHtmlContent(undefined, link)) {
              outLinks.push(link);
            } else {
              resources.push(link);

              // For video files, also fetch the thumbnail that Ghost generates
              if (this.isVideoUrl(link)) {
                const thumbnailUrl = this.getVideoThumbnailUrl(link);
                resources.push(thumbnailUrl);
              }
            }
          }
        } else if (this.isCssContent(result.contentType, url)) {
          // Parse CSS for url() references
          if (typeof result.content === 'string') {
            const cssUrls = this.parser.extractUrlsFromCss(
              result.content,
              url, // Use the CSS file URL as base
            );
            resources = cssUrls;
          }
        }

        // Store in new graph
        const normalizedOutLinks = Array.from(
          new Set(outLinks.map((l) => this.normalizeUrl(l))),
        );
        const normalizedResources = Array.from(
          new Set(resources.map((l) => this.normalizeUrl(l))),
        );

        this.newGraph.set(url, {
          outLinks: normalizedOutLinks,
          resources: normalizedResources,
        });

        // Report changes if there was an old node
        if (oldNode) {
          const oldAllLinks = [...oldNode.outLinks, ...oldNode.resources];
          const newAllLinks = [...normalizedOutLinks, ...normalizedResources];
          const oldSet = new Set(oldAllLinks);
          const newSet = new Set(newAllLinks);
          const added = newAllLinks.filter((link) => !oldSet.has(link));
          const removed = oldAllLinks.filter((link) => !newSet.has(link));

          if (added.length > 0) {
            console.log(`  + Added ${added.length} links`);
          }
          if (removed.length > 0) {
            console.log(`  - Removed ${removed.length} links`);
          }
        }

        // Add new links to queue
        [...normalizedOutLinks, ...normalizedResources].forEach((link) => {
          if (!this.crawled.has(link) && !this.inProgress.has(link)) {
            this.queue.add(link);
          }
        });
      }

      this.crawled.add(url);
    } catch (error) {
      console.error(`  ✗ Error crawling ${url}:`, error);
      this.addError({
        url,
        status: 0,
        referrer,
        timestamp: new Date().toISOString(),
      });
      this.crawled.add(url);
    } finally {
      this.inProgress.delete(url);
    }
  }

  public async crawl(startUrl: string): Promise<void> {
    startUrl = this.normalizeUrl(startUrl);
    console.log(`\nStarting crawl from ${startUrl}`);
    console.log(`Concurrency: ${this.options.concurrency}\n`);

    // Load existing graph stats
    const graphStats = this.graphCache.getStats();
    if (graphStats.nodes > 0) {
      console.log(
        `Loaded graph with ${graphStats.nodes} nodes, ${graphStats.totalLinks} links, ${graphStats.totalResources} resources\n`,
      );
    }

    this.queue.add(startUrl);

    const limit = pLimit(this.options.concurrency);

    while (this.queue.size > 0 || this.inProgress.size > 0) {
      if (this.queue.size === 0) {
        // Wait for in-progress to complete
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }

      const batch = Array.from(this.queue);
      this.queue.clear();

      await Promise.all(batch.map((url) => limit(() => this.crawlUrl(url))));
    }

    console.log(`\n✓ Crawled ${this.crawled.size} total URLs\n`);

    // Final error report
    if (this.errors.length > 0) {
      console.error('\n❌ CRAWL ERRORS DETECTED:\n');
      this.errors.forEach((error) => {
        console.error(`  [${error.status}] ${error.url}`);
        if (error.referrer) {
          console.error(`      Referenced from: ${error.referrer}`);
        }
      });
      console.error(`\nTotal errors: ${this.errors.length}`);
      throw new Error(`Crawl failed with ${this.errors.length} errors`);
    }
  }

  public async fetchSitemapUrls(sitemapUrl: string): Promise<string[]> {
    const allUrls: string[] = [];

    try {
      // Fetch main sitemap
      const response = await fetch(sitemapUrl);
      if (!response.ok) {
        console.error(`Failed to fetch sitemap: ${response.status}`);
        return [];
      }

      const xmlContent = await response.text();
      const items = this.parser.parseSitemap(xmlContent);

      // Check if this is a sitemap index (contains other sitemaps)
      for (const item of items) {
        if (item.url.includes('sitemap-')) {
          // This is a sub-sitemap, fetch it
          try {
            const subResponse = await fetch(item.url);
            if (subResponse.ok) {
              const subXml = await subResponse.text();
              const subItems = this.parser.parseSitemap(subXml);
              allUrls.push(...subItems.map(i => i.url));
            }
          } catch (error) {
            console.error(`Failed to fetch sub-sitemap ${item.url}:`, error);
          }
        } else {
          // Regular URL
          allUrls.push(item.url);
        }
      }
    } catch (error) {
      console.error('Failed to parse sitemap:', error);
    }

    return allUrls;
  }

  public registerKnownValidUrls(urls: string[]): void {
    console.log(`Registering ${urls.length} known valid URLs from sitemap/explicit list\n`);
    urls.forEach((url) => this.knownValidUrls.add(this.normalizeUrl(url)));
  }

  public async crawlAdditionalUrls(urls: string[]): Promise<void> {
    const normalizedUrls = urls.map((u) => this.normalizeUrl(u));
    // Filter out already crawled URLs
    const uncrawled = normalizedUrls.filter(
      (url) => !this.crawled.has(url) && !this.inProgress.has(url),
    );

    if (uncrawled.length === 0) {
      return;
    }

    console.log(`\nCrawling ${uncrawled.length} additional URLs...\n`);

    const limit = pLimit(this.options.concurrency);

    // Add URLs to queue
    uncrawled.forEach((url) => {
      this.queue.add(url);
    });

    while (this.queue.size > 0 || this.inProgress.size > 0) {
      if (this.queue.size === 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }

      const batch = Array.from(this.queue);
      this.queue.clear();

      await Promise.all(batch.map((url) => limit(() => this.crawlUrl(url))));
    }

    console.log(`\n✓ Crawled ${uncrawled.length} additional URLs\n`);
  }

  /**
   * After crawling is complete, update the graph cache with the new graph
   * and clean up files that are no longer referenced.
   */
  public async finalizeAndCleanup(): Promise<void> {
    console.log('\n=== Finalizing Graph and Cleaning Up ===\n');

    // Update graph cache with new graph
    console.log(`Updating graph cache with ${this.newGraph.size} nodes...`);
    for (const [url, { outLinks, resources }] of this.newGraph.entries()) {
      this.graphCache.setNode(url, outLinks, resources);
    }

    // Build DAG from all entry points (known valid URLs)
    const entryPoints = Array.from(this.knownValidUrls);
    console.log(`Building DAG from ${entryPoints.length} entry points...`);
    const reachableUrls = this.graphCache.buildDAG(entryPoints);
    console.log(`DAG contains ${reachableUrls.size} reachable URLs (including all resources)\n`);

    // Find all files in static directory
    const staticFiles = this.findAllStaticFiles(this.options.staticDir);
    console.log(`Found ${staticFiles.length} files in static directory`);

    // Convert files to URLs
    const fileUrls = new Set(
      staticFiles
        .map(filePath => this.filePathToUrl(filePath))
        .filter(url => url !== null) as string[]
    );

    // Find files that should be deleted (not in DAG)
    const filesToDelete: string[] = [];
    for (const fileUrl of fileUrls) {
      if (!reachableUrls.has(fileUrl)) {
        filesToDelete.push(this.urlToFilePath(fileUrl));
      }
    }

    // Delete unreachable files
    if (filesToDelete.length > 0) {
      console.log(`\nDeleting ${filesToDelete.length} unreachable files:\n`);
      for (const filePath of filesToDelete) {
        try {
          fs.unlinkSync(filePath);
          console.log(`  🗑️  Deleted: ${filePath}`);

          // Try to remove empty parent directories
          this.removeEmptyParentDirs(filePath, this.options.staticDir);
        } catch (error) {
          console.error(`  ✗ Failed to delete ${filePath}:`, error);
        }
      }
    } else {
      console.log('No unreachable files to delete\n');
    }

    // Save updated graph
    this.graphCache.save();
  }

  private findAllStaticFiles(dir: string): string[] {
    const files: string[] = [];

    const traverse = (currentDir: string) => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          traverse(fullPath);
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    };

    if (fs.existsSync(dir)) {
      traverse(dir);
    }

    return files;
  }

  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      let pathname = urlObj.pathname;

      // Remove index.html
      if (pathname.endsWith('/index.html')) {
        pathname = pathname.substring(0, pathname.length - 10);
      } else if (pathname === '/index.html') {
        pathname = '/';
      }

      // Check for extension-less and not in excluded paths
      const relativePath = pathname.startsWith('/') ? pathname.substring(1) : pathname;
      const hasExtension = !!path.extname(pathname);
      const isExcluded =
        relativePath.startsWith('content/files/') ||
        relativePath.startsWith('content/media/') ||
        relativePath.startsWith('content/images/');

      if (!pathname.endsWith('/') && !hasExtension && !isExcluded) {
        pathname += '/';
      }

      urlObj.pathname = pathname;
      return urlObj.href;
    } catch (e) {
      return url;
    }
  }

  private filePathToUrl(filePath: string): string | null {
    try {
      // Get relative path from static directory
      const relativePath = path.relative(this.options.staticDir, filePath);

      // Skip certain files/directories that aren't part of the crawl
      // These are added by post-processing steps or are special files
      if (
        relativePath === 'CNAME' ||
        relativePath === '404.html' ||
        relativePath === '.DS_Store' ||
        relativePath === '.gitignore' ||
        relativePath === 'content/files/2024/12/deskew' || // Binary file, not a directory
        relativePath.startsWith('2026/02/01/world-history-of-value/') ||
        relativePath.startsWith('.git/') ||
        relativePath.startsWith('logs/') ||
        (relativePath.endsWith('.txt') && !relativePath.includes('/')) ||
        relativePath.includes('/.') // Skip all hidden files/directories
      ) {
        return null;
      }

      let urlPath = relativePath;

      // Convert versioned filenames back to query strings
      // e.g., screen.abc123.css -> screen.css?v=abc123
      const ext = path.extname(urlPath);
      if (ext) {
        const baseName = path.basename(urlPath, ext);
        const versionMatch = baseName.match(/^(.+)\.([a-f0-9]+)$/);
        if (versionMatch) {
          const actualBase = versionMatch[1];
          const version = versionMatch[2];
          const dir = path.dirname(urlPath);
          urlPath = path.join(dir, `${actualBase}${ext}`);

          // Add version as query string
          const url = `${this.options.sourceDomain}/${urlPath}?v=${version}`;
          return url;
        }
      }

      // Convert /index.html to / (with trailing slash for consistency with Ghost URLs)
      if (urlPath.endsWith('/index.html')) {
        urlPath = urlPath.substring(0, urlPath.length - 10); // Remove 'index.html', keep trailing /
      } else if (urlPath === 'index.html') {
        urlPath = '/';
      }

      // Ensure leading slash
      if (!urlPath.startsWith('/')) {
        urlPath = '/' + urlPath;
      }

      // Ensure trailing slash for directory-like URLs (Ghost convention)
      // But skip for files in content/files/ or content/media/ or content/images/
      const checkPath = urlPath.startsWith('/') ? urlPath.substring(1) : urlPath;
      const isExcluded =
        checkPath.startsWith('content/files/') ||
        checkPath.startsWith('content/media/') ||
        checkPath.startsWith('content/images/');

      if (
        !urlPath.endsWith('/') &&
        !path.extname(urlPath) &&
        !isExcluded
      ) {
        urlPath += '/';
      }

      return `${this.options.sourceDomain}${urlPath}`;
    } catch (error) {
      console.error(`Failed to convert file path to URL: ${filePath}`, error);
      return null;
    }
  }

  private removeEmptyParentDirs(filePath: string, rootDir: string): void {
    let dir = path.dirname(filePath);

    while (dir !== rootDir && dir.startsWith(rootDir)) {
      try {
        const entries = fs.readdirSync(dir);
        if (entries.length === 0) {
          fs.rmdirSync(dir);
          console.log(`  🗑️  Removed empty directory: ${dir}`);
          dir = path.dirname(dir);
        } else {
          break;
        }
      } catch (error) {
        break;
      }
    }
  }

  public getStats() {
    return {
      crawled: this.crawled.size,
      inProgress: this.inProgress.size,
      queued: this.queue.size,
      errors: this.errors.length,
    };
  }
}
