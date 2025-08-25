#!/bin/bash

set -e

echo "🚀 Xcode Cloud: Installing CocoaPods dependencies..."

# Navigate to iOS directory
cd FreshMusicApp/ios

# Install CocoaPods dependencies
echo "📦 Running pod install..."
pod install

echo "✅ CocoaPods installation complete!"
