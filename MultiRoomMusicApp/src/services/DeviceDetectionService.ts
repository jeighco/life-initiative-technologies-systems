/**
 * Device Detection Service for iOS Multi-Room Music App
 * Detects network connectivity, device capabilities, and audio routing
 */

import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import DeviceInfo from 'react-native-device-info';
import { Platform, NativeModules } from 'react-native';

export interface NetworkInfo {
  type: 'wifi' | 'cellular' | 'bluetooth' | 'ethernet' | 'unknown';
  isConnected: boolean;
  ssid?: string;
  ipAddress?: string;
  subnet?: string;
  gateway?: string;
  strength?: number;
}

export interface DeviceCapabilities {
  supportsAirPlay: boolean;
  supportsBluetooth: boolean;
  supportsMultiroom: boolean;
  hasBuiltInSpeaker: boolean;
  audioLatencyClass: 'low' | 'medium' | 'high';
}

export interface DeviceInfo {
  id: string;
  name: string;
  model: string;
  systemVersion: string;
  appVersion: string;
  buildNumber: string;
  bundleId: string;
  deviceType: string;
  manufacturer: string;
  capabilities: DeviceCapabilities;
}

class DeviceDetectionService {
  private networkListeners: ((info: NetworkInfo) => void)[] = [];
  private currentNetworkInfo: NetworkInfo | null = null;
  private deviceInfo: DeviceInfo | null = null;

  async initialize(): Promise<void> {
    try {
      // Initialize device info
      await this.detectDeviceInfo();
      
      // Initialize network monitoring
      await this.initializeNetworkMonitoring();
      
      console.log('📱 DeviceDetectionService initialized');
    } catch (error) {
      console.error('Failed to initialize DeviceDetectionService:', error);
      throw error;
    }
  }

  private async detectDeviceInfo(): Promise<void> {
    try {
      const [
        deviceId,
        deviceName,
        model,
        systemVersion,
        appVersion,
        buildNumber,
        bundleId,
        deviceType,
        manufacturer,
      ] = await Promise.all([
        DeviceInfo.getUniqueId(),
        DeviceInfo.getDeviceName(),
        DeviceInfo.getModel(),
        DeviceInfo.getSystemVersion(),
        DeviceInfo.getVersion(),
        DeviceInfo.getBuildNumber(),
        DeviceInfo.getBundleId(),
        DeviceInfo.getDeviceType(),
        DeviceInfo.getManufacturer(),
      ]);

      // Detect device capabilities
      const capabilities = await this.detectDeviceCapabilities(model);

      this.deviceInfo = {
        id: deviceId,
        name: deviceName,
        model,
        systemVersion,
        appVersion,
        buildNumber,
        bundleId,
        deviceType,
        manufacturer,
        capabilities,
      };

      console.log('📱 Device info detected:', this.deviceInfo);
    } catch (error) {
      console.error('Failed to detect device info:', error);
    }
  }

  private async detectDeviceCapabilities(model: string): Promise<DeviceCapabilities> {
    try {
      // Determine capabilities based on device model and iOS version
      const systemVersion = await DeviceInfo.getSystemVersion();
      const majorVersion = parseInt(systemVersion.split('.')[0], 10);

      // Basic capabilities for iOS devices
      let capabilities: DeviceCapabilities = {
        supportsAirPlay: majorVersion >= 4.2, // AirPlay introduced in iOS 4.2
        supportsBluetooth: majorVersion >= 3.0, // Bluetooth support since iOS 3.0
        supportsMultiroom: majorVersion >= 13.0, // Multi-output audio in iOS 13+
        hasBuiltInSpeaker: true, // All iOS devices have speakers
        audioLatencyClass: 'low',
      };

      // Model-specific adjustments
      if (model.includes('iPad')) {
        capabilities.audioLatencyClass = 'low';
        capabilities.supportsMultiroom = majorVersion >= 13.0;
      } else if (model.includes('iPhone')) {
        capabilities.audioLatencyClass = 'low';
        
        // Newer iPhones have better audio processing
        if (model.includes('iPhone 12') || model.includes('iPhone 13') || 
            model.includes('iPhone 14') || model.includes('iPhone 15')) {
          capabilities.audioLatencyClass = 'low';
          capabilities.supportsMultiroom = true;
        }
      } else if (model.includes('iPod')) {
        capabilities.audioLatencyClass = 'medium';
        capabilities.supportsMultiroom = false;
      }

      return capabilities;
    } catch (error) {
      console.error('Failed to detect device capabilities:', error);
      return {
        supportsAirPlay: true,
        supportsBluetooth: true,
        supportsMultiroom: false,
        hasBuiltInSpeaker: true,
        audioLatencyClass: 'medium',
      };
    }
  }

  private async initializeNetworkMonitoring(): Promise<void> {
    try {
      // Get initial network state
      const initialState = await NetInfo.fetch();
      this.currentNetworkInfo = await this.parseNetworkState(initialState);

      // Subscribe to network changes
      NetInfo.addEventListener(async (state) => {
        const networkInfo = await this.parseNetworkState(state);
        
        if (JSON.stringify(networkInfo) !== JSON.stringify(this.currentNetworkInfo)) {
          this.currentNetworkInfo = networkInfo;
          this.notifyNetworkChange(networkInfo);
        }
      });

      console.log('📶 Network monitoring initialized:', this.currentNetworkInfo);
    } catch (error) {
      console.error('Failed to initialize network monitoring:', error);
    }
  }

  private async parseNetworkState(state: NetInfoState): Promise<NetworkInfo> {
    const networkInfo: NetworkInfo = {
      type: this.mapNetworkType(state.type),
      isConnected: state.isConnected ?? false,
    };

    // Add additional details for WiFi
    if (state.type === 'wifi' && state.details) {
      const wifiDetails = state.details;
      networkInfo.ssid = wifiDetails.ssid || undefined;
      networkInfo.ipAddress = wifiDetails.ipAddress || undefined;
      networkInfo.subnet = wifiDetails.subnet || undefined;
      networkInfo.strength = wifiDetails.strength || undefined;
    }

    // Get IP address if not available from NetInfo
    if (!networkInfo.ipAddress && networkInfo.isConnected) {
      try {
        networkInfo.ipAddress = await DeviceInfo.getIpAddress();
      } catch (error) {
        console.warn('Failed to get IP address:', error);
      }
    }

    return networkInfo;
  }

  private mapNetworkType(type: string | null): NetworkInfo['type'] {
    switch (type) {
      case 'wifi':
        return 'wifi';
      case 'cellular':
        return 'cellular';
      case 'bluetooth':
        return 'bluetooth';
      case 'ethernet':
        return 'ethernet';
      default:
        return 'unknown';
    }
  }

  private notifyNetworkChange(networkInfo: NetworkInfo): void {
    console.log('📶 Network changed:', networkInfo);
    this.networkListeners.forEach(listener => listener(networkInfo));
  }

  async detectServerIP(): Promise<string | null> {
    try {
      const networkInfo = await this.getCurrentNetworkInfo();
      
      if (!networkInfo.ipAddress || networkInfo.type !== 'wifi') {
        return null;
      }

      // Extract subnet and try common server IPs
      const ipParts = networkInfo.ipAddress.split('.');
      if (ipParts.length !== 4) {
        return null;
      }

      // Try common server IPs in the same subnet
      const subnet = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}`;
      const commonServerIPs = ['.125', '.1', '.100', '.10', '.50'];

      for (const suffix of commonServerIPs) {
        const serverIP = subnet + suffix;
        
        try {
          // Test connectivity to server
          const isReachable = await this.testServerConnectivity(serverIP);
          if (isReachable) {
            console.log(`🎯 Found server at: ${serverIP}`);
            return serverIP;
          }
        } catch (error) {
          // Continue to next IP
        }
      }

      return null;
    } catch (error) {
      console.error('Failed to detect server IP:', error);
      return null;
    }
  }

  private async testServerConnectivity(ip: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout

      const response = await fetch(`http://${ip}:3000/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async getCurrentNetworkInfo(): Promise<NetworkInfo> {
    if (!this.currentNetworkInfo) {
      const state = await NetInfo.fetch();
      this.currentNetworkInfo = await this.parseNetworkState(state);
    }
    return this.currentNetworkInfo;
  }

  getDeviceInfo(): DeviceInfo | null {
    return this.deviceInfo;
  }

  isConnectedToWiFi(): boolean {
    return this.currentNetworkInfo?.type === 'wifi' && this.currentNetworkInfo.isConnected;
  }

  isConnectedToBluetooth(): boolean {
    return this.currentNetworkInfo?.type === 'bluetooth' && this.currentNetworkInfo.isConnected;
  }

  getRecommendedAudioZone(): 'snapcast' | 'chromecast' | 'bluetooth' | null {
    const networkInfo = this.currentNetworkInfo;
    const deviceCapabilities = this.deviceInfo?.capabilities;

    if (!networkInfo || !deviceCapabilities) {
      return null;
    }

    // Recommend based on network type and device capabilities
    if (networkInfo.type === 'wifi' && networkInfo.isConnected) {
      if (deviceCapabilities.supportsAirPlay) {
        return 'chromecast'; // Use Chromecast/AirPlay for WiFi
      }
      return 'snapcast'; // Fallback to Snapcast
    } else if (networkInfo.type === 'bluetooth' && networkInfo.isConnected) {
      return 'bluetooth';
    }

    return null;
  }

  getRecommendedLatencyCompensation(): number {
    const zone = this.getRecommendedAudioZone();
    const capabilities = this.deviceInfo?.capabilities;

    if (!zone || !capabilities) {
      return 0;
    }

    // Base latency by zone
    let baseLatency = 0;
    switch (zone) {
      case 'bluetooth':
        baseLatency = 250;
        break;
      case 'chromecast':
        baseLatency = 50;
        break;
      case 'snapcast':
      default:
        baseLatency = 0;
        break;
    }

    // Adjust based on device audio latency class
    switch (capabilities.audioLatencyClass) {
      case 'high':
        return baseLatency + 50;
      case 'medium':
        return baseLatency + 25;
      case 'low':
      default:
        return baseLatency;
    }
  }

  onNetworkChange(listener: (info: NetworkInfo) => void): () => void {
    this.networkListeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.networkListeners.indexOf(listener);
      if (index > -1) {
        this.networkListeners.splice(index, 1);
      }
    };
  }

  async refreshNetworkInfo(): Promise<NetworkInfo> {
    const state = await NetInfo.fetch();
    this.currentNetworkInfo = await this.parseNetworkState(state);
    this.notifyNetworkChange(this.currentNetworkInfo);
    return this.currentNetworkInfo;
  }

  destroy(): void {
    this.networkListeners = [];
    this.currentNetworkInfo = null;
    this.deviceInfo = null;
    console.log('🗑️ DeviceDetectionService destroyed');
  }
}

// Singleton instance
export const deviceDetectionService = new DeviceDetectionService();