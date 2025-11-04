const fs = require('fs');
const path = require('path');
const OPTIONS = require('../../constants/OPTIONS');
const crawlPageAsyncHelper = require('../crawlPageAsyncHelper');

const crawlHistory = new Set();

/**
 * Helper function to sleep for a specified time
 */
const sleep = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

/**
 * Find all HTML files in a directory recursively
 */
const findHtmlFiles = (dir) => {
  const results = [];
  const files = fs.readdirSync(dir);

  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      results.push(...findHtmlFiles(filePath));
    } else if (file.endsWith('.html')) {
      results.push(filePath);
    }
  });

  return results;
};

/**
 * Extract social image URLs from HTML content
 */
const extractSocialImages = (content) => {
  const images = new Set();
  const metaTagRegex =
    /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["'][^>]*>/g;
  let match = metaTagRegex.exec(content);

  while (match !== null) {
    images.add(match[1]);
    match = metaTagRegex.exec(content);
  }

  return Array.from(images);
};

/**
 * Process a single social image URL
 */
const processSocialImage = async (originalUrl) => {
  let imageUrl = originalUrl;

  // Handle relative URLs
  if (imageUrl.startsWith('/')) {
    imageUrl = `${OPTIONS.SOURCE_DOMAIN}${imageUrl}`;
  } else if (
    !imageUrl.startsWith('http://') &&
    !imageUrl.startsWith('https://')
  ) {
    imageUrl = `${OPTIONS.SOURCE_DOMAIN}/${imageUrl}`;
  } else if (imageUrl.includes(OPTIONS.PRODUCTION_DOMAIN)) {
    // Replace the production domain with the source domain if needed
    imageUrl = imageUrl.replace(
      OPTIONS.PRODUCTION_DOMAIN,
      OPTIONS.SOURCE_DOMAIN,
    );
  }

  if (crawlHistory.has(imageUrl)) return;

  // Skip external URLs (only download images hosted on our domain)
  if (!imageUrl.startsWith(OPTIONS.SOURCE_DOMAIN)) {
    console.log(`Skipping external social image: ${imageUrl}`);
    return;
  }

  // Fetch the image
  crawlPageAsyncHelper(imageUrl);
  crawlHistory.add(imageUrl);

  // Add a small delay between image fetches to prevent overwhelming the system
  await sleep(100);
};

/**
 * Process a batch of HTML files
 */
const processBatch = async (files) => {
  const processFile = async (file) => {
    const content = fs.readFileSync(file, 'utf8');
    const socialImages = extractSocialImages(content);
    return Promise.all(socialImages.map(processSocialImage));
  };

  return Promise.all(files.map(processFile));
};

/**
 * Process all HTML files in batches
 */
const processAllFiles = async (htmlFiles) => {
  const BATCH_SIZE = 10;
  const batches = Array.from(
    { length: Math.ceil(htmlFiles.length / BATCH_SIZE) },
    (_, i) => htmlFiles.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE),
  );

  return batches.reduce(async (promise, batch) => {
    await promise;
    await processBatch(batch);
    return sleep(500);
  }, Promise.resolve());
};

/**
 * This helper fetches all the images for og:image and
 * twitter:image meta tags (only for productionDomain)
 */
const socialImagesHelper = async () => {
  try {
    // Find all HTML files
    const htmlFiles = findHtmlFiles(OPTIONS.STATIC_DIRECTORY);
    await processAllFiles(htmlFiles);
  } catch (error) {
    console.error('Error in socialImagesHelper:', error);
    throw error;
  }
};

module.exports = socialImagesHelper;
