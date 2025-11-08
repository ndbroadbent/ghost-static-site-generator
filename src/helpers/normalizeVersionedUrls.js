const fs = require('fs');
const path = require('path');

/**
 * Normalize versioned URLs in HTML files
 * Converts: /path/file.css?v=abc123 -> /path/file.abc123.css
 */
function normalizeVersionedUrls(dir) {
  console.log('Normalizing versioned URLs in HTML files...');
  
  let filesProcessed = 0;
  let urlsReplaced = 0;
  
  function processFile(filePath) {
    if (!filePath.endsWith('.html')) {
      return;
    }
    
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    // Match URLs with ?v= query strings
    // Matches: href="/path/file.ext?v=version" or src="/path/file.ext?v=version"
    const regex = /((?:href|src)=["'])([^"'?]+\.(css|js|woff2?|ttf|eot|otf))(\?v=([a-f0-9]+))(["'])/g;
    
    content = content.replace(regex, (match, prefix, filePath, ext, query, version, suffix) => {
      modified = true;
      urlsReplaced++;
      
      // Get the base name and directory
      const parsedPath = path.posix.parse(filePath);
      const newPath = path.posix.join(
        parsedPath.dir,
        `${parsedPath.name}.${version}${parsedPath.ext}`
      );
      
      return `${prefix}${newPath}${suffix}`;
    });
    
    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      filesProcessed++;
    }
  }
  
  function traverse(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        traverse(fullPath);
      } else if (entry.isFile()) {
        processFile(fullPath);
      }
    }
  }
  
  traverse(dir);
  
  console.log(`Normalized ${urlsReplaced} versioned URLs in ${filesProcessed} HTML files\n`);
}

module.exports = normalizeVersionedUrls;
