import fetch, { Response } from 'node-fetch';
import * as fs from 'fs';
import * as path from 'path';
import { CacheManager } from '../cache/CacheManager';

export interface FetchResult {
  url: string;
  status: number;
  wasModified: boolean;
  content?: Buffer | string;
  contentType?: string;
  etag?: string;
  lastModified?: string;
}

export class SmartFetcher {
  private cacheManager: CacheManager;
  private stats = {
    requests: 0,
    notModified: 0,
    downloaded: 0,
    errors: 0,
  };

  constructor(cacheManager: CacheManager) {
    this.cacheManager = cacheManager;
  }

  public async fetch(
    url: string,
    options: { binary?: boolean } = {},
  ): Promise<FetchResult> {
    this.stats.requests++;

    try {
      const conditionalHeaders = this.cacheManager.getConditionalHeaders(url);

      console.log(
        conditionalHeaders['If-None-Match']
          ? `Checking ${url} (ETag: ${conditionalHeaders[
              'If-None-Match'
            ].substring(0, 20)}...)`
          : `Fetching ${url}`,
      );

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Ghost-Static-Site-Generator/2.0',
          ...conditionalHeaders,
        },
      });

      const result: FetchResult = {
        url,
        status: response.status,
        wasModified: response.status !== 304,
        etag: response.headers.get('etag') || undefined,
        lastModified: response.headers.get('last-modified') || undefined,
        contentType: response.headers.get('content-type') || undefined,
      };

      if (response.status === 304) {
        // Not modified - use cached version
        this.stats.notModified++;
        console.log(`  ✓ Not modified (304)`);
        return result;
      }

      if (!response.ok) {
        this.stats.errors++;
        const finalUrl =
          response.url !== url ? ` (redirected to ${response.url})` : '';
        console.error(
          `  ✗ Error ${response.status}: ${response.statusText}${finalUrl}`,
        );
        return result;
      }

      // Download content
      if (options.binary || this.isBinaryContent(result.contentType)) {
        result.content = await response.buffer();
      } else {
        result.content = await response.text();
      }

      this.stats.downloaded++;
      const sizeKB = result.content
        ? (result.content.length / 1024).toFixed(2)
        : '0';
      console.log(`  ✓ Downloaded ${sizeKB} KB`);

      // Update cache
      this.cacheManager.setEntry(url, {
        etag: result.etag,
        lastModified: result.lastModified,
        lastFetched: new Date().toISOString(),
      });

      return result;
    } catch (error) {
      this.stats.errors++;
      console.error(`  ✗ Fetch error:`, error);
      return {
        url,
        status: 0,
        wasModified: false,
      };
    }
  }

  public async fetchAndSave(url: string, outputPath: string): Promise<boolean> {
    const result = await this.fetch(url, {
      binary: this.isBinaryPath(outputPath),
    });

    if (!result.wasModified) {
      // Content hasn't changed, no need to rewrite file
      return false;
    }

    if (!result.content) {
      return false;
    }

    try {
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Special handling for RSS feeds - normalize and compare to avoid timestamp-only changes
      if (this.isRSSFeed(outputPath) && typeof result.content === 'string') {
        if (fs.existsSync(outputPath)) {
          const existingContent = fs.readFileSync(outputPath, 'utf8');
          const normalizedNew = this.normalizeRSSContent(result.content);
          const normalizedExisting = this.normalizeRSSContent(existingContent);

          if (normalizedNew === normalizedExisting) {
            console.log(`  ⊘ RSS content unchanged (only timestamp differs), skipping write`);
            return false;
          }
        }
      }

      if (Buffer.isBuffer(result.content)) {
        fs.writeFileSync(outputPath, result.content);
      } else {
        fs.writeFileSync(outputPath, result.content, 'utf8');
      }

      // Store file hash in cache
      const fileHash = this.cacheManager.computeFileHash(outputPath);
      if (fileHash) {
        this.cacheManager.setEntry(url, { fileHash });
      }

      return true;
    } catch (error) {
      console.error(`Failed to save ${outputPath}:`, error);
      return false;
    }
  }

  private isBinaryContent(contentType?: string): boolean {
    if (!contentType) return false;
    return (
      contentType.includes('image/') ||
      contentType.includes('video/') ||
      contentType.includes('audio/') ||
      contentType.includes('application/octet-stream') ||
      contentType.includes('font/') ||
      contentType.includes('application/pdf')
    );
  }

  private isBinaryPath(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return [
      '.png',
      '.jpg',
      '.jpeg',
      '.gif',
      '.webp',
      '.svg',
      '.ico',
      '.mp4',
      '.mov',
      '.avi',
      '.mkv',
      '.webm',
      '.mp3',
      '.wav',
      '.ogg',
      '.woff',
      '.woff2',
      '.ttf',
      '.eot',
      '.otf',
      '.pdf',
      '.zip',
      '.tar',
      '.gz',
    ].includes(ext);
  }

  private isRSSFeed(filePath: string): boolean {
    return filePath.includes('/rss/') || filePath.endsWith('/rss');
  }

  private normalizeRSSContent(content: string): string {
    // Remove lastBuildDate tag which changes on every build even when content is the same
    return content.replace(/<lastBuildDate>.*?<\/lastBuildDate>/g, '<lastBuildDate></lastBuildDate>');
  }

  public getStats() {
    return { ...this.stats };
  }

  public printStats(): void {
    console.log('\n=== Fetch Statistics ===');
    console.log(`Total requests: ${this.stats.requests}`);
    console.log(`Not modified (304): ${this.stats.notModified}`);
    console.log(`Downloaded: ${this.stats.downloaded}`);
    console.log(`Errors: ${this.stats.errors}`);
    if (this.stats.requests > 0) {
      const cacheHitRate = (
        (this.stats.notModified / this.stats.requests) *
        100
      ).toFixed(1);
      console.log(`Cache hit rate: ${cacheHitRate}%`);
    }
    console.log('========================\n');
  }
}
