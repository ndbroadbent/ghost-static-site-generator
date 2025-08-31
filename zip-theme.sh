#!/bin/bash

# Zip the source-featureimage theme for Ghost
cd themes
rm -f source-featureimage.zip
zip -r source-featureimage.zip source-featureimage -x "*.DS_Store" -x "*__MACOSX*"
cd ..
echo "Theme zipped to themes/source-featureimage.zip"