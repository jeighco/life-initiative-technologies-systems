// Navigation parameter lists for type safety

export type RootTabParamList = {
  Home: undefined;
  Rooms: undefined;
  Library: undefined;
  Queue: undefined;
  Streaming: undefined;
  Cast: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Main: undefined;
  Login: undefined;
  SpotifyAuth: undefined;
  AppleMusicAuth: undefined;
  SoundCloudAuth: undefined;
};

// Streaming service types
export type StreamingService = 'spotify' | 'apple' | 'soundcloud';

export interface StreamingAuth {
  service: StreamingService;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  userId?: string;
}