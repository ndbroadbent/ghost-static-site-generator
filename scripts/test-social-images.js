const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const OPTIONS = require('../src/constants/OPTIONS');
const socialImagesHelper = require('../src/helpers/socialImagesHelper/socialImagesHelper');

const TEST_URL =
  'https://blog.ndbroadbent.com/2025/03/22/home-automation-highlights/';
const TEST_DIR = path.join(process.cwd(), 'test-static');

async function main() {
  try {
    // Create test directory
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }

    // Save original OPTIONS
    const originalStaticDir = OPTIONS.STATIC_DIRECTORY;
    const originalSourceDomain = OPTIONS.SOURCE_DOMAIN;

    // Override OPTIONS for testing
    OPTIONS.STATIC_DIRECTORY = TEST_DIR;
    OPTIONS.SOURCE_DOMAIN = 'https://blog.ndbroadbent.com';

    // Download the test page
    console.log('Downloading test page...');
    execSync(
      `wget -q --recursive --no-parent --no-host-directories --directory-prefix ${TEST_DIR} ${TEST_URL}`,
    );

    // Verify the page was downloaded
    const downloadedFile = path.join(
      TEST_DIR,
      '2025/03/22/home-automation-highlights/index.html',
    );
    console.log('Checking if file exists:', downloadedFile);
    console.log('File exists:', fs.existsSync(downloadedFile));

    if (fs.existsSync(downloadedFile)) {
      const content = fs.readFileSync(downloadedFile, 'utf8');
      console.log(
        'File content contains meta tags:',
        content.includes('og:image') || content.includes('twitter:image'),
      );

      // Print all meta tags for inspection
      console.log('\nMeta tags found:');
      const metaTags = content.match(/<meta[^>]+>/g) || [];
      metaTags.forEach((tag) => {
        if (tag.includes('og:image') || tag.includes('twitter:image')) {
          console.log(tag);
        }
      });
    }

    // Run the helper
    console.log('\nRunning socialImagesHelper...');
    await socialImagesHelper();

    // Check if images were downloaded
    const imagesDir = path.join(TEST_DIR, 'content/images');
    console.log('\nChecking images directory:', imagesDir);
    console.log('Directory exists:', fs.existsSync(imagesDir));

    if (fs.existsSync(imagesDir)) {
      const images = fs.readdirSync(imagesDir);
      console.log('Downloaded images:', images);
    }

    // Verify specific images were downloaded
    const expectedImages = [
      '2025/03/Screenshot-2025-03-22-at-5.51.13-PM-3.png',
      '2025/03/colored-house-lights.png',
    ];

    let allImagesFound = true;
    expectedImages.forEach((image) => {
      const imagePath = path.join(imagesDir, image);
      console.log('\nChecking image:', imagePath);
      console.log('Image exists:', fs.existsSync(imagePath));
      if (!fs.existsSync(imagePath)) {
        allImagesFound = false;
      }
    });

    // Restore original OPTIONS
    OPTIONS.STATIC_DIRECTORY = originalStaticDir;
    OPTIONS.SOURCE_DOMAIN = originalSourceDomain;

    if (!allImagesFound) {
      console.error('\n❌ Some expected images were not downloaded');
      console.log('\nTest directory kept for inspection at:', TEST_DIR);
      process.exit(1);
    }

    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.log('\nTest directory kept for inspection at:', TEST_DIR);
    process.exit(1);
  }
}

main();
