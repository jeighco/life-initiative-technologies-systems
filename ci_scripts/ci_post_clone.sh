#!/bin/sh

echo "🚀 Setting up Multi-Room Music build environment..."

# Set environment variables for consistent builds
export NODE_VERSION="18"
export RUBY_VERSION="3.1.0"

# Install Node.js if not available
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js ${NODE_VERSION}..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
    source ~/.nvm/nvm.sh
    nvm install ${NODE_VERSION}
    nvm use ${NODE_VERSION}
else
    echo "✅ Node.js $(node --version) already installed"
fi

# Navigate to React Native project directory
cd MultiRoomMusicApp

# Clean any existing node_modules to ensure fresh install
echo "🧹 Cleaning existing dependencies..."
rm -rf node_modules
rm -rf ios/Pods
rm -f package-lock.json
rm -f ios/Podfile.lock

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm install --frozen-lockfile

# Set up React Native environment
echo "⚛️ Setting up React Native environment..."
npx react-native info

# Navigate to iOS directory and install CocoaPods
echo "🍫 Installing CocoaPods dependencies..."
cd ios

# Update CocoaPods repo
pod repo update

# Install pods
pod install --clean-install

# Navigate back to project root
cd ..

# Set build environment variables
echo "⚙️ Setting build environment variables..."
echo "MARKETING_VERSION=1.0.0" >> $CI_DERIVED_DATA_PATH/environment.txt
echo "CURRENT_PROJECT_VERSION=1" >> $CI_DERIVED_DATA_PATH/environment.txt
echo "PRODUCT_BUNDLE_IDENTIFIER=com.iniviv.multiroommusicapp" >> $CI_DERIVED_DATA_PATH/environment.txt

# Create build info for debugging
echo "📋 Build Information:"
echo "Node.js: $(node --version)"
echo "npm: $(npm --version)"
echo "React Native: $(npx react-native --version)"
echo "CocoaPods: $(pod --version)"
echo "Xcode: $(xcodebuild -version)"
echo "iOS SDK: $(xcrun --show-sdk-version --sdk iphoneos)"

echo "✅ Environment setup complete!"