#!/bin/bash
# Fix script for sharp module on macOS
# Run this script on macOS to fix sharp installation issues

echo "Fixing sharp module installation for macOS..."

# Remove existing sharp installation
echo "Removing existing sharp installation..."
rm -rf node_modules/sharp
rm -rf node_modules/@img

# Reinstall sharp with platform-specific binaries
echo "Installing sharp with macOS binaries..."
npm install --include=optional sharp

# Rebuild for both x64 and arm64 architectures
echo "Rebuilding sharp for darwin-x64..."
npm rebuild sharp --platform=darwin --arch=x64 || true

echo "Rebuilding sharp for darwin-arm64..."
npm rebuild sharp --platform=darwin --arch=arm64 || true

echo ""
echo "Sharp installation fix complete!"
echo "If you still encounter issues, try:"
echo "  npm install --os=darwin --cpu=x64 sharp"
echo "  npm install --os=darwin --cpu=arm64 sharp"

