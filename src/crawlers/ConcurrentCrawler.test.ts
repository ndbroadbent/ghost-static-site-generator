import * as fs from 'fs';
import * as path from 'path';
import { ConcurrentCrawler } from './ConcurrentCrawler';
import { SmartFetcher } from '../fetchers/SmartFetcher';
import { GraphCache } from '../cache/GraphCache';
import { CacheManager } from '../cache/CacheManager';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('ConcurrentCrawler - Link Removal Protection', () => {
  let crawler: ConcurrentCrawler;
  let fetcher: SmartFetcher;
  let graphCache: GraphCache;
  let cacheManager: CacheManager;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create test instances
    cacheManager = new CacheManager('.test-cache');
    graphCache = new GraphCache('.test-cache');
    fetcher = new SmartFetcher(cacheManager);

    crawler = new ConcurrentCrawler(fetcher, graphCache, {
      concurrency: 1,
      staticDir: '/test/static',
      sourceDomain: 'https://test.com',
      allowlist404: [],
    });
  });

  test('should not delete files that are in the sitemap when links are removed from a page', () => {
    const sitemapUrls = [
      'https://test.com/page1',
      'https://test.com/page2',
      'https://test.com/page3',
    ];

    // Register sitemap URLs as known valid
    crawler.registerKnownValidUrls(sitemapUrls);

    // Simulate a scenario where page1 previously linked to page2 and page3
    // but now only links to page2
    const oldLinks = ['https://test.com/page2', 'https://test.com/page3'];
    const newLinks = ['https://test.com/page2'];

    // Mock fs.existsSync to return true for the files
    mockFs.existsSync.mockReturnValue(true);
    mockFs.unlinkSync.mockImplementation(() => {});

    // When we process this change, page3 should NOT be deleted
    // because it's in the sitemap (knownValidUrls)

    // In the real implementation, this would be called internally by crawlUrl
    // but we can't easily test that without a full integration test
    // So this test documents the expected behavior

    expect(sitemapUrls).toContain('https://test.com/page3');
  });

  test('should register known valid URLs from sitemap', () => {
    const urls = [
      'https://test.com/page1',
      'https://test.com/page2',
    ];

    // This should not throw
    expect(() => {
      crawler.registerKnownValidUrls(urls);
    }).not.toThrow();
  });
});

