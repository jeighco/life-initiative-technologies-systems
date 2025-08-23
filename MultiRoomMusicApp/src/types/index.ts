// Shared types for the Multi-Room Music App

// Music-related types
export interface MusicFile {
  id: string;
  name: string;
  path: string;
  artist?: string;
  album?: string;
  duration?: number;
  artwork?: string;
  source?: 'local' | 'spotify' | 'apple' | 'soundcloud';
}

export interface StreamingTrack {
  id: string;
  name: string;
  artist: string;
  album: string;
  duration: number;
  artwork?: string;
  uri: string;
  service: 'spotify' | 'apple' | 'soundcloud';
  isPlayable: boolean;
}

// Room/Snapcast types
export interface SnapcastClient {
  id: string;
  host: {
    name: string;
    ip: string;
  };
  config: {
    name: string;
    volume: {
      percent: number;
      muted: boolean;
    };
  };
  connected: boolean;
  groupId: string;
  groupName: string;
  groupMuted: boolean;
  lastSeen?: number;
}

export interface SnapcastGroup {
  id: string;
  name: string;
  muted: boolean;
  clients: string[];
  stream: string;
}

export interface Room {
  id: string;
  name: string;
  clients: SnapcastClient[];
  groupId?: string;
  isActive: boolean;
  volume: number;
  muted: boolean;
}

// Playback state
export interface PlaybackState {
  isPlaying: boolean;
  currentTrack: MusicFile | StreamingTrack | null;
  queue: (MusicFile | StreamingTrack)[];
  currentTrackIndex: number;
  position: number;
  duration: number;
  shuffle: boolean;
  repeat: 'none' | 'one' | 'all';
}

// Latency configuration
export interface LatencyConfig {
  snapcast: number;
  chromecast: number;
  bluetooth: number;
}

export interface ActiveZones {
  snapcast: boolean;
  chromecast: boolean;
  bluetooth: boolean;
}

// Authentication
export interface AuthState {
  isAuthenticated: boolean;
  user?: {
    id: string;
    name: string;
    email?: string;
  };
  streamingServices: {
    spotify?: {
      accessToken: string;
      refreshToken?: string;
      expiresAt: number;
      user: any;
    };
    apple?: {
      userToken: string;
      user: any;
    };
    soundcloud?: {
      accessToken: string;
      user: any;
    };
  };
}

// Server connection
export interface ConnectionState {
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  serverAddress: string;
  lastConnected?: number;
  error?: {
    code: string;
    message: string;
  };
}

// Device info
export interface DeviceInfo {
  name: string;
  type: string;
  ipAddress: string;
  isConnectedViaWifi: boolean;
  isConnectedViaBluetooth: boolean;
}