import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { castService, CastDevice, CastStatus, MediaMetadata } from '../services/CastService';
import { useMusic } from './MusicContext';
import { useSocket } from './SocketContext';

interface CastContextValue {
  devices: CastDevice[];
  castStatus: CastStatus;
  isDiscovering: boolean;
  
  // Device management
  startDiscovery: () => Promise<void>;
  stopDiscovery: () => Promise<void>;
  connectToDevice: (deviceId: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
  
  // Media control
  castCurrentTrack: () => Promise<boolean>;
  castMedia: (streamUrl: string, metadata: MediaMetadata) => Promise<boolean>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;
  seek: (time: number) => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  toggleMute: () => Promise<void>;
}

const CastContext = createContext<CastContextValue | undefined>(undefined);

export const CastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { playbackState } = useMusic();
  const { socket, connectionState } = useSocket();
  const [devices, setDevices] = useState<CastDevice[]>([]);
  const [castStatus, setCastStatus] = useState<CastStatus>({
    isConnected: false,
    playerState: 'idle',
    currentTime: 0,
    duration: 0,
    volume: 1.0,
    muted: false,
  });
  const [isDiscovering, setIsDiscovering] = useState(false);

  useEffect(() => {
    // Initialize cast service
    const initializeCast = async () => {
      try {
        // Connect socket for real-time updates
        castService.setSocket(socket);
        
        // Set server address from socket context
        if (connectionState.serverAddress) {
          castService.setServerAddress(connectionState.serverAddress);
        }
        
        await castService.initialize();
        setIsDiscovering(true);
      } catch (error) {
        console.error('Failed to initialize cast service:', error);
      }
    };

    initializeCast();

    // Subscribe to device list changes
    const unsubscribeDevices = castService.onDeviceListChange((newDevices) => {
      setDevices(newDevices);
    });

    // Subscribe to status changes
    const unsubscribeStatus = castService.onStatusChange((newStatus) => {
      setCastStatus(newStatus);
    });

    return () => {
      unsubscribeDevices();
      unsubscribeStatus();
      castService.destroy();
    };
  }, [socket, connectionState.serverAddress]);

  const startDiscovery = useCallback(async () => {
    try {
      await castService.initialize();
      setIsDiscovering(true);
    } catch (error) {
      console.error('Failed to start discovery:', error);
    }
  }, []);

  const stopDiscovery = useCallback(async () => {
    try {
      await castService.destroy();
      setIsDiscovering(false);
    } catch (error) {
      console.error('Failed to stop discovery:', error);
    }
  }, []);

  const connectToDevice = useCallback(async (deviceId: string) => {
    return await castService.connectToDevice(deviceId);
  }, []);

  const disconnect = useCallback(async () => {
    await castService.disconnect();
  }, []);

  const castCurrentTrack = useCallback(async (): Promise<boolean> => {
    console.log('🎵 Cast current track called', {
      hasCurrentTrack: !!playbackState.currentTrack,
      isConnected: castStatus.isConnected,
      deviceName: castStatus.deviceName,
      currentTrack: playbackState.currentTrack?.name
    });

    if (!playbackState.currentTrack) {
      console.warn('❌ No current track to cast');
      return false;
    }

    if (!castStatus.isConnected) {
      console.warn('❌ No cast device connected');
      return false;
    }

    // Construct stream URL - assuming the server provides HTTP streaming
    const streamUrl = `${connectionState.serverAddress}/stream/current`;
    
    const metadata: MediaMetadata = {
      title: playbackState.currentTrack.name,
      artist: playbackState.currentTrack.artist,
      album: (playbackState.currentTrack as any).album,
      artwork: (playbackState.currentTrack as any).artwork,
      duration: playbackState.duration,
    };

    console.log('📡 Casting to device:', {
      deviceName: castStatus.deviceName,
      deviceIP: castStatus.deviceIP,
      streamUrl,
      metadata
    });

    try {
      const success = await castService.castMedia(streamUrl, metadata);
      console.log('🎯 Cast result:', success);
      return success;
    } catch (error) {
      console.error('❌ Cast failed:', error);
      return false;
    }
  }, [playbackState.currentTrack, playbackState.duration, castStatus, connectionState.serverAddress]);

  const castMedia = useCallback(async (streamUrl: string, metadata: MediaMetadata): Promise<boolean> => {
    return await castService.castMedia(streamUrl, metadata);
  }, []);

  const play = useCallback(async () => {
    await castService.play();
  }, []);

  const pause = useCallback(async () => {
    await castService.pause();
  }, []);

  const stop = useCallback(async () => {
    await castService.stop();
  }, []);

  const seek = useCallback(async (time: number) => {
    await castService.seek(time);
  }, []);

  const setVolume = useCallback(async (volume: number) => {
    await castService.setVolume(volume);
  }, []);

  const toggleMute = useCallback(async () => {
    await castService.toggleMute();
  }, []);

  const contextValue: CastContextValue = {
    devices,
    castStatus,
    isDiscovering,
    
    // Device management
    startDiscovery,
    stopDiscovery,
    connectToDevice,
    disconnect,
    
    // Media control
    castCurrentTrack,
    castMedia,
    play,
    pause,
    stop,
    seek,
    setVolume,
    toggleMute,
  };

  return (
    <CastContext.Provider value={contextValue}>
      {children}
    </CastContext.Provider>
  );
};

export const useCast = (): CastContextValue => {
  const context = useContext(CastContext);
  if (!context) {
    throw new Error('useCast must be used within a CastProvider');
  }
  return context;
};