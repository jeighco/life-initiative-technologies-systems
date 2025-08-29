#!/bin/bash

set -e

echo "🚀 Xcode Cloud: Installing CocoaPods dependencies..."
echo "📍 Current directory: $(pwd)"
echo "📁 Repository contents:"
ls -la

# Navigate to iOS directory
echo "🔄 Navigating to FreshMusicApp/ios..."
cd FreshMusicApp/ios

echo "📍 Now in directory: $(pwd)"
echo "📁 iOS directory contents:"
ls -la

# Check if Podfile exists
if [ ! -f "Podfile" ]; then
    echo "❌ ERROR: Podfile not found!"
    exit 1
fi

echo "✅ Podfile found"

# Install CocoaPods dependencies
echo "📦 Running pod install..."
pod install --verbose

# Verify pod install worked
if [ -d "Pods" ]; then
    echo "✅ Pods directory created successfully"
    echo "📁 Pods contents:"
    ls -la Pods/ | head -10
else
    echo "❌ ERROR: Pods directory not created!"
    exit 1
fi

if [ -f "Pods/Target Support Files/Pods-FreshMusicApp/Pods-FreshMusicApp.release.xcconfig" ]; then
    echo "✅ CocoaPods configuration file found!"
else
    echo "❌ ERROR: CocoaPods configuration file missing!"
    exit 1
fi

echo "✅ CocoaPods installation complete!"
