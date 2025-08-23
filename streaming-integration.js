const jwt = require('jsonwebtoken');
const fs = require('fs');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// Streaming API Configuration
const STREAMING_CONFIG = {
  APPLE_MUSIC: {
    KEY_ID: 'T6X6PH96JC',
    TEAM_ID: 'F22N4PPU7P',
    PRIVATE_KEY_PATH: '/Users/jei/Downloads/AuthKey_T6X6PH96JC.p8',
    BASE_URL: 'https://api.music.apple.com/v1',
    ALGORITHM: 'ES256'
  },
  SOUNDCLOUD: {
    CLIENT_ID: 'XW960FvK6634c0ts6Y0m0o0iXCTWN81H',
    CLIENT_SECRET: 'LG9LQcHIZ2r6hJFLEL83jZChjPw5qimc',
    BASE_URL: 'https://api.soundcloud.com'
  }
};

class StreamingIntegration {
  constructor() {
    this.appleMusicToken = null;
    this.generateAppleMusicToken();
  }

  // Generate Apple Music JWT Token
  generateAppleMusicToken() {
    try {
      if (!fs.existsSync(STREAMING_CONFIG.APPLE_MUSIC.PRIVATE_KEY_PATH)) {
        console.log('⚠️ Apple Music private key not found at path:', STREAMING_CONFIG.APPLE_MUSIC.PRIVATE_KEY_PATH);
        return;
      }

      const privateKey = fs.readFileSync(STREAMING_CONFIG.APPLE_MUSIC.PRIVATE_KEY_PATH, 'utf8');

      const payload = {
        iss: STREAMING_CONFIG.APPLE_MUSIC.TEAM_ID,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour
      };

      const header = {
        alg: STREAMING_CONFIG.APPLE_MUSIC.ALGORITHM,
        kid: STREAMING_CONFIG.APPLE_MUSIC.KEY_ID
      };

      this.appleMusicToken = jwt.sign(payload, privateKey, { 
        algorithm: 'ES256',
        header 
      });

      console.log('✅ Apple Music JWT token generated successfully');
    } catch (error) {
      console.error('❌ Failed to generate Apple Music token:', error.message);
    }
  }

  // Search Apple Music
  async searchAppleMusic(query, limit = 25) {
    try {
      if (!this.appleMusicToken) {
        throw new Error('Apple Music token not available');
      }

      const url = new URL(`${STREAMING_CONFIG.APPLE_MUSIC.BASE_URL}/catalog/us/search`);
      url.searchParams.set('term', query);
      url.searchParams.set('types', 'songs');
      url.searchParams.set('limit', limit.toString());

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${this.appleMusicToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Apple Music API error: ${response.status}`);
      }

      const data = await response.json();
      return this.transformAppleMusicTracks(data.results?.songs?.data || []);
    } catch (error) {
      console.error('Apple Music search error:', error);
      throw error;
    }
  }

  // Search SoundCloud
  async searchSoundCloud(query, limit = 25) {
    try {
      const url = new URL(`${STREAMING_CONFIG.SOUNDCLOUD.BASE_URL}/tracks`);
      url.searchParams.set('client_id', STREAMING_CONFIG.SOUNDCLOUD.CLIENT_ID);
      url.searchParams.set('q', query);
      url.searchParams.set('limit', limit.toString());
      url.searchParams.set('linked_partitioning', '1');

      const response = await fetch(url.toString());

      if (!response.ok) {
        throw new Error(`SoundCloud API error: ${response.status}`);
      }

      const data = await response.json();
      return this.transformSoundCloudTracks(data.collection || []);
    } catch (error) {
      console.error('SoundCloud search error:', error);
      throw error;
    }
  }

  // Transform Apple Music tracks to standard format
  transformAppleMusicTracks(appleMusicTracks) {
    return appleMusicTracks.map(track => ({
      id: track.id,
      name: track.attributes?.name || 'Unknown',
      artist: track.attributes?.artistName || 'Unknown Artist',
      album: track.attributes?.albumName || 'Unknown Album',
      duration: track.attributes?.durationInMillis ? 
        Math.floor(track.attributes.durationInMillis / 1000) : 0,
      uri: track.attributes?.url || '',
      streamUrl: track.attributes?.previews?.[0]?.url || '',
      artwork: track.attributes?.artwork ? {
        url: track.attributes.artwork.url?.replace('{w}x{h}', '300x300'),
        width: 300,
        height: 300
      } : null,
      service: 'apple-music',
      explicit: track.attributes?.contentRating === 'explicit',
      preview: {
        url: track.attributes?.previews?.[0]?.url || '',
        duration: 30
      },
      metadata: {
        isrc: track.attributes?.isrc,
        genre: track.attributes?.genreNames?.[0],
        releaseDate: track.attributes?.releaseDate,
        trackNumber: track.attributes?.trackNumber
      }
    }));
  }

  // Transform SoundCloud tracks to standard format
  transformSoundCloudTracks(soundcloudTracks) {
    return soundcloudTracks
      .filter(track => track.streamable)
      .map(track => ({
        id: track.id.toString(),
        name: track.title || 'Unknown',
        artist: track.user?.username || 'Unknown Artist',
        album: track.user?.username || 'SoundCloud',
        duration: track.duration ? Math.floor(track.duration / 1000) : 0,
        uri: track.permalink_url || '',
        streamUrl: track.stream_url ? 
          `${track.stream_url}?client_id=${STREAMING_CONFIG.SOUNDCLOUD.CLIENT_ID}` : '',
        artwork: track.artwork_url ? {
          url: track.artwork_url.replace('-large', '-t500x500'),
          width: 500,
          height: 500
        } : null,
        service: 'soundcloud',
        explicit: false,
        preview: {
          url: track.stream_url ? 
            `${track.stream_url}?client_id=${STREAMING_CONFIG.SOUNDCLOUD.CLIENT_ID}` : '',
          duration: Math.min(Math.floor((track.duration || 0) / 1000), 30)
        },
        metadata: {
          genre: track.genre,
          description: track.description,
          playbackCount: track.playback_count,
          likesCount: track.favoritings_count,
          createdAt: track.created_at
        }
      }));
  }

  // Get streaming URL for playback
  async getStreamingUrl(trackId, service) {
    try {
      switch (service) {
        case 'apple-music':
          // Apple Music requires user authentication for full tracks
          // For now, return preview URL
          const appleTrack = await this.getAppleMusicTrack(trackId);
          return appleTrack?.preview?.url || null;
          
        case 'soundcloud':
          // SoundCloud provides direct streaming URLs
          const soundcloudTrack = await this.getSoundCloudTrack(trackId);
          return soundcloudTrack?.streamUrl || null;
          
        default:
          return null;
      }
    } catch (error) {
      console.error('Get streaming URL error:', error);
      return null;
    }
  }

  // Get single Apple Music track
  async getAppleMusicTrack(trackId) {
    try {
      if (!this.appleMusicToken) {
        return null;
      }

      const response = await fetch(
        `${STREAMING_CONFIG.APPLE_MUSIC.BASE_URL}/catalog/us/songs/${trackId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.appleMusicToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const tracks = this.transformAppleMusicTracks(data.data || []);
      return tracks[0] || null;
    } catch (error) {
      console.error('Apple Music track fetch error:', error);
      return null;
    }
  }

  // Get single SoundCloud track
  async getSoundCloudTrack(trackId) {
    try {
      const url = new URL(`${STREAMING_CONFIG.SOUNDCLOUD.BASE_URL}/tracks/${trackId}`);
      url.searchParams.set('client_id', STREAMING_CONFIG.SOUNDCLOUD.CLIENT_ID);

      const response = await fetch(url.toString());

      if (!response.ok) {
        return null;
      }

      const track = await response.json();
      const tracks = this.transformSoundCloudTracks([track]);
      return tracks[0] || null;
    } catch (error) {
      console.error('SoundCloud track fetch error:', error);
      return null;
    }
  }

  // Get service status
  getStatus() {
    return {
      appleMusic: {
        available: !!this.appleMusicToken,
        keyId: STREAMING_CONFIG.APPLE_MUSIC.KEY_ID,
        teamId: STREAMING_CONFIG.APPLE_MUSIC.TEAM_ID
      },
      soundCloud: {
        available: !!STREAMING_CONFIG.SOUNDCLOUD.CLIENT_ID,
        clientId: STREAMING_CONFIG.SOUNDCLOUD.CLIENT_ID
      }
    };
  }
}

module.exports = StreamingIntegration;