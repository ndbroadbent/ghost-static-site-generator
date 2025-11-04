import * as path from 'path';
import * as fs from 'fs';
import pLimit from 'p-limit';
import { SmartFetcher } from '../../fetchers/SmartFetcher';

const OPTIONS = require('../../constants/OPTIONS');

const imageSizes = ['w100', 'w300', 'w600', 'w1000', 'w2000'];

const getAllFileNames = (directory: string): string[] => {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const directoryContents = fs.readdirSync(directory);
  return directoryContents.reduce<string[]>((images, file) => {
    const filePath = path.resolve(directory, file);
    const stats = fs.lstatSync(filePath);

    if (stats.isDirectory()) {
      return [...images, ...getAllFileNames(filePath)];
    }

    images.push(filePath);
    imageSizes.forEach((imageSize) => {
      const imageSizeUrl = filePath.replace(
        'content/images/',
        `content/images/size/${imageSize}/`,
      );
      // Prevent recursive calling of size images that already exist
      if (/w[0-9]{3,5}.*w[0-9]{3,5}/g.test(imageSizeUrl)) {
        return;
      }
      images.push(imageSizeUrl);
    });

    return images;
  }, []);
};

async function responsiveImagesHelper(fetcher: SmartFetcher): Promise<void> {
  const contentPath = path.resolve(
    process.cwd(),
    `${OPTIONS.STATIC_DIRECTORY}/content`,
  );
  const allFiles = getAllFileNames(contentPath);
  const uniqueAllFiles = [...new Set(allFiles)];

  console.log(`Generating ${uniqueAllFiles.length} responsive image variants...\n`);

  const limit = pLimit(10);
  let downloaded = 0;

  await Promise.all(
    uniqueAllFiles.map((filePath) =>
      limit(async () => {
        const url = filePath.replace(
          OPTIONS.ABSOLUTE_STATIC_DIRECTORY,
          OPTIONS.SOURCE_DOMAIN,
        );

        const wasDownloaded = await fetcher.fetchAndSave(url, filePath);
        if (wasDownloaded) {
          downloaded++;
        }
      })
    )
  );

  console.log(`\nDownloaded ${downloaded} new responsive images\n`);
}

module.exports = responsiveImagesHelper;

