# App Store Submission Checklist

## Pre-Submission Requirements

### 🔧 Technical Requirements

#### Xcode Project Configuration
- [ ] Bundle identifier configured (e.g., `com.yourcompany.multiroommusicapp`)
- [ ] Deployment target set to iOS 13.0 minimum
- [ ] Valid provisioning profile and certificates
- [ ] All required architectures included (arm64)
- [ ] Bitcode disabled (React Native requirement)

#### App Information
- [ ] Display name: "Multi-Room Music"
- [ ] Version: 1.0.0
- [ ] Build number incremented for each submission
- [ ] Marketing version matches app version

#### Required App Icons
- [ ] 1024x1024 App Store icon (PNG, no transparency)
- [ ] 180x180 iPhone App icon (@3x)
- [ ] 120x120 iPhone App icon (@2x)
- [ ] 167x167 iPad Pro icon (@2x)
- [ ] 152x152 iPad icon (@2x)
- [ ] 76x76 iPad icon (@1x)

#### Launch Screen
- [ ] LaunchScreen.storyboard configured
- [ ] Supports all device orientations
- [ ] No placeholder text or temporary images

### 📱 iOS Permissions & Capabilities

#### Required Permissions (Info.plist)
- [ ] `NSLocalNetworkUsageDescription` - Music server connection
- [ ] `NSBluetoothAlwaysUsageDescription` - Bluetooth audio devices
- [ ] `NSMicrophoneUsageDescription` - Audio processing (if needed)
- [ ] Location permission (if using for network detection)

#### Background Modes
- [ ] Audio background mode enabled
- [ ] Background processing mode enabled
- [ ] Proper audio session configuration

#### Networking
- [ ] `NSAllowsLocalNetworking` set to true
- [ ] `NSAllowsArbitraryLoads` set to false (security)
- [ ] HTTPS enforcement for external connections

### 🔊 Audio Features

#### TrackPlayer Configuration
- [ ] Background audio playback working
- [ ] Lock screen controls functional
- [ ] Control Center integration
- [ ] Proper audio session interruption handling
- [ ] Volume control integration

#### Multi-Room Features
- [ ] Snapcast integration tested
- [ ] Bluetooth audio detection working
- [ ] AirPlay compatibility verified
- [ ] Latency compensation functional

### 📋 App Store Connect Setup

#### App Information
- [ ] App name: "Multi-Room Music"
- [ ] Subtitle: "Synchronized Audio Streaming"
- [ ] Category: Music
- [ ] Content rating: 4+ (unless using external content)

#### App Description
```
Multi-Room Music delivers synchronized audio streaming across your home with intelligent device detection and automatic audio zone management.

FEATURES:
• Snapcast integration for ultra-low latency streaming
• Automatic WiFi/Bluetooth device detection
• Smart audio zone selection
• Background playback with lock screen controls
• Real-time synchronization across multiple rooms
• Queue management with intuitive controls

COMPATIBILITY:
• iPhone 6s and newer
• iPad (5th generation) and newer
• iOS 13.0 or later
• Local network music server required

Perfect for whole-home audio systems, parties, and synchronized listening experiences.
```

#### Keywords
```
music, audio, streaming, multi-room, snapcast, synchronization, speakers, bluetooth, airplay, home, queue, playlist
```

#### Screenshots Required
- [ ] 6.7" iPhone (iPhone 14 Pro Max) - 3 required
- [ ] 6.5" iPhone (iPhone XS Max) - 3 required  
- [ ] 5.5" iPhone (iPhone 8 Plus) - 3 required
- [ ] 12.9" iPad Pro (6th gen) - 3 required
- [ ] 12.9" iPad Pro (2nd gen) - 3 required

#### Screenshot Content Ideas
1. Main music library and connection status
2. Playback controls and queue management
3. Snapcast client management interface
4. Audio zone and latency settings
5. Device detection and network status

#### App Privacy
- [ ] Privacy policy URL (if collecting any data)
- [ ] Data collection disclosure:
  - No data collected if purely local
  - Local network access only
  - No analytics or tracking

### 🧪 Testing Requirements

#### Device Testing
- [ ] Test on iPhone (multiple models if possible)
- [ ] Test on iPad
- [ ] Test different iOS versions (13.0, 14.0, 15.0+)
- [ ] Test with various audio outputs (built-in, Bluetooth, wired)

#### Network Testing
- [ ] WiFi connection and server discovery
- [ ] Bluetooth audio device connection
- [ ] Network switching (WiFi to cellular and back)
- [ ] Airplane mode and reconnection

#### Audio Testing
- [ ] Background playback when app backgrounded
- [ ] Lock screen controls functionality
- [ ] Control Center integration
- [ ] Volume control responsiveness
- [ ] Audio interruption handling (calls, alarms)

#### Functionality Testing
- [ ] Queue management (add, remove, reorder)
- [ ] Playback controls (play, pause, skip)
- [ ] Snapcast client control
- [ ] Latency adjustment
- [ ] Error handling and recovery

### 📄 App Review Guidelines Compliance

#### Performance
- [ ] App launches within 10 seconds
- [ ] No crashes during normal operation
- [ ] Responsive UI throughout
- [ ] Efficient memory usage
- [ ] Proper network error handling

#### User Interface
- [ ] Follows iOS Human Interface Guidelines
- [ ] Works in all supported orientations
- [ ] Proper Safe Area usage
- [ ] Accessibility support (VoiceOver, Dynamic Type)
- [ ] Consistent visual design

#### Functionality
- [ ] All advertised features work as described
- [ ] Clear error messages when server unavailable
- [ ] Graceful handling of network issues
- [ ] Intuitive user experience

#### Content & Legal
- [ ] No offensive or inappropriate content
- [ ] Proper attribution for third-party libraries
- [ ] No copyright violations in sample music
- [ ] Clear app purpose and functionality

### 🚀 Final Submission Steps

#### Pre-Archive Checklist
- [ ] Clean build (Product → Clean Build Folder)
- [ ] All warnings addressed
- [ ] Release configuration selected
- [ ] Proper signing certificates
- [ ] Generic iOS Device selected (not simulator)

#### Archive Process
- [ ] Product → Archive in Xcode
- [ ] Archive validation successful
- [ ] Upload to App Store Connect
- [ ] Processing completed without errors

#### App Store Connect Final Steps
- [ ] Build selected for review
- [ ] All metadata completed
- [ ] Screenshots uploaded and positioned
- [ ] Age rating completed
- [ ] Review information provided
- [ ] Version release set (manual or automatic)

#### Optional Enhancements
- [ ] App preview video (recommended)
- [ ] Localization for additional languages
- [ ] Apple Watch companion app consideration
- [ ] CarPlay integration planning

### 📞 Support Preparation

#### Documentation
- [ ] User guide or help documentation
- [ ] FAQ for common issues
- [ ] Troubleshooting guide
- [ ] Contact information for support

#### Monitoring
- [ ] Crash reporting tools configured
- [ ] Analytics for usage patterns (if desired)
- [ ] Performance monitoring
- [ ] User feedback collection method

---

## Common Rejection Reasons to Avoid

1. **Incomplete App Information**: Ensure all fields in App Store Connect are filled
2. **Missing Functionality**: App must work without external dependencies being obvious
3. **Permission Explanations**: Clear, specific explanations for all permissions
4. **Design Issues**: Broken layouts on different screen sizes
5. **Performance Issues**: Crashes, slow loading, excessive memory usage
6. **Metadata Mismatch**: Description doesn't match actual functionality

## Estimated Review Timeline

- **Initial Review**: 24-48 hours
- **Additional Review** (if rejected): 24 hours after resubmission
- **Expedited Review**: Available for critical issues (use sparingly)

## Post-Approval Tasks

- [ ] Monitor user reviews and ratings
- [ ] Respond to user feedback
- [ ] Plan future updates and features
- [ ] Track app performance metrics
- [ ] Maintain compatibility with iOS updates