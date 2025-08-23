# Xcode Cloud Setup Guide

## Overview
This guide provides step-by-step instructions for setting up Xcode Cloud for automated CI/CD of the Multi-Room Music iOS app.

## Prerequisites

### Apple Developer Account
- ✅ Active Apple Developer Program membership
- ✅ App Store Connect access
- ✅ Team Administrator or App Manager role

### Repository Setup
- ✅ Git repository (GitHub recommended)
- ✅ iOS project properly configured
- ✅ Valid Xcode project structure

## Step 1: Prepare Your Repository

### 1.1 Ensure Clean Git Status
```bash
cd /Users/jei/coding-projects/multi-room-music/music-server/MultiRoomMusicApp
git status
git add .
git commit -m "Prepare for Xcode Cloud setup"
```

### 1.2 Create Xcode Cloud Configuration
Create `.xcode-cloud/workflows` directory:
```bash
mkdir -p .xcode-cloud/workflows
```

### 1.3 Create Workflow Configuration
Create file: `.xcode-cloud/workflows/main.yml`
```yaml
name: CI/CD Pipeline
trigger:
  branches:
    - main
    - develop
  pull_requests:
    - main

actions:
  - name: Build and Test
    scheme: MultiRoomMusicApp
    configuration: Debug
    platform: iOS Simulator
    os_version: "17.0"
    device: iPhone 15

  - name: Archive for TestFlight
    scheme: MultiRoomMusicApp
    configuration: Release
    platform: iOS
    archive: true
    upload_to_testflight: true
    conditions:
      - branch: main

  - name: Archive for App Store
    scheme: MultiRoomMusicApp
    configuration: Release
    platform: iOS
    archive: true
    upload_to_app_store: false
    conditions:
      - tag: v*
```

## Step 2: Xcode Project Setup

### 2.1 Open in Xcode
```bash
cd ios
open MultiRoomMusicApp.xcworkspace
```

### 2.2 Configure Project Settings

#### General Tab
1. **Bundle Identifier**: `com.iniviv.multiroommusicapp`
2. **Version**: `1.0.0`
3. **Build**: `1`
4. **Deployment Target**: `iOS 13.0`
5. **Device Family**: iPhone, iPad

#### Signing & Capabilities Tab
1. **Team**: Select your Apple Developer Team
2. **Signing Certificate**: Apple Distribution
3. **Provisioning Profile**: Automatic or specific profile

#### Build Settings
1. **Code Signing Style**: Automatic
2. **Development Team**: YOUR_TEAM_ID
3. **Code Signing Identity**: Apple Development/Distribution

## Step 3: App Store Connect Setup

### 3.1 Create App Record
1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Click "My Apps" → "+" → "New App"
3. Fill in details:
   - **Platform**: iOS
   - **Name**: Multi-Room Music
   - **Bundle ID**: com.iniviv.multiroommusicapp
   - **SKU**: INIVIV-MRM-001
   - **User Access**: Full Access

### 3.2 Configure Xcode Cloud
1. In App Store Connect, go to your app
2. Click "Xcode Cloud" tab
3. Click "Get Started"
4. Connect your repository:
   - **Provider**: GitHub (or your Git provider)
   - **Repository**: Your repository URL
   - **Branch**: main

### 3.3 Grant Repository Access
1. Install Xcode Cloud app in your GitHub organization/account
2. Grant access to the specific repository
3. Authorize Apple Developer account linking

## Step 4: Workflow Configuration

### 4.1 Create Build Workflow
1. In Xcode Cloud, click "Create Workflow"
2. **Name**: "CI/CD Pipeline"
3. **Branch**: main
4. **Trigger**: On every push to main

### 4.2 Configure Build Actions
1. **Environment**: macOS Ventura 13, Xcode 14.3
2. **Scheme**: MultiRoomMusicApp
3. **Platform**: iOS
4. **Configuration**: Release for production, Debug for testing

### 4.3 Configure Archive Settings
1. **Archive**: Enable for main branch
2. **TestFlight Upload**: Enable automatic upload
3. **Post-Actions**: 
   - Run tests
   - Generate test report
   - Archive artifacts

### 4.4 Environment Variables
Set up required environment variables:
```
MARKETING_VERSION=1.0.0
CURRENT_PROJECT_VERSION=1
PRODUCT_BUNDLE_IDENTIFIER=com.iniviv.multiroommusicapp
```

## Step 5: Certificates and Provisioning

### 5.1 Automatic Signing (Recommended)
1. Ensure "Automatically manage signing" is checked
2. Select your Apple Developer Team
3. Xcode Cloud will handle certificate creation

### 5.2 Manual Signing (Advanced)
If you prefer manual control:
1. Create Distribution Certificate in Apple Developer Portal
2. Create App Store Provisioning Profile
3. Upload to Xcode Cloud in Workflow settings

## Step 6: Testing the Setup

### 6.1 Initial Build Test
1. Push code to main branch:
```bash
git add .
git commit -m "Configure Xcode Cloud workflow"
git push origin main
```

2. Monitor build in Xcode Cloud dashboard
3. Check for any configuration errors

### 6.2 TestFlight Integration Test
1. Successful builds should appear in TestFlight
2. Add internal testers
3. Verify app installs and launches correctly

## Step 7: Advanced Configuration

### 7.1 Branch Protection
Configure different workflows for different branches:
```yaml
# Development workflow
name: Development CI
trigger:
  branches:
    - develop
    - feature/*
actions:
  - name: Build and Test Only
    scheme: MultiRoomMusicApp
    configuration: Debug
    platform: iOS Simulator

# Production workflow  
name: Production CD
trigger:
  branches:
    - main
  tags:
    - v*
actions:
  - name: Full Archive and Deploy
    scheme: MultiRoomMusicApp
    configuration: Release
    platform: iOS
    archive: true
    upload_to_testflight: true
```

### 7.2 Custom Scripts
Add custom build scripts in `ci_scripts/` folder:

**ci_scripts/ci_post_clone.sh**:
```bash
#!/bin/sh
echo "Setting up React Native environment..."

# Install Node.js dependencies
npm install

# Install CocoaPods
cd ios && pod install && cd ..

# Set environment variables
echo "MARKETING_VERSION=1.0.0" >> $CI_DERIVED_DATA_PATH/environment.txt
```

**ci_scripts/ci_pre_xcodebuild.sh**:
```bash
#!/bin/sh
echo "Pre-build setup..."

# Generate any required configuration files
# Update version numbers if needed
# Run any pre-build checks
```

**ci_scripts/ci_post_xcodebuild.sh**:
```bash
#!/bin/sh
echo "Post-build actions..."

# Upload debug symbols
# Send notifications
# Update external systems
```

## Step 8: Monitoring and Notifications

### 8.1 Build Notifications
1. In Xcode Cloud settings, configure notifications
2. Set up email alerts for:
   - Build failures
   - Successful deployments
   - TestFlight uploads

### 8.2 Slack Integration (Optional)
1. Create Slack webhook URL
2. Add to Xcode Cloud post-build script:
```bash
curl -X POST -H 'Content-type: application/json' \
  --data '{"text":"✅ Multi-Room Music build successful!"}' \
  YOUR_SLACK_WEBHOOK_URL
```

## Step 9: Security and Best Practices

### 9.1 Sensitive Data Management
1. Never commit API keys or secrets
2. Use Xcode Cloud environment variables
3. Configure secure environment variables in workflow settings

### 9.2 Code Signing Security
1. Use automatic signing when possible
2. Regularly rotate certificates
3. Monitor certificate expiration dates

### 9.3 Dependency Management
1. Lock dependency versions in package-lock.json
2. Regularly update dependencies
3. Monitor for security vulnerabilities

## Step 10: Troubleshooting

### Common Issues

#### Build Fails with Signing Error
```
Solution: Check Team ID and Bundle Identifier match App Store Connect
1. Verify Bundle ID: com.iniviv.multiroommusicapp
2. Ensure Apple Developer Team is selected
3. Regenerate provisioning profiles if needed
```

#### React Native Build Fails
```
Solution: Ensure proper Node.js setup in ci_post_clone.sh
1. Install correct Node.js version
2. Clear npm cache: npm cache clean --force
3. Remove node_modules and reinstall: rm -rf node_modules && npm install
```

#### CocoaPods Issues
```
Solution: Update CocoaPods installation
1. Update Podfile.lock
2. Run pod install --repo-update
3. Clean derived data
```

#### TestFlight Upload Fails
```
Solution: Check app metadata and compliance
1. Verify all required app information is complete
2. Check export compliance settings
3. Ensure proper App Store Connect app record exists
```

## Verification Checklist

### Repository Setup
- [ ] .xcode-cloud/workflows directory created
- [ ] Workflow YAML configuration added
- [ ] Repository connected to Xcode Cloud
- [ ] Access permissions granted

### Xcode Configuration  
- [ ] Bundle ID: com.iniviv.multiroommusicapp
- [ ] Team ID configured
- [ ] Signing certificates valid
- [ ] Scheme configured for Archive

### App Store Connect
- [ ] App record created
- [ ] Xcode Cloud integration enabled
- [ ] Repository connected
- [ ] Build workflows configured

### Testing
- [ ] Initial build succeeds
- [ ] Archive generates successfully
- [ ] TestFlight upload works
- [ ] App installs from TestFlight

## Next Steps After Setup

1. **Create TestFlight Beta**: Invite internal testers to validate functionality
2. **External Testing**: Expand to external beta testers (friends, colleagues)
3. **App Store Submission**: Use the archived build for final App Store submission
4. **Continuous Integration**: Monitor builds and iterate on workflow improvements

## Support Resources

- **Xcode Cloud Documentation**: https://developer.apple.com/xcode-cloud/
- **App Store Connect Guide**: https://developer.apple.com/app-store-connect/
- **TestFlight Beta Testing**: https://developer.apple.com/testflight/
- **React Native iOS Guide**: https://reactnative.dev/docs/running-on-ios

## Conclusion

This Xcode Cloud setup provides automated building, testing, and TestFlight distribution for the Multi-Room Music app. The configuration enables continuous deployment while maintaining code quality and security standards.

For additional support or custom configuration needs, consult Apple Developer documentation or contact the development team.