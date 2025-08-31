#!/bin/bash

# Sync Ghost content from Proxmox container to local
# Ghost container IP: 10.5.7.140

echo "Syncing Ghost content from container..."

# Sync all content directories (excluding our dev theme)
rsync -avz --progress \
  --exclude='themes/source-featureimage' \
  root@10.5.7.140:/var/www/ghost/content/ \
  ghost-local/content/

echo "Sync complete!"
echo ""
echo "Note: You may need to:"
echo "1. Ensure you have SSH access to the container"
echo "2. Adjust the path if Ghost is installed elsewhere"
echo "3. The default Ghost content path in containers is usually /var/lib/ghost/content"