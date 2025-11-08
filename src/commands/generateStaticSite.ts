import * as path from 'path';
import * as fs from 'fs';
import { CacheManager } from '../cache/CacheManager';
import { GraphCache } from '../cache/GraphCache';
import { SmartFetcher } from '../fetchers/SmartFetcher';
import { ConcurrentCrawler } from '../crawlers/ConcurrentCrawler';

const OPTIONS = require('../constants/OPTIONS');
const copy404PageHelper = require('../helpers/copy404PageHelper');
const normalizeVersionedUrls = require('../helpers/normalizeVersionedUrls');
const replaceUrlHelper = require('../helpers/replaceUrlHelper');
const { argv } = require('yargs');
const previewGeneratedSite = require('./previewGeneratedSite');

async function generateStaticSite(): Promise<void> {
  const startTime = Date.now();
  console.time('Site generated in');

  const absoluteStaticPath = path.resolve(
    process.cwd(),
    OPTIONS.STATIC_DIRECTORY,
  );

  try {
    // Create static directory
    fs.mkdirSync(`${OPTIONS.STATIC_DIRECTORY}/content`, { recursive: true });

    // Initialize caches and fetcher
    console.log('Initializing cache managers...');
    const cacheManager = new CacheManager();
    const graphCache = new GraphCache();

    const cacheStats = cacheManager.getStats();
    console.log(
      `ETag cache contains ${cacheStats.total} URLs (${cacheStats.withEtag} with ETags)`,
    );

    const graphStats = graphCache.getStats();
    console.log(`Graph cache contains ${graphStats.nodes} nodes\n`);

    // Clean old cache entries (older than 30 days)
    cacheManager.clearOldEntries(30);

    const fetcher = new SmartFetcher(cacheManager);

    // 404 allowlist - URLs that are expected to 404
    const allowlist404 = [
      '/webmentions/receive/', // Webmention endpoint that's not implemented
    ];

    const crawler = new ConcurrentCrawler(fetcher, graphCache, {
      concurrency: argv.concurrency || 10,
      staticDir: OPTIONS.STATIC_DIRECTORY,
      sourceDomain: OPTIONS.SOURCE_DOMAIN,
      allowlist404,
    });

    // Fetch and parse sitemaps first to ensure we have all URLs
    console.log('Fetching sitemaps...\n');
    const sitemapUrls = await crawler.fetchSitemapUrls(`${OPTIONS.SOURCE_DOMAIN}/sitemap.xml`);
    console.log(`Found ${sitemapUrls.length} URLs in sitemaps\n`);

    // Explicitly fetch files that aren't linked from HTML pages
    const explicitUrls = [
      `${OPTIONS.SOURCE_DOMAIN}/sitemap.xsl`,
      `${OPTIONS.SOURCE_DOMAIN}/sitemap.xml`,
      `${OPTIONS.SOURCE_DOMAIN}/sitemap-pages.xml`,
      `${OPTIONS.SOURCE_DOMAIN}/sitemap-posts.xml`,
      `${OPTIONS.SOURCE_DOMAIN}/sitemap-authors.xml`,
      `${OPTIONS.SOURCE_DOMAIN}/sitemap-tags.xml`,
      `${OPTIONS.SOURCE_DOMAIN}/robots.txt`,
      `${OPTIONS.SOURCE_DOMAIN}/public/ghost.css`,
      `${OPTIONS.SOURCE_DOMAIN}/public/ghost.min.css`,
    ];

    // Register all known valid URLs (from sitemap + explicit list + root) before crawling
    // This prevents the crawler from deleting files that are valid but not linked
    const rootUrl = `${OPTIONS.SOURCE_DOMAIN}/`;
    crawler.registerKnownValidUrls([rootUrl, ...explicitUrls, ...sitemapUrls]);

    // Start crawl from root - will recursively discover and crawl everything
    await crawler.crawl(rootUrl);

    // Crawl explicit URLs and sitemap URLs
    await crawler.crawlAdditionalUrls([...explicitUrls, ...sitemapUrls]);

    // Finalize graph and clean up unreachable files
    await crawler.finalizeAndCleanup();

    // Save both caches
    cacheManager.save();

    // Print fetch statistics
    fetcher.printStats();

    // Run post-processing helpers
    console.log('Running post-processing helpers...\n');

    // Copy 404 page
    await copy404PageHelper();

    // Normalize versioned URLs (file.css?v=abc -> file.abc.css)
    normalizeVersionedUrls(absoluteStaticPath);

    // Replace URLs if specified
    if (argv.url && !argv.preview) {
      replaceUrlHelper(absoluteStaticPath, /\.(html|xml|xsl|txt|js)/, argv.url);
    }

    // Ensure ALL instances of source domain are replaced with production domain
    if (argv.productionDomain) {
      console.log(`Replacing all blog.home.ndbroadbent.com with madebynathan.com...\n`);

      const replaceInFile = (filePath: string) => {
        const content = fs.readFileSync(filePath, 'utf8');
        const replaced = content.replace(/blog\.home\.ndbroadbent\.com/g, 'madebynathan.com');
        if (content !== replaced) {
          fs.writeFileSync(filePath, replaced, 'utf8');
        }
      };

      const processDirectory = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            processDirectory(fullPath);
          } else if (entry.isFile() && /\.(html|xml|xsl|txt|js|css)$/.test(entry.name)) {
            replaceInFile(fullPath);
          }
        }
      };

      processDirectory(absoluteStaticPath);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\nDomain: ${OPTIONS.SOURCE_DOMAIN}`);
    console.log(`Static site generated at: ${absoluteStaticPath}`);
    console.log(`Total time: ${elapsed}s`);
    console.timeEnd('Site generated in');

    if (argv.preview) {
      previewGeneratedSite(absoluteStaticPath);
    }
  } catch (error) {
    console.error('Error generating static site:', error);
    process.exit(1);
  }
}

module.exports = generateStaticSite;
