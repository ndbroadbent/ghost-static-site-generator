#!/bin/bash
set -e

echo "Setting up local Ghost development server..."

# Install dependencies including ghost-cli
echo "Installing dependencies with pnpm..."
pnpm install

# Create ghost-local directory if it doesn't exist
if [ ! -d "ghost-local" ]; then
    echo "Creating ghost-local directory..."
    mkdir ghost-local
fi

# Install Ghost locally
echo "Installing Ghost locally (this may take a few minutes)..."
cd ghost-local
pnpm exec ghost install local
cd ..

# Create symlink to theme in Ghost's themes directory
if [ -d "ghost-local/content/themes" ]; then
    echo "Creating symlink to source-featureimage theme..."
    cd ghost-local/content/themes
    ln -sf ../../../themes/source-featureimage source-featureimage
    cd ../../..
    
    echo ""
    echo "✅ Ghost development server setup complete!"
    echo ""
    echo "To start Ghost, run one of:"
    echo "  pnpm ghost:start"
    echo "  npm run ghost:start"
    echo ""
    echo "To stop Ghost:"
    echo "  pnpm ghost:stop"
    echo ""
    echo "Ghost will be available at: http://localhost:2368"
    echo "Admin panel: http://localhost:2368/ghost"
    echo ""
    echo "Your theme is symlinked - changes will be reflected immediately"
else
    echo "❌ Error: Ghost installation may have failed"
    echo "Try removing ghost-local and running again:"
    echo "  rm -rf ghost-local"
    echo "  ./setup-ghost-dev.sh"
    exit 1
fi
