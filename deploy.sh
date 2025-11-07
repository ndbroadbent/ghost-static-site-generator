#!/bin/bash
set -e

# rm -rf static/*
./fetch.sh

(
  \cd static || exit
  git add .

  # Check if there are actual changes to commit
  if git diff --cached --quiet; then
    echo "No content changes detected, skipping commit"
    exit 0
  fi

  git commit -m "Update static files"
  git push origin gh-pages
)

# ./purge_cloudflare_cache
