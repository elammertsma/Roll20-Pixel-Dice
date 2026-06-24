#!/bin/bash

# Extract version from manifest.json
VERSION=$(grep '"version":' manifest.json | head -1 | awk -F: '{ print $2 }' | sed 's/[", ]//g')

if [ -z "$VERSION" ]; then
    echo "Error: Could not find version in manifest.json"
    exit 1
fi

ZIP_NAME="pixels-dice-roll20-v$VERSION.zip"

echo "Creating release $ZIP_NAME from dist/ folder..."

# Ensure dist exists
if [ ! -d "dist" ]; then
    echo "Error: dist/ directory not found. Please run 'npm run build' first."
    exit 1
fi

# Remove old zip if it exists
rm -f "$ZIP_NAME"

# Zip the contents of dist/
# We cd into dist so the zip file contains the files directly at the root
cd dist
zip -r "../$ZIP_NAME" ./*
cd ..

echo "Done! $ZIP_NAME created."
