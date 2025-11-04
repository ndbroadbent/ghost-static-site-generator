import { XMLParser } from 'fast-xml-parser';

export interface FeedItem {
  url: string;
  title?: string;
  pubDate?: string;
  updated?: string;
}

export class FeedParser {
  private parser: XMLParser;

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });
  }

  public parseRSS(xmlContent: string): FeedItem[] {
    try {
      const result = this.parser.parse(xmlContent);

      if (!result.rss?.channel?.item) {
        return [];
      }

      const items = Array.isArray(result.rss.channel.item)
        ? result.rss.channel.item
        : [result.rss.channel.item];

      return items.map((item: any) => ({
        url: item.link,
        title: item.title,
        pubDate: item.pubDate,
      }));
    } catch (error) {
      console.error('Failed to parse RSS feed:', error);
      return [];
    }
  }

  public parseSitemap(xmlContent: string): FeedItem[] {
    try {
      const result = this.parser.parse(xmlContent);

      // Handle sitemap index
      if (result.sitemapindex?.sitemap) {
        const sitemaps = Array.isArray(result.sitemapindex.sitemap)
          ? result.sitemapindex.sitemap
          : [result.sitemapindex.sitemap];

        return sitemaps.map((sitemap: any) => ({
          url: sitemap.loc,
          updated: sitemap.lastmod,
        }));
      }

      // Handle regular sitemap
      if (result.urlset?.url) {
        const urls = Array.isArray(result.urlset.url)
          ? result.urlset.url
          : [result.urlset.url];

        return urls.map((urlEntry: any) => ({
          url: urlEntry.loc,
          updated: urlEntry.lastmod,
        }));
      }

      return [];
    } catch (error) {
      console.error('Failed to parse sitemap:', error);
      return [];
    }
  }

  public extractUrlsFromCss(cssContent: string, baseUrl: string): string[] {
    const urls = new Set<string>();

    // Match url() declarations in CSS
    const urlRegex = /url\(['"]?([^'")\s]+)['"]?\)/g;
    let match;
    let matchCount = 0;

    while ((match = urlRegex.exec(cssContent)) !== null) {
      matchCount++;
      const url = match[1];

      // Skip data URLs
      if (url.startsWith('data:')) {
        continue;
      }

      // Convert relative URLs to absolute
      try {
        const absoluteUrl = new URL(url, baseUrl).href;
        // Only include URLs from the same domain (check against root domain)
        const sourceDomain = new URL(baseUrl).origin;
        if (absoluteUrl.startsWith(sourceDomain)) {
          urls.add(absoluteUrl);
        }
      } catch (error) {
        // Invalid URL, skip
      }
    }

    return Array.from(urls);
  }

  public extractUrlsFromHtml(htmlContent: string, baseUrl: string): string[] {
    const urls = new Set<string>();

    // Remove code blocks, pre blocks, and textareas to avoid extracting example URLs
    let cleanedHtml = htmlContent
      .replace(/<pre[^>]*>[\s\S]*?<\/pre>/gi, '')
      .replace(/<code[^>]*>[\s\S]*?<\/code>/gi, '')
      .replace(/<textarea[^>]*>[\s\S]*?<\/textarea>/gi, '');

    // Match href attributes
    const hrefRegex = /href=["']([^"']+)["']/g;
    let match;

    while ((match = hrefRegex.exec(cleanedHtml)) !== null) {
      const url = match[1];

      // Skip fragments, mailto, tel, javascript
      if (
        url.startsWith('#') ||
        url.startsWith('mailto:') ||
        url.startsWith('tel:') ||
        url.startsWith('javascript:')
      ) {
        continue;
      }

      // Convert relative URLs to absolute
      try {
        const absoluteUrl = new URL(url, baseUrl).href;
        // Only include URLs from the same domain
        if (absoluteUrl.startsWith(baseUrl)) {
          urls.add(absoluteUrl);
        }
      } catch (error) {
        // Invalid URL, skip
      }
    }

    // Match src attributes (images, scripts, etc.)
    const srcRegex = /src=["']([^"']+)["']/g;
    while ((match = srcRegex.exec(cleanedHtml)) !== null) {
      const url = match[1];

      // Skip data URLs
      if (url.startsWith('data:')) {
        continue;
      }

      try {
        const absoluteUrl = new URL(url, baseUrl).href;
        if (absoluteUrl.startsWith(baseUrl)) {
          urls.add(absoluteUrl);
        }
      } catch (error) {
        // Invalid URL, skip
      }
    }

    // Match srcset attributes (responsive images)
    const srcsetRegex = /srcset=["']([^"']+)["']/g;
    while ((match = srcsetRegex.exec(cleanedHtml)) !== null) {
      const srcsetValue = match[1];
      // srcset format: "url1 1x, url2 2x" or "url1 100w, url2 200w"
      const srcsetUrls = srcsetValue
        .split(',')
        .map((s) => s.trim().split(/\s+/)[0]);

      for (const url of srcsetUrls) {
        if (url.startsWith('data:')) {
          continue;
        }

        try {
          const absoluteUrl = new URL(url, baseUrl).href;
          if (absoluteUrl.startsWith(baseUrl)) {
            urls.add(absoluteUrl);
          }
        } catch (error) {
          // Invalid URL, skip
        }
      }
    }

    return Array.from(urls);
  }
}
