/**
 * iOS Audio Service for Multi-Room Music App
 * Handles native iOS audio playback, routing, and device detection
 */

import TrackPlayer, {
  Capability,
  State,
  RepeatMode,
  IOSCategory,
  IOSCategoryMode,
  IOSCategoryOptions,
} from 'react-native-track-player';
import { Alert, Platform } from 'react-native';

export interface AudioDevice {
  id: string;
  name: string;
  type: 'bluetooth' | 'airplay' | 'headphones' | 'speaker' | 'hdmi' | 'usb';
  isConnected: boolean;
  supportsMultiroom: boolean;
}

export interface AudioRoute {
  outputs: AudioDevice[];
  currentOutput: AudioDevice | null;
}

class AudioService {
  private isInitialized = false;
  private currentRoute: AudioRoute = { outputs: [], currentOutput: null };
  private audioRouteListeners: ((route: AudioRoute) => void)[] = [];

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Setup TrackPlayer with iOS-specific configuration
      await TrackPlayer.setupPlayer({
        // iOS-specific options
        iosCategory: IOSCategory.Playback,
        iosCategoryMode: IOSCategoryMode.Default,
        iosCategoryOptions: [
          IOSCategoryOptions.AllowBluetooth,
          IOSCategoryOptions.AllowAirPlay,
          IOSCategoryOptions.AllowBluetoothA2DP,
          IOSCategoryOptions.DefaultToSpeaker,
        ],
        autoHandleInterruptions: true,
        autoUpdateMetadata: true,
        alwaysPauseOnInterruption: true,
      });

      // Configure capabilities
      await TrackPlayer.updateOptions({
        capabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.SkipToNext,
          Capability.SkipToPrevious,
          Capability.Stop,
          Capability.SeekTo,
        ],
        compactCapabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.SkipToNext,
          Capability.SkipToPrevious,
        ],
        notificationCapabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.SkipToNext,
          Capability.SkipToPrevious,
        ],
        progressUpdateEventInterval: 1,
      });

      // Set repeat mode
      await TrackPlayer.setRepeatMode(RepeatMode.Off);

      this.isInitialized = true;
      console.log('🎵 AudioService initialized for iOS');

      // Start monitoring audio route changes
      this.startAudioRouteMonitoring();
    } catch (error) {
      console.error('Failed to initialize AudioService:', error);
      throw error;
    }
  }

  async detectAudioDevices(): Promise<AudioDevice[]> {
    try {
      // iOS doesn't provide direct API to enumerate audio devices
      // We'll use a combination of techniques to detect available outputs
      const devices: AudioDevice[] = [];

      // Always include built-in speaker
      devices.push({
        id: 'builtin-speaker',
        name: 'iPhone Speaker',
        type: 'speaker',
        isConnected: true,
        supportsMultiroom: false,
      });

      // Check for headphones (wired or wireless)
      // This would typically be done through native iOS code
      // For now, we'll simulate detection
      const hasHeadphones = await this.checkForHeadphones();
      if (hasHeadphones) {
        devices.push({
          id: 'headphones',
          name: 'Headphones',
          type: 'headphones',
          isConnected: true,
          supportsMultiroom: false,
        });
      }

      // Check for Bluetooth devices
      const bluetoothDevices = await this.detectBluetoothAudioDevices();
      devices.push(...bluetoothDevices);

      // Check for AirPlay devices
      const airplayDevices = await this.detectAirPlayDevices();
      devices.push(...airplayDevices);

      this.currentRoute = {
        outputs: devices,
        currentOutput: devices.find(d => d.isConnected) || devices[0] || null,
      };

      return devices;
    } catch (error) {
      console.error('Failed to detect audio devices:', error);
      return [];
    }
  }

  private async checkForHeadphones(): Promise<boolean> {
    // In a real implementation, this would check iOS audio session
    // for connected headphones/earbuds
    // For now, we'll return false as it requires native code
    return false;
  }

  private async detectBluetoothAudioDevices(): Promise<AudioDevice[]> {
    try {
      // This would typically require native iOS code to access Core Bluetooth
      // and Audio Session APIs to detect connected Bluetooth audio devices
      
      // Simulated Bluetooth device detection
      // In production, you'd need to implement native iOS module
      const bluetoothDevices: AudioDevice[] = [];

      // Example of what this might look like:
      // const connectedDevices = await NativeBluetoothModule.getConnectedAudioDevices();
      // for (const device of connectedDevices) {
      //   bluetoothDevices.push({
      //     id: device.uuid,
      //     name: device.name,
      //     type: 'bluetooth',
      //     isConnected: true,
      //     supportsMultiroom: device.supportsA2DP,
      //   });
      // }

      return bluetoothDevices;
    } catch (error) {
      console.error('Failed to detect Bluetooth devices:', error);
      return [];
    }
  }

  private async detectAirPlayDevices(): Promise<AudioDevice[]> {
    try {
      // AirPlay device detection would require native iOS implementation
      // using AVAudioSession and MPVolumeView
      
      const airplayDevices: AudioDevice[] = [];

      // Example implementation:
      // const availableOutputs = await NativeAudioModule.getAirPlayDevices();
      // for (const output of availableOutputs) {
      //   airplayDevices.push({
      //     id: output.uid,
      //     name: output.name,
      //     type: 'airplay',
      //     isConnected: output.isSelected,
      //     supportsMultiroom: true,
      //   });
      // }

      return airplayDevices;
    } catch (error) {
      console.error('Failed to detect AirPlay devices:', error);
      return [];
    }
  }

  async setAudioOutput(deviceId: string): Promise<boolean> {
    try {
      // This would require native iOS implementation to route audio
      // to specific outputs using AVAudioSession
      
      console.log(`🔊 Attempting to route audio to device: ${deviceId}`);
      
      // Example native call:
      // const success = await NativeAudioModule.setPreferredOutput(deviceId);
      // return success;
      
      // For now, return true to simulate success
      return true;
    } catch (error) {
      console.error('Failed to set audio output:', error);
      return false;
    }
  }

  async getAudioLatency(deviceType: 'bluetooth' | 'airplay' | 'headphones' | 'speaker'): Promise<number> {
    // Return appropriate latency compensation values for different device types
    switch (deviceType) {
      case 'bluetooth':
        return 250; // Typical Bluetooth A2DP latency
      case 'airplay':
        return 50;  // AirPlay network latency
      case 'headphones':
        return 10;  // Wired headphones minimal latency
      case 'speaker':
      default:
        return 0;   // Built-in speaker reference
    }
  }

  async enableMultiroomAudio(): Promise<boolean> {
    try {
      // Enable multi-output audio routing for supported devices
      // This requires iOS 13+ and specific device capabilities
      
      console.log('🏠 Enabling multi-room audio support');
      
      // Native implementation would use AVAudioSession.Category.multiRoute
      // and configure multiple simultaneous outputs
      
      return true;
    } catch (error) {
      console.error('Failed to enable multi-room audio:', error);
      return false;
    }
  }

  private startAudioRouteMonitoring(): void {
    // Monitor for audio route changes (device connections/disconnections)
    // This would typically use AVAudioSession notifications
    
    console.log('🎧 Starting audio route monitoring');
    
    // Simulate periodic route checking
    setInterval(async () => {
      const devices = await this.detectAudioDevices();
      const newRoute = {
        outputs: devices,
        currentOutput: devices.find(d => d.isConnected) || devices[0] || null,
      };
      
      // Check if route changed
      if (JSON.stringify(newRoute) !== JSON.stringify(this.currentRoute)) {
        this.currentRoute = newRoute;
        this.notifyRouteChange(newRoute);
      }
    }, 5000); // Check every 5 seconds
  }

  private notifyRouteChange(route: AudioRoute): void {
    console.log('🔄 Audio route changed:', route);
    this.audioRouteListeners.forEach(listener => listener(route));
  }

  onAudioRouteChange(listener: (route: AudioRoute) => void): () => void {
    this.audioRouteListeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.audioRouteListeners.indexOf(listener);
      if (index > -1) {
        this.audioRouteListeners.splice(index, 1);
      }
    };
  }

  getCurrentRoute(): AudioRoute {
    return this.currentRoute;
  }

  async playStream(url: string, title: string, artist: string = 'Multi-Room Music'): Promise<void> {
    try {
      // Clear any existing tracks
      await TrackPlayer.reset();
      
      // Add the stream track
      await TrackPlayer.add({
        id: 'current-stream',
        url,
        title,
        artist,
        artwork: undefined, // Could add app icon or track artwork
      });
      
      // Start playback
      await TrackPlayer.play();
      
      console.log(`🎵 Playing stream: ${title}`);
    } catch (error) {
      console.error('Failed to play stream:', error);
      throw error;
    }
  }

  async stopStream(): Promise<void> {
    try {
      await TrackPlayer.stop();
      await TrackPlayer.reset();
      console.log('⏹️ Stream stopped');
    } catch (error) {
      console.error('Failed to stop stream:', error);
    }
  }

  async pauseStream(): Promise<void> {
    try {
      await TrackPlayer.pause();
      console.log('⏸️ Stream paused');
    } catch (error) {
      console.error('Failed to pause stream:', error);
    }
  }

  async resumeStream(): Promise<void> {
    try {
      await TrackPlayer.play();
      console.log('▶️ Stream resumed');
    } catch (error) {
      console.error('Failed to resume stream:', error);
    }
  }

  async getPlaybackState(): Promise<State> {
    try {
      return await TrackPlayer.getState();
    } catch (error) {
      console.error('Failed to get playback state:', error);
      return State.None;
    }
  }

  async setVolume(volume: number): Promise<void> {
    try {
      // Volume is between 0.0 and 1.0
      const normalizedVolume = Math.max(0, Math.min(1, volume / 100));
      await TrackPlayer.setVolume(normalizedVolume);
      console.log(`🔊 Volume set to ${volume}%`);
    } catch (error) {
      console.error('Failed to set volume:', error);
    }
  }

  async getVolume(): Promise<number> {
    try {
      const volume = await TrackPlayer.getVolume();
      return Math.round(volume * 100);
    } catch (error) {
      console.error('Failed to get volume:', error);
      return 50; // Default volume
    }
  }

  async seekToPosition(position: number): Promise<void> {
    try {
      // Position should be in milliseconds, convert to seconds for TrackPlayer
      const positionInSeconds = position / 1000;
      await TrackPlayer.seekTo(positionInSeconds);
      console.log(`⏭️ Seeked to position: ${position}ms (${positionInSeconds}s)`);
    } catch (error) {
      console.error('Failed to seek to position:', error);
    }
  }

  destroy(): void {
    TrackPlayer.destroy();
    this.audioRouteListeners = [];
    this.isInitialized = false;
    console.log('🗑️ AudioService destroyed');
  }
}

// Singleton instance
export const audioService = new AudioService();