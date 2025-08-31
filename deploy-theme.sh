#!/bin/bash

# Deploy theme to production Ghost server
# Ghost container IP: 10.5.7.140

THEME_NAME="source-featureimage"
LOCAL_THEME_PATH="themes/${THEME_NAME}"
REMOTE_THEME_PATH="/var/www/ghost/content/themes/${THEME_NAME}"
GHOST_CONTAINER_IP="10.5.7.140"

echo "Deploying ${THEME_NAME} theme to production..."

# Sync theme to production server
rsync -avz --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.DS_Store' \
  --exclude='*.map' \
  ${LOCAL_THEME_PATH}/ \
  root@${GHOST_CONTAINER_IP}:${REMOTE_THEME_PATH}/

if [ $? -eq 0 ]; then
    echo "✅ Theme deployed successfully!"
    echo ""
    echo "Fixing permissions..."
    
    # Fix theme ownership
    ssh root@${GHOST_CONTAINER_IP} "chown -R ghost:ghost ${REMOTE_THEME_PATH}"
    
    echo "Restarting Ghost to apply changes..."
    
    # Restart Ghost service on the container
    ssh root@${GHOST_CONTAINER_IP} "systemctl restart ghost_localhost"
    
    echo ""
    echo "🚀 Theme deployed and Ghost restarted!"
    echo "Visit https://madebynathan.com to see your changes"
else
    echo "❌ Deployment failed!"
    exit 1
fi