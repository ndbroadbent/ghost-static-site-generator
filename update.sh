#!/bin/bash
set -e

if ! [ -d "static" ]; then
  git clone git@github.com:ndbroadbent/ndbroadbent.github.io.git static
  git checkout gh-pages
fi
rm -rf static/*
node src/index.js --domain https://ghost.ndbroadbent.com --productionDomain https://madebynathan.com

# Replace all remaining instances of https://ghost.ndbroadbent.com with https://madebynathan.com in static files
grep -rl "https://ghost.ndbroadbent.com" static | xargs sed -i '' 's/https:\/\/ghost.ndbroadbent.com/https:\/\/madebynathan.com/g'

echo madebynathan.com > static/CNAME
cp pubkey_38E63C0A.txt static/
cp -R sudoblock static/

cd static || exit
git add .
git commit -m "Update static files"
git push origin gh-pages
