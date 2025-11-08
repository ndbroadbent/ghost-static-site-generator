# Claude Code Instructions for madebynathan.com

## Important: Cache Management

**CRITICAL:** When making changes to the crawler, fetcher, or any code that affects how URLs are processed or files are saved, you MUST clear the cache first:

```bash
rm -rf .gssg-cache/
```

This ensures the new logic is applied from scratch and prevents issues with stale cache entries.

## Project Structure

This is a static site generator that crawls a Ghost blog and generates a static site for deployment to GitHub Pages.

### Key Components

- **Crawler** (`src/crawlers/ConcurrentCrawler.ts`) - Handles crawling and building the dependency graph
- **Fetcher** (`src/fetchers/SmartFetcher.ts`) - Smart HTTP fetching with ETag caching
- **Graph Cache** (`src/cache/GraphCache.ts`) - Stores the dependency graph (URL -> links/resources)
- **Cache Manager** (`src/cache/CacheManager.ts`) - Stores ETags and last-modified headers

### How It Works

1. Fetches sitemaps to get all known URLs
2. Crawls from root URL, discovering all linked pages and resources
3. Builds a dependency graph (DAG) of all reachable URLs
4. Automatically fetches video thumbnails (Ghost generates `_thumb.jpg` for all videos)
5. Handles versioned assets by converting `file.css?v=abc123` to `file.abc123.css`
6. After crawling, compares files on disk with the DAG
7. Deletes only unreachable files (not in the DAG)
8. Post-processes HTML to normalize versioned URLs

### Versioned Assets

Assets with version query strings are handled specially:
- URL: `/assets/built/screen.css?v=6cb839dcac`
- Saved as: `static/assets/built/screen.6cb839dcac.css`
- HTML is post-processed to update references

### File Exclusions

These files/directories are excluded from cleanup (added by post-processing):
- `CNAME`
- `404.html`
- `sudoblock/`
- `.git/`
- `pubkey_38E63C0A.txt`
- All hidden files (`.DS_Store`, `.gitignore`, etc.)

### Running the Build

```bash
./fetch.sh
```

This will:
1. Clone the GitHub Pages repo if needed
2. Run the crawler to fetch all content
3. Finalize the dependency graph and clean up unreachable files
4. Run post-processing (404 page, versioned URLs, domain replacement)
5. Copy additional files (CNAME, sudoblock)
