#!/bin/bash

set -e

echo "🚀 Xcode Cloud: Setting up React Native environment..."
echo "📍 Current directory: $(pwd)"
echo "📁 Repository contents:"
ls -la

# Navigate to FreshMusicApp directory
echo "🔄 Navigating to FreshMusicApp..."
cd FreshMusicApp

echo "📍 Now in directory: $(pwd)"
echo "📁 FreshMusicApp contents:"
ls -la

# Check if package.json exists
if [ ! -f "package.json" ]; then
    echo "❌ ERROR: package.json not found!"
    exit 1
fi

echo "✅ package.json found"

# Install Node.js dependencies
echo "📦 Installing npm dependencies..."
npm install --verbose

# Verify node_modules was created
if [ -d "node_modules" ]; then
    echo "✅ node_modules created successfully"
    echo "📦 Installed packages count: $(ls node_modules | wc -l)"
else
    echo "❌ ERROR: node_modules directory not created!"
    exit 1
fi

echo "✅ React Native setup complete!"
