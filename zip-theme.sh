#!/bin/bash

# Build and zip the source-featureimage theme for Ghost
cd themes/source-featureimage
pnpm run zip
cd ../..
cp themes/source-featureimage/dist/source.zip themes/source-featureimage.zip
echo "Theme built and zipped to themes/source-featureimage.zip"