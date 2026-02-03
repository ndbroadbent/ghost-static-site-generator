import * as fs from 'fs';
import * as path from 'path';

const GISCUS_SCRIPT = `<script src="https://giscus.app/client.js"
        data-repo="ndbroadbent/ndbroadbent.github.io"
        data-repo-id="MDEwOlJlcG9zaXRvcnkyMzg2MDY4"
        data-category="Announcements"
        data-category-id="DIC_kwDOACRolM4C1za3"
        data-mapping="pathname"
        data-strict="0"
        data-reactions-enabled="1"
        data-emit-metadata="0"
        data-input-position="bottom"
        data-theme="preferred_color_scheme"
        data-lang="en"
        crossorigin="anonymous"
        async>
</script>
<noscript>Please enable JavaScript to view comments.</noscript>`;

const GISCUS_CONTAINER = `<div class="gh-comments gh-canvas">
        <div class="giscus"></div>
        ${GISCUS_SCRIPT}
    </div>`;

// Regex to match the entire Disqus block
const DISQUS_BLOCK_REGEX = /<div class="gh-comments gh-canvas">\s*<div id="disqus_thread"><\/div>\s*<script>[\s\S]*?<\/script>\s*<noscript>[\s\S]*?<\/noscript>\s*<\/div>/g;

// Regex to match #disqus_thread CSS and replace with .giscus
const DISQUS_CSS_REGEX = /#disqus_thread\s*\{([^}]*)\}/g;

export function replaceDisqusWithGiscus(staticDir: string): void {
  console.log('Replacing Disqus with Giscus...');
  let replacedCount = 0;

  const processFile = (filePath: string) => {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    // Replace Disqus HTML block with Giscus
    if (DISQUS_BLOCK_REGEX.test(content)) {
      content = content.replace(DISQUS_BLOCK_REGEX, GISCUS_CONTAINER);
      modified = true;
      replacedCount++;
    }

    // Replace #disqus_thread CSS with .giscus
    if (DISQUS_CSS_REGEX.test(content)) {
      content = content.replace(DISQUS_CSS_REGEX, '.giscus {$1}');
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
    }
  };

  const processDirectory = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== '.git') {
        processDirectory(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.html')) {
        processFile(fullPath);
      }
    }
  };

  processDirectory(staticDir);
  console.log(`Replaced Disqus with Giscus in ${replacedCount} files\n`);
}

module.exports = { replaceDisqusWithGiscus };
