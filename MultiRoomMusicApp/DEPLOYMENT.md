# Deployment Guide for iniviv.com

## Overview
This guide provides step-by-step instructions for deploying the Multi-Room Music iOS app and web assets to iniviv.com for App Store distribution.

## Prerequisites

### Domain Setup
- Domain: `iniviv.com` 
- SSL Certificate configured
- DNS pointing to your hosting provider
- Web server with HTTPS support

### Apple Developer Account
- Apple Developer Program membership ($99/year)
- Team ID and certificates configured
- App Store Connect access

### Development Environment
- Xcode 14+ with iOS SDK
- React Native CLI installed
- CocoaPods installed
- Valid iOS development certificates

## Phase 1: Web Deployment

### 1. Web Assets Upload
Upload the following files to your iniviv.com web server:

```bash
# Main landing page
web/index.html → https://iniviv.com/index.html

# Progressive Web App manifest
web/manifest.json → https://iniviv.com/manifest.json

# Apple App Site Association (Universal Links)
web/.well-known/apple-app-site-association → https://iniviv.com/.well-known/apple-app-site-association

# Required subdirectories
web/assets/* → https://iniviv.com/assets/
web/js/* → https://iniviv.com/js/
web/css/* → https://iniviv.com/css/
```

### 2. Server Configuration

#### Apache (.htaccess)
```apache
# Enable HTTPS redirect
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

# Apple App Site Association
<Files "apple-app-site-association">
    Header set Content-Type "application/json"
    Header set Access-Control-Allow-Origin "*"
</Files>

# Progressive Web App support
<Files "manifest.json">
    Header set Content-Type "application/manifest+json"
</Files>

# Cache control for assets
<IfModule mod_expires.c>
    ExpiresActive On
    ExpiresByType image/png "access plus 1 month"
    ExpiresByType image/jpg "access plus 1 month"
    ExpiresByType image/jpeg "access plus 1 month"
    ExpiresByType application/javascript "access plus 1 week"
    ExpiresByType text/css "access plus 1 week"
</IfModule>
```

#### Nginx
```nginx
server {
    listen 80;
    server_name iniviv.com www.iniviv.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name iniviv.com www.iniviv.com;
    
    # SSL configuration
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    root /var/www/iniviv.com;
    index index.html;
    
    # Apple App Site Association
    location /.well-known/apple-app-site-association {
        add_header Content-Type application/json;
        add_header Access-Control-Allow-Origin *;
    }
    
    # Progressive Web App manifest
    location /manifest.json {
        add_header Content-Type application/manifest+json;
    }
    
    # Asset caching
    location ~* \.(png|jpg|jpeg|gif|ico|svg)$ {
        expires 1M;
        add_header Cache-Control "public, immutable";
    }
    
    location ~* \.(js|css)$ {
        expires 1w;
        add_header Cache-Control "public";
    }
}
```

### 3. DNS Configuration
Ensure your DNS records point to your web server:
```
A     iniviv.com      → YOUR_SERVER_IP
CNAME www.iniviv.com  → iniviv.com
```

## Phase 2: iOS App Configuration

### 1. Update Bundle Identifier
In `ios/MultiRoomMusicApp.xcodeproj`, update:
- Bundle Identifier: `com.iniviv.multiroommusicapp`
- Team ID: Replace `YOUR_TEAM_ID` with your Apple Developer Team ID
- Display Name: `Multi-Room Music`

### 2. Update Apple App Site Association
Replace `YOUR_TEAM_ID` in the following files with your actual Team ID:
- `web/.well-known/apple-app-site-association`
- iOS project configuration

### 3. App Icons and Assets
Create and add the required app icons:
- 1024x1024: App Store icon
- 180x180, 120x120: iPhone icons
- 167x167, 152x152, 76x76: iPad icons

Place in `ios/MultiRoomMusicApp/Images.xcassets/AppIcon.appiconset/`

### 4. Build Configuration
```bash
cd ios
pod install
cd ..

# For release build
npx react-native build-ios --configuration Release
```

## Phase 3: App Store Connect Setup

### 1. Create App Record
1. Log into [App Store Connect](https://appstoreconnect.apple.com)
2. Click "My Apps" → "+" → "New App"
3. Enter app information:
   - Platform: iOS
   - Name: Multi-Room Music
   - Bundle ID: com.iniviv.multiroommusicapp
   - SKU: INIVIV-MRM-001
   - User Access: Full Access

### 2. App Information
Use the details from `AppStoreConnect.md`:
- **Subtitle**: "Synchronized Audio Streaming"
- **Description**: Use the 4000-character description provided
- **Keywords**: Use the keyword string provided
- **Categories**: Music (Primary), Utilities (Secondary)

### 3. Pricing and Availability
- **Price**: Free
- **Availability**: All territories
- **Release**: Manual release after approval

### 4. App Privacy
- **Data Collection**: Select "No, this app does not collect user data"
- **Privacy Policy URL**: https://iniviv.com/privacy
- **Support URL**: https://iniviv.com/support

### 5. Build Upload
Using Xcode:
1. Open `ios/MultiRoomMusicApp.xcworkspace`
2. Select "Any iOS Device" as target
3. Product → Archive
4. Upload to App Store Connect

Using Command Line:
```bash
# Build archive
xcodebuild -workspace ios/MultiRoomMusicApp.xcworkspace \
           -scheme MultiRoomMusicApp \
           -archivePath MultiRoomMusicApp.xcarchive \
           archive

# Upload to App Store
xcrun altool --upload-app \
             --type ios \
             --file MultiRoomMusicApp.ipa \
             --username YOUR_APPLE_ID \
             --password YOUR_APP_PASSWORD
```

## Phase 4: TestFlight Beta Testing

### 1. Internal Testing
1. In App Store Connect, go to TestFlight
2. Add internal testers (development team)
3. Upload build automatically creates internal test

### 2. External Testing
1. Create external test group
2. Add beta testers (max 100 initially)
3. Submit for Beta App Review
4. Distribute TestFlight link: `https://testflight.apple.com/join/YOUR_CODE`

## Phase 5: App Store Submission

### 1. Version Information
- **Version**: 1.0
- **Build**: Latest uploaded build
- **Release Notes**: "Initial release of Multi-Room Music with synchronized audio streaming"

### 2. Screenshots
Upload screenshots for:
- iPhone 6.7" (iPhone 14 Pro Max)
- iPhone 6.5" (iPhone XS Max) 
- iPhone 5.5" (iPhone 8 Plus)
- iPad Pro 12.9" (6th gen)

### 3. App Review Information
- **Contact**: support@iniviv.com
- **Demo Account**: demo@iniviv.com / Demo123!
- **Notes**: Include testing instructions from AppStoreConnect.md

### 4. Submit for Review
1. Complete all required fields
2. Click "Submit for Review"
3. Typical review time: 24-48 hours

## Phase 6: Post-Launch Setup

### 1. Analytics and Monitoring
- Configure App Store Connect analytics
- Monitor crash reports
- Track download metrics

### 2. Update Processes
Set up CI/CD for future updates:
```bash
# Automated build and upload script
#!/bin/bash
npm run build:ios
npx react-native build-ios --configuration Release
xcrun altool --upload-app --file *.ipa --username $APPLE_ID --password $APP_PASSWORD
```

### 3. Support Infrastructure
- Set up support@iniviv.com email
- Create support documentation at iniviv.com/support
- Monitor App Store reviews

## Verification Checklist

### Web Deployment
- [ ] https://iniviv.com loads correctly
- [ ] Apple App Site Association accessible at `https://iniviv.com/.well-known/apple-app-site-association`
- [ ] PWA manifest accessible at `https://iniviv.com/manifest.json`
- [ ] SSL certificate valid and HTTPS enforced
- [ ] All assets loading correctly

### iOS App
- [ ] Bundle identifier: com.iniviv.multiroommusicapp
- [ ] Team ID updated in all configuration files
- [ ] App icons added for all required sizes
- [ ] Build successfully uploads to App Store Connect
- [ ] Deep linking configured for iniviv.com

### App Store Connect
- [ ] App record created with correct information
- [ ] Screenshots uploaded for all device sizes
- [ ] App description and metadata complete
- [ ] Privacy settings configured (no data collection)
- [ ] Pricing set to Free
- [ ] App submitted for review

### Testing
- [ ] TestFlight build distributes correctly
- [ ] Universal links work: https://iniviv.com/app/zones
- [ ] Custom scheme works: multiroommusic://open
- [ ] App installs and launches successfully
- [ ] Core functionality works in demo mode

## Troubleshooting

### Common Issues

**Universal Links Not Working**
- Verify Apple App Site Association is served over HTTPS
- Check JSON syntax is valid
- Ensure Team ID is correct
- Clear Safari cache and test

**Build Upload Fails**
- Verify certificates are valid
- Check bundle identifier matches App Store Connect
- Ensure all required app icons are included
- Update Xcode and command line tools

**App Review Rejection**
- Ensure demo mode works without server connection
- Include clear testing instructions
- Respond to reviewer feedback promptly
- Provide additional demo accounts if needed

### Support Contacts
- **Technical Issues**: development@iniviv.com
- **App Store Issues**: appstore@iniviv.com
- **General Support**: support@iniviv.com

## Next Steps After Approval

1. **Release Management**
   - Choose manual or automatic release
   - Coordinate marketing launch
   - Monitor initial user feedback

2. **Marketing and Promotion**
   - Update iniviv.com with "Available on App Store" badge
   - Social media announcement
   - Tech blog outreach

3. **Feature Updates**
   - Gather user feedback
   - Plan quarterly feature releases
   - Maintain backward compatibility

4. **Analytics and Growth**
   - Monitor App Store metrics
   - Track user retention
   - Optimize app store listing based on performance

## Conclusion

This deployment guide provides comprehensive instructions for launching Multi-Room Music on the App Store through iniviv.com. Follow each phase carefully and verify completion before proceeding to the next step.

For questions or issues during deployment, contact the development team or refer to Apple's official documentation.