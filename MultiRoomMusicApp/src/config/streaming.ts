// Multi-Room Music - Streaming API Configuration
export const STREAMING_CONFIG = {
  // Apple Music Configuration
  APPLE_MUSIC: {
    KEY_ID: 'T6X6PH96JC',
    TEAM_ID: 'F22N4PPU7P', 
    PRIVATE_KEY_PATH: '/Users/jei/Downloads/AuthKey_T6X6PH96JC.p8',
    BASE_URL: 'https://api.music.apple.com/v1',
    ALGORITHM: 'ES256',
    AUDIENCE: 'https://appleid.apple.com',
    ISSUER: 'F22N4PPU7P'
  },

  // SoundCloud Configuration  
  SOUNDCLOUD: {
    CLIENT_ID: 'XW960FvK6634c0ts6Y0m0o0iXCTWN81H',
    CLIENT_SECRET: 'LG9LQcHIZ2r6hJFLEL83jZChjPw5qimc',
    REDIRECT_URI: 'iniviv://soundcloud/callback',
    BASE_URL: 'https://api.soundcloud.com',
    AUTH_URL: 'https://soundcloud.com/connect',
    TOKEN_URL: 'https://api.soundcloud.com/oauth2/token'
  },

  // Spotify Configuration (Ready for future integration)
  SPOTIFY: {
    CLIENT_ID: '', // To be added when ready
    CLIENT_SECRET: '', 
    REDIRECT_URI: 'iniviv://spotify/callback',
    BASE_URL: 'https://api.spotify.com/v1',
    AUTH_URL: 'https://accounts.spotify.com/authorize',
    TOKEN_URL: 'https://accounts.spotify.com/api/token'
  }
};

// Supported streaming services
export const STREAMING_SERVICES = [
  {
    id: 'apple-music',
    name: 'Apple Music',
    icon: '🍎',
    color: '#FF1744',
    available: true,
    description: '100+ million songs from Apple Music'
  },
  {
    id: 'soundcloud',
    name: 'SoundCloud', 
    icon: '☁️',
    color: '#FF5500',
    available: true,
    description: 'Independent artists and podcasts'
  },
  {
    id: 'spotify',
    name: 'Spotify',
    icon: '🎵', 
    color: '#1DB954',
    available: false,
    description: 'Coming soon - millions of tracks'
  }
];

// JWT token expiry times
export const TOKEN_EXPIRY = {
  APPLE_MUSIC_JWT: 60 * 60, // 1 hour
  SOUNDCLOUD_ACCESS: 60 * 60 * 24 * 365, // 1 year
  SPOTIFY_ACCESS: 60 * 60, // 1 hour
  SPOTIFY_REFRESH: 60 * 60 * 24 * 30 // 30 days
};