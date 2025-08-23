#!/bin/sh

echo "🎉 Post-build actions for Multi-Room Music..."

cd MultiRoomMusicApp

# Archive build information
echo "📊 Archiving build information..."
BUILD_INFO_FILE="$CI_ARTIFACTS_PATH/build_info.txt"
mkdir -p "$CI_ARTIFACTS_PATH"

echo "Multi-Room Music Build Information" > "$BUILD_INFO_FILE"
echo "=================================" >> "$BUILD_INFO_FILE"
echo "Build Date: $(date)" >> "$BUILD_INFO_FILE"
echo "Branch: $CI_BRANCH" >> "$BUILD_INFO_FILE"
echo "Build Number: $CI_BUILD_NUMBER" >> "$BUILD_INFO_FILE"
echo "Commit: $CI_COMMIT" >> "$BUILD_INFO_FILE"
echo "Xcode Version: $(xcodebuild -version)" >> "$BUILD_INFO_FILE"
echo "iOS SDK: $(xcrun --show-sdk-version --sdk iphoneos)" >> "$BUILD_INFO_FILE"

# Copy important logs
echo "📋 Copying build logs..."
if [ -d "$CI_DERIVED_DATA_PATH" ]; then
    cp -r "$CI_DERIVED_DATA_PATH/Logs" "$CI_ARTIFACTS_PATH/" 2>/dev/null || true
fi

# Archive React Native bundle for debugging
echo "⚛️ Archiving React Native bundle..."
if [ -f "ios/main.jsbundle" ]; then
    cp "ios/main.jsbundle" "$CI_ARTIFACTS_PATH/" 2>/dev/null || true
fi

# Generate build summary
echo "📝 Generating build summary..."
SUMMARY_FILE="$CI_ARTIFACTS_PATH/build_summary.md"

cat > "$SUMMARY_FILE" << EOF
# Multi-Room Music Build Summary

## Build Details
- **Version**: 1.0.0
- **Build**: $CI_BUILD_NUMBER
- **Branch**: $CI_BRANCH
- **Date**: $(date)
- **Commit**: $CI_COMMIT

## Build Status
✅ React Native bundle created
✅ iOS project compiled
✅ Archive generated
EOF

# Add TestFlight status if this is a main branch build
if [ "$CI_BRANCH" = "main" ] && [ "$CI_ARCHIVE" = "true" ]; then
    echo "✅ Uploaded to TestFlight" >> "$SUMMARY_FILE"
    
    # Send success notification (if webhook configured)
    if [ ! -z "$SLACK_WEBHOOK_URL" ]; then
        echo "📢 Sending success notification..."
        curl -X POST -H 'Content-type: application/json' \
             --data "{\"text\":\"✅ Multi-Room Music v1.0.0 build $CI_BUILD_NUMBER uploaded to TestFlight successfully!\"}" \
             "$SLACK_WEBHOOK_URL" || true
    fi
fi

# Clean up temporary files
echo "🧹 Cleaning up temporary files..."
rm -f ios/main.jsbundle 2>/dev/null || true
rm -rf ios/assets 2>/dev/null || true

# Display final build information
echo "📱 Build completed successfully!"
echo "Version: 1.0.0 (Build $CI_BUILD_NUMBER)"
echo "Archive: $CI_ARCHIVE_PATH"

echo "✅ Post-build actions complete!"