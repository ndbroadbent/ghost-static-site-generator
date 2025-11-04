const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const OPTIONS = require('../../constants/OPTIONS');

const copy404PageHelper = async () => {
  try {
    // Fetch the 404 page by requesting a non-existent URL
    const response = await fetch(`${OPTIONS.SOURCE_DOMAIN}/this-page-does-not-exist-404`);

    if (response.ok || response.status === 404) {
      const html = await response.text();
      const outputPath = path.resolve(
        process.cwd(),
        `${OPTIONS.STATIC_DIRECTORY}/404.html`,
      );
      fs.writeFileSync(outputPath, html, 'utf8');
      console.log('✓ Saved 404 page');
    } else {
      console.error(`Failed to fetch 404 page: ${response.status}`);
    }
  } catch (error) {
    console.error('Error fetching 404 page:', error);
  }
};

module.exports = copy404PageHelper;
