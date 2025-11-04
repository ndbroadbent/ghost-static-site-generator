![Version](https://img.shields.io/badge/version-v2.0.0-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D%2012.0.0-brightgreen.svg)
![License](https://img.shields.io/github/license/Fried-Chicken/ghost-static-site-generator.svg)
![Stars](https://img.shields.io/github/stars/Fried-Chicken/ghost-static-site-generator.svg)
![Forks](https://img.shields.io/github/forks/Fried-Chicken/ghost-static-site-generator.svg)
![Issues](https://img.shields.io/github/issues/Fried-Chicken/ghost-static-site-generator.svg)

# ghost-static-site-generator

A highly optimized tool for generating static sites from [ghost](https://ghost.org/) blogs. This is based loosely on [buster](https://github.com/axitkhurana/buster) but since that project has been abandoned I've decided to create a new tool.

There are many reasons for wanting to generate a static site. For example security benefits and speed. It's also possible to integrate this tool into a continuous integration process and deploy the generated site.

## ⚡ Major Performance Improvements (v2.0)

This fork has been completely rewritten in TypeScript with intelligent caching and concurrent fetching:

### Key Improvements

- **99%+ Cache Hit Rate** - Uses HTTP ETags and Last-Modified headers for conditional requests
- **7x Faster Subsequent Runs** - Only downloads changed content (first run ~35s, subsequent runs ~4s)
- **Concurrent Fetching** - Parallel downloads with configurable rate limiting (default: 10 concurrent requests)
- **Smart Graph Traversal** - Maintains a graph of URL relationships to avoid re-parsing unchanged pages
- **File Existence Validation** - Automatically re-downloads missing files even if cached
- **Comprehensive Parsing**:
  - HTML `href` and `src` attributes
  - HTML `srcset` for responsive images
  - CSS `url()` declarations for assets
  - Sitemap integration to ensure no pages are missed
- **Automatic Cleanup** - Removes orphaned files when links are deleted
- **Precise Downloads** - Only fetches resources actually referenced in your content (no duplicates)
- **Binary File Support** - Properly handles videos, images, fonts, and other binary assets

### Technical Details

The new implementation uses:

- **CacheManager** - Persistent ETag/Last-Modified storage in `.gssg-cache/manifest.json`
- **GraphCache** - URL relationship graph in `.gssg-cache/graph.json`
- **SmartFetcher** - HTTP client with conditional request support
- **ConcurrentCrawler** - Parallel URL traversal with error tracking
- **FeedParser** - Parses HTML, CSS, and XML sitemaps

### Migration Notes

The wget-based implementation has been replaced with a pure Node.js/TypeScript solution. No external dependencies required!

## Prerequisites

You need to have the following installed:

- Node.js >= 14 LTS
- npm or yarn

## Installation

```bash
git clone https://github.com/ndbroadbent/ghost-static-site-generator/
cd ghost-static-site-generator
npm install
npm run build  # Compile TypeScript
```

## Usage

By default the tool will connect to `http://localhost:2368` and generate a `static` folder in the current directory.

```bash
./fetch.sh
```

Or run directly:

```bash
node src/index.js
```

### Preview the static site locally

```bash
./serve-static.sh
# Opens http://localhost:8000
```

**NOTE:** Themes other than Casper aren't fully supported. If you use another theme, you _might_ have to manually copy the `assets/built/THEME-NAME.js` file from your server.
**NOTE:** Tested with Ghost 5.x

## Recipes

Assuming you are hosting locally on `http://localhost:2368` and your domain is `http://www.myblog.com` then you can run the following. You need to pass the url flag because all links need to be replaced with your domain name instead of localhost

```
$ node src\index.js --productionDomain http://www.myblog.com
```

Assuming you are hosting remotely on `http://www.myhiddenserver.com:4538` and your domain is `http://www.myblogbucket.com` then you can run the following. You need to pass the url flag because all links need to be replaced with your domain name instead of localhost

```
$ node src\index.js --domain http://www.myhiddenserver.com:4538 --productionDomain http://www.myblog.com
```

Assuming you are hosting remotely on `http://www.myhiddenserver.com:4538` and you want to pull into a separate folder instead of static you can use the following command

```
$ node src\index.js --domain http://www.myhiddenserver.com:4538 --dest myblog-static-folder
```

## API

### Generating a static site

This assumes that your site is running locally at `http://localhost:2368` and will output to a folder called static.

```
$ node src\index.js
```

### Generate static site from a custom domain

If your site is not hosted locally you can use the `--domain` flag to target the your site.

```
$ node src\index.js --domain "http://localhost:2369"
```

### Generate static site to a custom folder

To change the folder that the static site is generated into using the `--dest` flag.

```
$ node src\index.js --dest "myStaticSiteFolder"
```

### Preview site

This will generated the site and then open the site in a new browser window. Please note: If you want to preview the site then the `--productionDomain` flag is ignored. This is because the links need to replace with the preview server's url.

```
$ node src\index.js --preview
```

### Replace url

Use this flag to replace the url, use this option if your site url differs to your ghost url

```
$ node src\index.js --productionDomain 'http://www.mydomain.com'
```

### Hosting a site in sub directories

Use this flag in conjunction with the `--dest` flag to host sites in directories. This flag will replace all relative path urls with absolute path urls

```
$ node src\index.js --dest 'a-random-folder' --subDir 'a-random-folder'
```

### Concurrency

Configure the number of parallel requests (default: 10)

```
$ node src/index.js --concurrency 20
```

### Fail on error

This option will exit with an error if any broken links or 404s are detected.

```
$ node src\index.js --fail-on-error
```

### Ignore Absolute Paths

This option is intended for users who do no worry about SEO. This option will make your site truly relative and swap out all domain names for relative paths.

```
$ node src\index.js --ignore-absolute-paths
```

### Clear cache

To force a fresh download (ignoring ETags), delete the cache:

```bash
rm -rf .gssg-cache/*
```

## Contributing

This is still a work in progress, please feel free to contribute by raising issues or creating pr's.
