import * as fs from 'fs';
import * as path from 'path';
import pLimit from 'p-limit';
import { SmartFetcher } from '../../fetchers/SmartFetcher';

const OPTIONS = require('../../constants/OPTIONS');

const findHtmlFiles = (dir: string): string[] => {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const results: string[] = [];
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

const extractSocialImages = (content: string): string[] => {
  const images = new Set<string>();
  const metaTagRegex =
    /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["'][^>]*>/g;
  let match = metaTagRegex.exec(content);

  while (match !== null) {
    images.add(match[1]);
    match = metaTagRegex.exec(content);
  }

  return Array.from(images);
};

const processSocialImage = async (
  originalUrl: string,
  fetcher: SmartFetcher,
  crawlHistory: Set<string>,
): Promise<void> => {
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
    imageUrl = imageUrl.replace(
      OPTIONS.PRODUCTION_DOMAIN,
      OPTIONS.SOURCE_DOMAIN,
    );
  }

  if (crawlHistory.has(imageUrl)) return;

  // Skip external URLs (only download images hosted on our domain)
  if (!imageUrl.startsWith(OPTIONS.SOURCE_DOMAIN)) {
    return;
  }

  crawlHistory.add(imageUrl);

  // Convert URL to file path
  const urlPath = imageUrl.replace(OPTIONS.SOURCE_DOMAIN, '');
  const outputPath = path.join(OPTIONS.STATIC_DIRECTORY, urlPath);

  await fetcher.fetchAndSave(imageUrl, outputPath);
};

async function socialImagesHelper(fetcher: SmartFetcher): Promise<void> {
  try {
    const htmlFiles = findHtmlFiles(OPTIONS.STATIC_DIRECTORY);
    console.log(
      `Scanning ${htmlFiles.length} HTML files for social images...\n`,
    );

    const crawlHistory = new Set<string>();
    const limit = pLimit(10);

    const processFile = async (file: string) => {
      const content = fs.readFileSync(file, 'utf8');
      const socialImages = extractSocialImages(content);

      await Promise.all(
        socialImages.map((imageUrl) =>
          limit(() => processSocialImage(imageUrl, fetcher, crawlHistory)),
        ),
      );
    };

    await Promise.all(htmlFiles.map(processFile));

    console.log(`\nProcessed ${crawlHistory.size} social images\n`);
  } catch (error) {
    console.error('Error in socialImagesHelper:', error);
    throw error;
  }
}

module.exports = socialImagesHelper;
