#!/bin/bash

# Quick script to start Ghost development server

if [ ! -d "ghost-local" ]; then
    echo "Ghost not installed yet. Running setup first..."
    ./setup-ghost-dev.sh
fi

echo "Starting Ghost development server..."
pnpm ghost:start

echo ""
echo "Ghost is running at: http://localhost:2368"
echo "Admin panel: http://localhost:2368/ghost"
echo ""
echo "To activate your theme:"
echo "1. Go to http://localhost:2368/ghost"
echo "2. Navigate to Settings → Design → Change theme"
echo "3. Select 'source-featureimage'"
echo ""
echo "To stop Ghost: pnpm ghost:stop"