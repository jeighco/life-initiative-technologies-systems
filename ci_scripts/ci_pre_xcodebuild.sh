#!/bin/sh

echo "🔧 Pre-build setup for Multi-Room Music..."

cd MultiRoomMusicApp

# Verify React Native bundle is ready
echo "⚛️ Preparing React Native bundle..."
npx react-native bundle \
  --platform ios \
  --dev false \
  --entry-file index.js \
  --bundle-output ios/main.jsbundle \
  --assets-dest ios/assets/

# Set dynamic version based on CI environment
if [ "$CI_BRANCH" = "main" ]; then
    BUILD_NUMBER=$CI_BUILD_NUMBER
    VERSION_SUFFIX=""
elif [ "$CI_BRANCH" = "develop" ]; then
    BUILD_NUMBER="$CI_BUILD_NUMBER"
    VERSION_SUFFIX="-dev"
else
    BUILD_NUMBER="$CI_BUILD_NUMBER"
    VERSION_SUFFIX="-$CI_BRANCH"
fi

echo "📱 Setting build version: 1.0.0$VERSION_SUFFIX ($BUILD_NUMBER)"

# Update build settings
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString 1.0.0$VERSION_SUFFIX" ios/MultiRoomMusicApp/Info.plist
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD_NUMBER" ios/MultiRoomMusicApp/Info.plist

# Verify critical files exist
echo "🔍 Verifying build files..."
if [ ! -f "ios/MultiRoomMusicApp/Info.plist" ]; then
    echo "❌ Info.plist not found!"
    exit 1
fi

if [ ! -f "ios/MultiRoomMusicApp.xcworkspace/contents.xcworkspacedata" ]; then
    echo "❌ Xcode workspace not found!"
    exit 1
fi

# Check for required certificates
echo "🔐 Checking code signing setup..."
security find-identity -v -p codesigning

echo "✅ Pre-build setup complete!"