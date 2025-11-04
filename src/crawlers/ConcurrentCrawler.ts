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

  // Error tracking with mutex simulation (JS is single-threaded but async)
  private errors: CrawlError[] = [];
  private expectedRemovals = new Set<string>();
  private errorLock = Promise.resolve();

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
    if (
      !path.extname(pathname) &&
      !pathname.startsWith('content/files/') &&
      !pathname.startsWith('content/media/')
    ) {
      pathname += '/index.html';
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

  private async addError(error: CrawlError): Promise<void> {
    // Mutex-like behavior using promise chaining
    this.errorLock = this.errorLock.then(async () => {
      // Check if this is an expected removal
      if (this.expectedRemovals.has(error.url)) {
        console.log(`  ℹ️  Expected 404 (removed from parent): ${error.url}`);
        this.expectedRemovals.delete(error.url);
        return;
      }

      // Check allowlist
      if (
        this.options.allowlist404.some((pattern) => error.url.includes(pattern))
      ) {
        console.log(`  ℹ️  Allowlisted 404: ${error.url}`);
        return;
      }

      this.errors.push(error);
    });
    await this.errorLock;
  }

  private async markAsRemoved(urls: string[]): Promise<void> {
    this.errorLock = this.errorLock.then(async () => {
      urls.forEach((url) => {
        this.expectedRemovals.add(url);

        // Delete the file from disk
        const filePath = this.urlToFilePath(url);
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
            console.log(`  🗑️  Deleted removed file: ${filePath}`);
          } catch (error) {
            console.error(`  ✗ Failed to delete ${filePath}:`, error);
          }
        }

        // Remove from graph cache
        this.graphCache.removeNode(url);

        // Remove from ETag cache
        this.fetcher['cacheManager'].clearEntry(url);
      });
    });
    await this.errorLock;
  }

  private diffLinks(
    oldLinks: string[],
    newLinks: string[],
  ): {
    added: string[];
    removed: string[];
    unchanged: string[];
  } {
    const oldSet = new Set(oldLinks);
    const newSet = new Set(newLinks);

    const added = newLinks.filter((link) => !oldSet.has(link));
    const removed = oldLinks.filter((link) => !newSet.has(link));
    const unchanged = newLinks.filter((link) => oldSet.has(link));

    return { added, removed, unchanged };
  }

  private async crawlUrl(url: string, referrer?: string): Promise<void> {
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
        await this.addError({
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
        await this.addError({
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

        if (Buffer.isBuffer(result.content)) {
          fs.writeFileSync(outputPath, result.content);
        } else {
          fs.writeFileSync(outputPath, result.content, 'utf8');
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

        // Diff with old node if it exists
        if (oldNode) {
          const oldAllLinks = [...oldNode.outLinks, ...oldNode.resources];
          const newAllLinks = [...outLinks, ...resources];
          const diff = this.diffLinks(oldAllLinks, newAllLinks);

          if (diff.added.length > 0) {
            console.log(`  + Added ${diff.added.length} links`);
          }
          if (diff.removed.length > 0) {
            console.log(`  - Removed ${diff.removed.length} links`);
            await this.markAsRemoved(diff.removed);
          }
        }

        // Update graph
        this.graphCache.setNode(url, outLinks, resources);

        // Add new links to queue
        [...outLinks, ...resources].forEach((link) => {
          if (!this.crawled.has(link) && !this.inProgress.has(link)) {
            this.queue.add(link);
          }
        });
      }

      this.crawled.add(url);
    } catch (error) {
      console.error(`  ✗ Error crawling ${url}:`, error);
      await this.addError({
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

    // Save graph
    this.graphCache.save();

    // Wait for all error processing to complete
    await this.errorLock;

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

  public async crawlAdditionalUrls(urls: string[]): Promise<void> {
    // Filter out already crawled URLs
    const uncrawled = urls.filter(url => !this.crawled.has(url) && !this.inProgress.has(url));

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

  public getStats() {
    return {
      crawled: this.crawled.size,
      inProgress: this.inProgress.size,
      queued: this.queue.size,
      errors: this.errors.length,
    };
  }
}
