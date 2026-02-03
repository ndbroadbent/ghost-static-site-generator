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
# World History of Value visualization
# Only update if source repo exists; otherwise preserve existing files in static/
WHOV_SOURCE="/Users/ndbroadbent/code/world_history_of_value/dist"
WHOV_DEST="static/2026/02/01/world-history-of-value"
if [ -d "$WHOV_SOURCE" ]; then
  echo "Updating World History of Value from source repo..."
  rm -rf "$WHOV_DEST"
  mkdir -p "$WHOV_DEST"
  cp -R "$WHOV_SOURCE"/* "$WHOV_DEST"/
else
  echo "World History of Value source not found at $WHOV_SOURCE"
  echo "Preserving existing files in $WHOV_DEST (if any)"
fi

# Inject Plausible analytics into all HTML files
python3 scripts/inject_analytics.py static

# Smoke test: ensure no blog.home.ndbroadbent.com references remain
echo "Running smoke test for remaining blog.home.ndbroadbent.com references..."
if rg -q "blog\.home\.ndbroadbent" static; then
  echo "❌ ERROR: Found remaining blog.home.ndbroadbent.com references:"
  rg "blog\.home\.ndbroadbent" static -l | head -20
  exit 1
else
  echo "✓ Smoke test passed: no blog.home.ndbroadbent.com references found"
fi

# Validation: ensure all HTML pages include Plausible analytics
echo "Validating Plausible analytics script inclusion..."
MISSING_ANALYTICS=$(find static -name "*.html" -type f ! -path "static/rss/*" -exec grep -L "pa-BcRrHMb-WDJL_dgiM5A81" {} \;)
if [ -n "$MISSING_ANALYTICS" ]; then
  echo "❌ ERROR: The following HTML files are missing Plausible analytics:"
  echo "$MISSING_ANALYTICS" | head -20
  exit 1
else
  echo "✓ All HTML pages include Plausible analytics"
fi

