#!/bin/bash
set -e

cd static

echo "Serving static site at http://localhost:8000"
echo "Press Ctrl+C to stop"
echo ""

python3 -m http.server 8000

