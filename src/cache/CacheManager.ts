import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface CacheEntry {
  etag: string | null;
  lastModified: string | null;
  lastFetched: string;
  fileHash?: string;
}

export interface CacheManifest {
  version: string;
  lastUpdated: string;
  urls: Record<string, CacheEntry>;
}

export class CacheManager {
  private manifestPath: string;
  private manifest: CacheManifest;
  private modified: boolean = false;

  constructor(cacheDir: string = '.gssg-cache') {
    this.manifestPath = path.join(process.cwd(), cacheDir, 'manifest.json');
    this.manifest = this.loadManifest();
  }

  private loadManifest(): CacheManifest {
    try {
      if (fs.existsSync(this.manifestPath)) {
        const data = fs.readFileSync(this.manifestPath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.warn('Failed to load cache manifest, starting fresh:', error);
    }

    return {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      urls: {},
    };
  }

  public getEntry(url: string): CacheEntry | null {
    return this.manifest.urls[url] || null;
  }

  public setEntry(url: string, entry: Partial<CacheEntry>): void {
    const existing = this.manifest.urls[url] || {};
    this.manifest.urls[url] = {
      etag: entry.etag ?? existing.etag ?? null,
      lastModified: entry.lastModified ?? existing.lastModified ?? null,
      lastFetched: entry.lastFetched ?? new Date().toISOString(),
      fileHash: entry.fileHash ?? existing.fileHash,
    };
    this.modified = true;
  }

  public hasUrl(url: string): boolean {
    return url in this.manifest.urls;
  }

  public removeEntry(url: string): void {
    delete this.manifest.urls[url];
    this.modified = true;
  }

  public clearEntry(url: string): void {
    this.removeEntry(url);
  }

  public getConditionalHeaders(url: string): Record<string, string> {
    const entry = this.getEntry(url);
    if (!entry) {
      return {};
    }

    const headers: Record<string, string> = {};
    if (entry.etag) {
      headers['If-None-Match'] = entry.etag;
    }
    if (entry.lastModified) {
      headers['If-Modified-Since'] = entry.lastModified;
    }
    return headers;
  }

  public computeFileHash(filePath: string): string | null {
    try {
      const content = fs.readFileSync(filePath);
      return crypto.createHash('md5').update(content).digest('hex');
    } catch (error) {
      return null;
    }
  }

  public save(): void {
    if (!this.modified) {
      return;
    }

    try {
      const dir = path.dirname(this.manifestPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.manifest.lastUpdated = new Date().toISOString();
      fs.writeFileSync(
        this.manifestPath,
        JSON.stringify(this.manifest, null, 2),
        'utf8',
      );
      this.modified = false;
      console.log(
        `Cache manifest saved with ${
          Object.keys(this.manifest.urls).length
        } entries`,
      );
    } catch (error) {
      console.error('Failed to save cache manifest:', error);
    }
  }

  public getStats(): {
    total: number;
    withEtag: number;
    withLastModified: number;
  } {
    const urls = Object.values(this.manifest.urls);
    return {
      total: urls.length,
      withEtag: urls.filter((e) => e.etag).length,
      withLastModified: urls.filter((e) => e.lastModified).length,
    };
  }

  public clearOldEntries(maxAgeDays: number = 30): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

    let removed = 0;
    for (const [url, entry] of Object.entries(this.manifest.urls)) {
      const lastFetched = new Date(entry.lastFetched);
      if (lastFetched < cutoffDate) {
        this.removeEntry(url);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(
        `Cleared ${removed} old cache entries (older than ${maxAgeDays} days)`,
      );
    }
    return removed;
  }
}
