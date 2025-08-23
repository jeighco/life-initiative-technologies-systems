# Multi-Room Music iOS App

A sophisticated React Native iOS app for controlling multi-room music streaming with automatic device detection, audio zone management, and Snapcast integration.

## Features

### 🎵 Core Music Features
- **Multi-Room Streaming**: Synchronized playback across multiple audio zones
- **Queue Management**: Add, remove, and reorder tracks in the playback queue
- **Real-time Control**: Play, pause, skip tracks with instant response
- **Background Playback**: Continues playing when app is backgrounded
- **Lock Screen Controls**: Standard iOS media controls on lock screen

### 📱 iOS-Specific Features
- **Device Detection**: Automatically detects iPhone/iPad model and capabilities
- **Network Intelligence**: Auto-discovers music server on local network
- **Audio Routing**: Smart detection of Bluetooth, AirPlay, and wired audio devices
- **Zone Auto-Selection**: Automatically chooses optimal audio zone based on connection type
- **Latency Compensation**: Device-specific audio delay compensation

### 🔊 Audio Zone Support
- **Snapcast**: Ultra-low latency synchronized audio (WiFi)
- **AirPlay/Chromecast**: Network streaming with device detection (WiFi)
- **Bluetooth**: Direct device audio with latency compensation
- **Multi-Output**: Simultaneous playback to multiple devices (iOS 13+)

### 📶 Network Features
- **WiFi Detection**: Automatic server discovery on local networks
- **Connection Monitoring**: Real-time network status and reconnection
- **Offline Graceful**: Maintains state when temporarily disconnected
- **Security**: Local network only, no internet required

## Technical Architecture

### Core Technologies
- **React Native**: Cross-platform mobile development
- **TypeScript**: Type-safe development
- **Socket.IO**: Real-time server communication
- **TrackPlayer**: iOS-native audio playback engine

### iOS-Specific Libraries
- **@react-native-community/netinfo**: Network state detection
- **react-native-device-info**: Device capabilities and identification
- **react-native-track-player**: Background audio and media controls
- **Core Audio Integration**: Native iOS audio session management

### Services Architecture

#### AudioService (`src/services/AudioService.ts`)
- iOS audio session configuration
- Multi-output audio routing
- Device-specific latency compensation
- Background playback management
- AirPlay and Bluetooth detection

#### DeviceDetectionService (`src/services/DeviceDetectionService.ts`)
- Network type detection (WiFi/Bluetooth/Cellular)
- Device capability assessment
- Server IP auto-discovery
- Audio zone recommendations

#### TrackPlayerService (`src/services/TrackPlayerService.ts`)
- Background audio playback
- iOS media control integration
- Remote control event handling

## Setup and Installation

### Prerequisites
- macOS with Xcode 14+
- iOS 13+ target device or simulator
- Node.js 18+
- CocoaPods installed

### Installation Steps

1. **Install Dependencies**
   ```bash
   npm install
   cd ios && pod install && cd ..
   ```

2. **Configure Bundle Identifier**
   - Open `ios/MultiRoomMusicApp.xcworkspace` in Xcode
   - Update bundle identifier: `com.yourcompany.multiroommusicapp`
   - Configure signing team and certificates

3. **Update Server Configuration**
   - Modify `SERVER_IP` in `App.tsx` if needed
   - Ensure music server is running on port 3000

4. **Run the App**
   ```bash
   npx react-native run-ios
   ```

### For App Store Submission

1. **Update App Information**
   - Bundle identifier
   - Version and build numbers
   - App icons (required sizes)
   - Launch screen images

2. **Configure Capabilities**
   - Background Modes: Audio, Background Processing
   - Audio & Video permissions
   - Local Network access

3. **Test on Device**
   ```bash
   npx react-native run-ios --device
   ```

4. **Build for Archive**
   - Open in Xcode
   - Product → Archive
   - Upload to App Store Connect

## Device Compatibility

### Supported Devices
- iPhone 6s and newer
- iPad (5th generation) and newer
- iPod touch (7th generation)

### iOS Requirements
- **Minimum**: iOS 13.0
- **Recommended**: iOS 15.0+
- **Multi-room features**: iOS 13.0+
- **Advanced audio routing**: iOS 14.0+

### Audio Capabilities by Device

#### iPhone 12 Pro and newer
- ✅ Multi-output audio
- ✅ Low-latency audio processing
- ✅ Advanced Bluetooth codec support
- ✅ Spatial audio compatibility

#### iPhone 11 and iPhone XS series
- ✅ Multi-output audio (iOS 13+)
- ✅ Low-latency audio
- ✅ Standard Bluetooth support
- ⚠️  Limited spatial audio

#### iPhone X and older
- ✅ Basic multi-room functionality
- ⚠️  Higher audio latency
- ✅ Standard Bluetooth support
- ❌ No multi-output audio

## Network Configuration

### Automatic Server Discovery
The app automatically detects music servers on the local network:

1. **WiFi Detection**: Scans common IP addresses in subnet
2. **Health Check**: Tests server connectivity on port 3000
3. **Auto-Connect**: Establishes Socket.IO connection

### Manual Configuration
If auto-discovery fails, users can manually enter server IP:
- Settings → Server Configuration
- Enter IP address (e.g., 192.168.1.125)
- Port is fixed at 3000

### Supported Network Types

#### WiFi Networks
- **Snapcast**: Ultra-low latency (<10ms)
- **Chromecast/AirPlay**: Network streaming (50ms typical)
- **Auto-discovery**: Server detection enabled

#### Bluetooth Audio
- **Direct Connection**: A2DP profile support
- **Latency Compensation**: 250ms typical adjustment
- **Codec Support**: SBC, AAC, aptX (device dependent)

#### Cellular Networks
- **Limited Functionality**: Remote server access only
- **Higher Latency**: Not recommended for real-time sync
- **Data Usage**: Monitor streaming consumption

## Troubleshooting

### Common Issues

#### App Won't Connect to Server
1. Verify server is running on correct IP/port
2. Check WiFi connection on device
3. Ensure devices are on same network
4. Try manual IP configuration

#### Audio Playback Issues
1. Check iOS audio permissions
2. Verify TrackPlayer configuration
3. Test with different audio outputs
4. Restart app and audio session

#### Bluetooth Audio Lag
1. Check device Bluetooth codec
2. Adjust latency compensation in settings
3. Consider using WiFi-based zones instead

#### Background Playback Stops
1. Verify Background App Refresh is enabled
2. Check iOS Background Modes configuration
3. Ensure proper audio session category

### Debug Mode
Enable debug logging by setting:
```typescript
const DEBUG_MODE = true; // in App.tsx
```

## App Store Guidelines Compliance

### Privacy
- All audio processing happens locally
- No personal data collection
- Local network access only
- Clear permission descriptions

### Performance
- Optimized for background audio
- Efficient network usage
- Memory management for long sessions
- Battery life considerations

### Accessibility
- VoiceOver support
- Dynamic Type compatibility
- High contrast support
- Touch target sizes

## Contributing

### Development Setup
1. Fork the repository
2. Create feature branch
3. Follow TypeScript conventions
4. Test on physical iOS device
5. Submit pull request

### Code Style
- TypeScript strict mode
- ESLint configuration
- Prettier formatting
- React Native best practices

### Testing
- Unit tests with Jest
- Integration testing on device
- Audio playback testing
- Network connectivity testing

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues and support:
1. Check troubleshooting section
2. Review device compatibility
3. Test network configuration
4. Submit issue with device/iOS version details