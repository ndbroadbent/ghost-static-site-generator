#!/bin/bash
set -e

if ! [ -d "static" ]; then
  git clone git@github.com:ndbroadbent/ndbroadbent.github.io.git static
  cd static
  git checkout gh-pages
  cd ..
fi
node src/index.js --domain https://blog.home.ndbroadbent.com --productionDomain https://madebynathan.com

echo madebynathan.com > static/CNAME
cp pubkey_38E63C0A.txt static/

# Update static_overrides from source repos (when available)
# This keeps static_overrides/ as the checked-in source of truth
WHOV_SOURCE="/Users/ndbroadbent/code/world_history_of_value/dist"
WHOV_OVERRIDE="static_overrides/world_history_of_value"
if [ -d "$WHOV_SOURCE" ]; then
  echo "Updating static_overrides from World History of Value source repo..."
  mkdir -p "$WHOV_OVERRIDE"
  cp "$WHOV_SOURCE/index.html" "$WHOV_OVERRIDE/index.html"
  echo "  ✓ Copied index.html to $WHOV_OVERRIDE/"
else
  echo "World History of Value source not found at $WHOV_SOURCE (using checked-in override)"
fi

# Apply static overrides (custom pages that replace Ghost stubs)
# This must run AFTER scrape but BEFORE analytics injection
echo ""
echo "=== Applying static overrides ==="
python3 scripts/apply_static_overrides.py

# Inject Plausible analytics into all HTML files
# This must run AFTER static overrides so analytics are added to overridden pages
python3 scripts/inject_analytics.py static

# Smoke test: ensure no blog.home.ndbroadbent.com references remain
echo ""
echo "=== Running validations ==="
echo "Checking for remaining blog.home.ndbroadbent.com references..."
if rg -q "blog\.home\.ndbroadbent" static; then
  echo "❌ ERROR: Found remaining blog.home.ndbroadbent.com references:"
  rg "blog\.home\.ndbroadbent" static -l | head -20
  exit 1
else
  echo "✓ No blog.home.ndbroadbent.com references found"
fi

# Validation: ensure all HTML pages include Plausible analytics
echo "Checking Plausible analytics script inclusion..."
MISSING_ANALYTICS=$(find static -name "*.html" -type f ! -path "static/rss/*" -exec grep -L "pa-BcRrHMb-WDJL_dgiM5A81" {} \;)
if [ -n "$MISSING_ANALYTICS" ]; then
  echo "❌ ERROR: The following HTML files are missing Plausible analytics:"
  echo "$MISSING_ANALYTICS" | head -20
  exit 1
else
  echo "✓ All HTML pages include Plausible analytics"
fi

# Validation: ensure no stub placeholders remain
# These indicate a post-build step failed to replace Ghost content
# Exclude rss/ since RSS feeds naturally mirror Ghost content including stubs
echo "Checking for unreplaced stub placeholders..."
STUB_MESSAGE="This content should have been replaced by a post-build step"
if rg -q "$STUB_MESSAGE" static -g '!**/rss/**'; then
  echo "❌ ERROR: Found unreplaced stub placeholder(s)!"
  echo "   The following files contain content that should have been replaced:"
  rg -l "$STUB_MESSAGE" static -g '!**/rss/**'
  echo ""
  echo "   This usually means:"
  echo "   1. A static override is missing from static_overrides/"
  echo "   2. The source file doesn't exist"
  echo "   3. The manifest.json destination path is wrong"
  exit 1
else
  echo "✓ No unreplaced stub placeholders found"
fi

echo ""
echo "=== All validations passed ==="
