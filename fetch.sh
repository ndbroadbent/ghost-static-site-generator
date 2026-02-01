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
cp -R sudoblock static/

# Replace world history of value stub page with actual visualization
rm -rf static/2026/02/02/world-history-of-value
mkdir -p static/2026/02/02/world-history-of-value
cp -R /Users/ndbroadbent/code/world_history_of_value/dist/* static/2026/02/02/world-history-of-value/

# Smoke test: ensure no blog.home.ndbroadbent.com references remain
echo "Running smoke test for remaining blog.home.ndbroadbent.com references..."
if rg -q "blog\.home\.ndbroadbent" static; then
  echo "❌ ERROR: Found remaining blog.home.ndbroadbent.com references:"
  rg "blog\.home\.ndbroadbent" static -l | head -20
  exit 1
else
  echo "✓ Smoke test passed: no blog.home.ndbroadbent.com references found"
fi

