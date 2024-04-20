const { execSync } = require('child_process');
const { argv } = require('yargs');
const OPTIONS = require('../../constants/OPTIONS');

const path = require('path');
const fs = require('fs');
const crawlPageAsyncHelper = require('../crawlPageAsyncHelper');

const crawlHistory = new Set();
/**
 * This helper fetches all the images for og:image and twitter:image meta tags (only for productionDomain)
 */
const socialImagesHelper = () => {
  // Use grep to recursively find all the og/twitter image meta tags in .html files
  const socialImagesCommand = `grep -irn 'meta \\(name\\|property\\)="\\(og:image\\|twitter:image\\)".*\\(${OPTIONS.SOURCE_DOMAIN}\\|${OPTIONS.PRODUCTION_DOMAIN}\\)' --include \\*.html ${OPTIONS.STATIC_DIRECTORY}`;
  
  try {
    const socialImages = execSync(
      socialImagesCommand,
    ).toString();
    const socialImagesArray = socialImages.split('\n');

    socialImagesArray.forEach((socialImage) => {
      const imageUrlMatch = socialImage.match(/content="(.*)"/);
      if (!imageUrlMatch) return;
      let imageUrl = imageUrlMatch[1];

      // Replace the production domain with the source domain (if we're running on a previously generated site)
      imageUrl = imageUrl.replace(OPTIONS.PRODUCTION_DOMAIN, OPTIONS.SOURCE_DOMAIN);

      if (crawlHistory.has(imageUrl)) return;

      // Fetch the image
      crawlPageAsyncHelper(imageUrl);
      crawlHistory.add(imageUrl);
    });
  } catch (execSyncError) {
    console.error(execSyncError);
  }
};

module.exports = socialImagesHelper;
