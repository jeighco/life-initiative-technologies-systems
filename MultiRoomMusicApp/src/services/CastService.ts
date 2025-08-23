/**
 * Network-based Cast Service for Multi-Room Music App
 * Discovers real Chromecast devices and integrates with HTTP streaming
 */

import { Platform } from 'react-native';
import { Socket } from 'socket.io-client';

export interface CastDevice {
  id: string;
  name: string;
  model?: string;
  ip: string;
  port: number;
  isAvailable: boolean;
  isConnected: boolean;
  type: 'chromecast' | 'android-tv' | 'dlna';
}

export interface MediaMetadata {
  title: string;
  artist?: string;
  album?: string;
  artwork?: string;
  duration?: number;
}

export interface CastStatus {
  isConnected: boolean;
  deviceName?: string;
  deviceIP?: string;
  playerState: 'idle' | 'playing' | 'paused' | 'buffering';
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
}

class CastService {
  private devices: CastDevice[] = [];
  private deviceListeners: ((devices: CastDevice[]) => void)[] = [];
  private statusListeners: ((status: CastStatus) => void)[] = [];
  private currentStatus: CastStatus = {
    isConnected: false,
    playerState: 'idle',
    currentTime: 0,
    duration: 0,
    volume: 1.0,
    muted: false,
  };
  
  private serverIP = '192.168.12.125'; // This should come from SocketContext
  private discoveryInterval: NodeJS.Timeout | null = null;
  private socket: Socket | null = null;

  setSocket(socket: Socket | null): void {
    this.socket = socket;
    
    if (socket) {
      // Listen for real-time cast device updates
      socket.on('device_connected', this.handleDeviceConnected.bind(this));
      socket.on('device_disconnected', this.handleDeviceDisconnected.bind(this));
      socket.on('cast_status_update', this.handleCastStatusUpdate.bind(this));
      
      console.log('📡 CastService connected to Socket.IO for real-time updates');
    }
  }

  setServerAddress(serverAddress: string): void {
    // Extract IP from address like 'http://192.168.12.125:3000'
    const match = serverAddress.match(/http:\/\/([^:]+):/);
    if (match && match[1]) {
      this.serverIP = match[1];
      console.log(`📡 CastService updated server IP: ${this.serverIP}`);
    }
  }

  async initialize(): Promise<void> {
    try {
      console.log('🎯 CastService initialized - starting network discovery');
      
      // Start device discovery
      this.startDeviceDiscovery();
      
    } catch (error) {
      console.error('Failed to initialize CastService:', error);
      throw error;
    }
  }

  private startDeviceDiscovery(): void {
    // Discover devices immediately
    this.discoverDevices();
    
    // Continue discovery every 2 minutes (much less frequent)
    this.discoveryInterval = setInterval(() => {
      this.discoverDevices();
    }, 120000);
  }

  private async discoverDevices(): Promise<void> {
    try {
      console.log('🔍 Discovering cast devices via server...');
      console.log(`📡 Using server IP: ${this.serverIP}`);
      
      // Clear existing devices
      this.devices = [];
      
      // Use server-side discovery instead of client-side network scanning
      try {
        const response = await fetch(`http://${this.serverIP}:3000/api/cast/discover`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 10000, // 10 second timeout for discovery
        });

        if (response.ok) {
          const discoveryResult = await response.json();
          console.log(`📊 Server discovery completed: ${discoveryResult.devicesFound} devices found`);
          console.log(`🔍 Checked ${discoveryResult.totalChecks} potential devices on subnet ${discoveryResult.subnet}.x`);
          
          if (discoveryResult.devices && discoveryResult.devices.length > 0) {
            this.devices = discoveryResult.devices;
            console.log(`✅ Found devices:`, this.devices.map(d => `${d.name} (${d.ip}:${d.port})`));
          } else {
            console.log('⚠️ Server found no devices on network');
            console.log(`🔍 Scanned ${discoveryResult.totalChecks} addresses across subnets: ${discoveryResult.subnets?.join(', ')}`);
            // Don't add test device - let user see real results
          }
        } else {
          console.error(`❌ Server discovery failed: ${response.status} ${response.statusText}`);
        }
      } catch (fetchError) {
        console.error('❌ Failed to reach server for discovery:', fetchError);
      }
      
      this.notifyDeviceListeners();
      
    } catch (error) {
      console.error('Device discovery error:', error);
      this.notifyDeviceListeners();
    }
  }
  
  private async addTestDevice(): Promise<void> {
    console.log('🔍 Adding test device for debugging...');
    this.devices.push({
      id: 'test-device',
      name: 'Test Cast Device (Debug)',
      model: 'Test',
      ip: '192.168.12.100',
      port: 8008,
      isAvailable: true,
      isConnected: false,
      type: 'chromecast',
    });
  }

  private async checkDevice(ip: string, port: number, type: CastDevice['type']): Promise<CastDevice | null> {
    try {
      // Attempt to connect to the device
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      console.log(`🔍 Checking ${type} device at ${ip}:${port}...`);

      let response;
      let deviceName = `${type.toUpperCase()} Device`;
      let model = type;

      try {
        // Try different discovery endpoints based on device type
        let endpoints = [];
        
        if (type === 'chromecast') {
          endpoints = [
            `http://${ip}:${port}/setup/eureka_info`,
            `http://${ip}:${port}/setup/eureka_info?params=version,audio,name,build_info,detail,device_info,net,wifi,setup,settings,opt_in,opencast,multizone,proxy,night_mode_params,user_eq,room_equalizer,sign,aogh,ultrasound,opencast,build_info`,
            `http://${ip}:${port}/setup/device_description`
          ];
        } else if (type === 'android-tv') {
          endpoints = [
            `http://${ip}:${port}/`,
            `http://${ip}:${port}/description.xml`,
            `http://${ip}:${port}/rootDesc.xml`
          ];
        } else if (type === 'dlna') {
          endpoints = [
            `http://${ip}:${port}/description.xml`,
            `http://${ip}:${port}/rootDesc.xml`,
            `http://${ip}:${port}/`
          ];
        }

        // Try each endpoint until one works
        for (const endpoint of endpoints) {
          try {
            response = await fetch(endpoint, {
              method: 'GET',
              signal: controller.signal,
              headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'MultiRoomMusicApp/1.0',
              },
            });

            if (response.ok) {
              // Try to parse device info
              const contentType = response.headers.get('content-type') || '';
              
              if (contentType.includes('application/json')) {
                try {
                  const data = await response.json();
                  
                  if (type === 'chromecast') {
                    deviceName = data.name || data.device_name || data.friendly_name || `Chromecast (${ip})`;
                    model = data.model_name || data.product_name || 'Chromecast';
                    
                    // Additional info extraction
                    if (data.detail && data.detail.icon_list) {
                      // This indicates a real Chromecast device
                      console.log(`🎯 Real Chromecast detected: ${deviceName}`);
                    }
                  }
                } catch (parseError) {
                  // JSON parsing failed, try text response
                }
              } else if (contentType.includes('text/xml')) {
                try {
                  const xmlText = await response.text();
                  
                  // Extract device name from XML (DLNA/UPnP description)
                  const friendlyNameMatch = xmlText.match(/<friendlyName>([^<]+)<\/friendlyName>/i);
                  const modelNameMatch = xmlText.match(/<modelName>([^<]+)<\/modelName>/i);
                  const manufacturerMatch = xmlText.match(/<manufacturer>([^<]+)<\/manufacturer>/i);
                  
                  if (friendlyNameMatch) {
                    deviceName = friendlyNameMatch[1];
                  }
                  if (modelNameMatch) {
                    model = modelNameMatch[1];
                  }
                  if (manufacturerMatch && manufacturerMatch[1].toLowerCase().includes('google')) {
                    type = 'chromecast';
                  }
                  
                  console.log(`📺 Found ${type} device via XML: ${deviceName}`);
                } catch (parseError) {
                  // XML parsing failed
                }
              }
              
              // Success - we found a device
              break;
            }
          } catch (endpointError) {
            // Try next endpoint
            continue;
          }
        }

        clearTimeout(timeoutId);

        if (response && response.ok) {
          // Fallback names if we couldn't extract proper names
          if (deviceName === `${type.toUpperCase()} Device`) {
            if (type === 'chromecast') {
              deviceName = `Chromecast (${ip})`;
            } else if (type === 'android-tv') {
              deviceName = `Android TV (${ip})`;
            } else {
              deviceName = `${type.toUpperCase()} (${ip})`;
            }
          }

          console.log(`✅ Found ${type} device: ${deviceName} at ${ip}:${port}`);

          return {
            id: `${type}-${ip}-${port}`,
            name: deviceName,
            model: model,
            ip: ip,
            port: port,
            isAvailable: true,
            isConnected: false,
            type: type,
          };
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);
        // Device not reachable
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  async getAvailableDevices(): Promise<CastDevice[]> {
    return this.devices.filter(device => device.isAvailable);
  }

  async connectToDevice(deviceId: string): Promise<boolean> {
    try {
      const device = this.devices.find(d => d.id === deviceId);
      if (!device) {
        throw new Error(`Device ${deviceId} not found`);
      }

      console.log(`🎯 Connecting to cast device: ${device.name} (${device.ip}:${device.port})`);
      
      // Set device as connected
      device.isConnected = true;
      this.currentStatus.isConnected = true;
      this.currentStatus.deviceName = device.name;
      this.currentStatus.deviceIP = device.ip;
      
      // Notify server that we're casting to this device
      await this.notifyServerCasting(device);
      
      this.notifyStatusListeners();
      this.notifyDeviceListeners();
      
      return true;
    } catch (error) {
      console.error('Failed to connect to cast device:', error);
      return false;
    }
  }

  private async notifyServerCasting(device: CastDevice): Promise<void> {
    try {
      // Tell the server we're casting to this device
      const response = await fetch(`http://${this.serverIP}:3000/api/cast/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceIP: device.ip,
          devicePort: device.port,
          deviceName: device.name,
          deviceType: device.type,
        }),
      });

      if (response.ok) {
        console.log('✅ Server notified of cast connection');
      } else {
        console.warn('⚠️ Failed to notify server of cast connection');
      }
    } catch (error) {
      console.warn('⚠️ Could not notify server of cast connection:', error);
    }
  }

  async disconnect(): Promise<void> {
    try {
      console.log('🎯 Disconnecting from cast device');
      
      // Notify server we're disconnecting
      if (this.currentStatus.deviceIP) {
        try {
          await fetch(`http://${this.serverIP}:3000/api/cast/disconnect`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              deviceIP: this.currentStatus.deviceIP,
            }),
          });
        } catch (error) {
          console.warn('Could not notify server of disconnect:', error);
        }
      }
      
      // Reset all device connections
      this.devices.forEach(device => {
        device.isConnected = false;
      });
      
      this.currentStatus.isConnected = false;
      this.currentStatus.deviceName = undefined;
      this.currentStatus.deviceIP = undefined;
      this.currentStatus.playerState = 'idle';
      
      this.notifyStatusListeners();
      this.notifyDeviceListeners();
    } catch (error) {
      console.error('Failed to disconnect from cast device:', error);
    }
  }

  async castMedia(streamUrl: string, metadata: MediaMetadata): Promise<boolean> {
    try {
      if (!this.currentStatus.isConnected || !this.currentStatus.deviceIP) {
        throw new Error('No cast device connected');
      }

      console.log(`🎵 Casting media: ${metadata.title} to ${this.currentStatus.deviceIP}`);
      
      // Tell server to start casting this media
      const response = await fetch(`http://${this.serverIP}:3000/api/cast/media`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceIP: this.currentStatus.deviceIP,
          streamUrl: streamUrl,
          metadata: metadata,
        }),
      });

      if (response.ok) {
        this.currentStatus.playerState = 'playing';
        this.currentStatus.duration = metadata.duration || 0;
        this.currentStatus.currentTime = 0;
        
        this.notifyStatusListeners();
        return true;
      } else {
        throw new Error('Server failed to start casting');
      }
    } catch (error) {
      console.error('Failed to cast media:', error);
      return false;
    }
  }

  async play(): Promise<void> {
    try {
      console.log('▶️ Cast play');
      this.currentStatus.playerState = 'playing';
      this.notifyStatusListeners();
    } catch (error) {
      console.error('Failed to play cast media:', error);
    }
  }

  async pause(): Promise<void> {
    try {
      console.log('⏸️ Cast pause');
      this.currentStatus.playerState = 'paused';
      this.notifyStatusListeners();
    } catch (error) {
      console.error('Failed to pause cast media:', error);
    }
  }

  async stop(): Promise<void> {
    try {
      console.log('⏹️ Cast stop');
      this.currentStatus.playerState = 'idle';
      this.currentStatus.currentTime = 0;
      this.notifyStatusListeners();
    } catch (error) {
      console.error('Failed to stop cast media:', error);
    }
  }

  async seek(time: number): Promise<void> {
    try {
      console.log(`⏩ Cast seek to ${time}s`);
      this.currentStatus.currentTime = time;
      this.notifyStatusListeners();
    } catch (error) {
      console.error('Failed to seek cast media:', error);
    }
  }

  async setVolume(volume: number): Promise<void> {
    try {
      console.log(`🔊 Cast volume to ${Math.round(volume * 100)}%`);
      this.currentStatus.volume = volume;
      this.notifyStatusListeners();
    } catch (error) {
      console.error('Failed to set cast volume:', error);
    }
  }

  async toggleMute(): Promise<void> {
    try {
      this.currentStatus.muted = !this.currentStatus.muted;
      console.log(`🔇 Cast ${this.currentStatus.muted ? 'muted' : 'unmuted'}`);
      this.notifyStatusListeners();
    } catch (error) {
      console.error('Failed to toggle cast mute:', error);
    }
  }

  isConnected(): boolean {
    return this.currentStatus.isConnected;
  }

  getCurrentStatus(): CastStatus {
    return { ...this.currentStatus };
  }

  onDeviceListChange(listener: (devices: CastDevice[]) => void): () => void {
    this.deviceListeners.push(listener);
    
    // Immediately call with current devices
    listener(this.devices);
    
    // Return unsubscribe function
    return () => {
      const index = this.deviceListeners.indexOf(listener);
      if (index > -1) {
        this.deviceListeners.splice(index, 1);
      }
    };
  }

  onStatusChange(listener: (status: CastStatus) => void): () => void {
    this.statusListeners.push(listener);
    
    // Immediately call with current status
    listener(this.currentStatus);
    
    // Return unsubscribe function
    return () => {
      const index = this.statusListeners.indexOf(listener);
      if (index > -1) {
        this.statusListeners.splice(index, 1);
      }
    };
  }

  private notifyDeviceListeners(): void {
    this.deviceListeners.forEach(listener => listener([...this.devices]));
  }

  private notifyStatusListeners(): void {
    this.statusListeners.forEach(listener => listener({ ...this.currentStatus }));
  }

  private handleDeviceConnected(data: any): void {
    console.log('📡 Real-time device connected:', data);
    
    // Update device connection status
    const device = this.devices.find(d => d.ip === data.deviceIP);
    if (device) {
      device.isConnected = true;
      this.currentStatus.isConnected = true;
      this.currentStatus.deviceName = data.deviceName;
      this.currentStatus.deviceIP = data.deviceIP;
      
      this.notifyDeviceListeners();
      this.notifyStatusListeners();
    }
  }

  private handleDeviceDisconnected(data: any): void {
    console.log('📡 Real-time device disconnected:', data);
    
    // Update device connection status
    const device = this.devices.find(d => d.ip === data.deviceIP);
    if (device) {
      device.isConnected = false;
    }
    
    // Reset connection status if this was the connected device
    if (this.currentStatus.deviceIP === data.deviceIP) {
      this.currentStatus.isConnected = false;
      this.currentStatus.deviceName = undefined;
      this.currentStatus.deviceIP = undefined;
      this.currentStatus.playerState = 'idle';
    }
    
    this.notifyDeviceListeners();
    this.notifyStatusListeners();
  }

  private handleCastStatusUpdate(data: any): void {
    console.log('📡 Real-time cast status update:', data);
    
    // Update current status
    this.currentStatus = {
      ...this.currentStatus,
      ...data,
    };
    
    this.notifyStatusListeners();
  }

  async destroy(): Promise<void> {
    try {
      // Stop discovery
      if (this.discoveryInterval) {
        clearInterval(this.discoveryInterval);
        this.discoveryInterval = null;
      }
      
      // Disconnect if connected
      if (this.currentStatus.isConnected) {
        await this.disconnect();
      }
      
      // Clear arrays
      this.devices = [];
      this.deviceListeners = [];
      this.statusListeners = [];
      
      console.log('🗑️ CastService destroyed');
    } catch (error) {
      console.error('Error destroying CastService:', error);
    }
  }
}

// Singleton instance
export const castService = new CastService();