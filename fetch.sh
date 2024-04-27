#!/bin/bash
set -e

if ! [ -d "static" ]; then
  git clone git@github.com:ndbroadbent/ndbroadbent.github.io.git static
  git checkout gh-pages
fi
node src/index.js --domain https://blog.ndbroadbent.com --productionDomain https://madebynathan.com

# Replace all remaining instances of https://blog.ndbroadbent.com with https://madebynathan.com in static files
grep -rl "https://blog.ndbroadbent.com" --include \*.html static | xargs sed -i '' 's/https:\/\/blog.ndbroadbent.com/https:\/\/madebynathan.com/g'

echo madebynathan.com > static/CNAME
cp pubkey_38E63C0A.txt static/
cp -R sudoblock static/
