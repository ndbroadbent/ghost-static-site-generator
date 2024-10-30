#!/bin/bash
set -e

rm -rf static/*
./fetch.sh

(
  \cd static || exit
  git add .
  git commit -m "Update static files"
  git push origin gh-pages
)

./purge_cloudflare_cache
