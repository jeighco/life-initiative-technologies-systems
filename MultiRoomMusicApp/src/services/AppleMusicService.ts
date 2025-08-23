import jwt from 'jsonwebtoken';
import { STREAMING_CONFIG, TOKEN_EXPIRY } from '../config/streaming';
import { StreamingTrack } from '../types';

export class AppleMusicService {
  private developerToken: string | null = null;
  private userToken: string | null = null;

  constructor() {
    this.generateDeveloperToken();
  }

  /**
   * Generate Apple Music Developer JWT Token
   */
  private generateDeveloperToken(): void {
    try {
      const fs = require('fs');
      const privateKey = fs.readFileSync(STREAMING_CONFIG.APPLE_MUSIC.PRIVATE_KEY_PATH, 'utf8');

      const payload = {
        iss: STREAMING_CONFIG.APPLE_MUSIC.TEAM_ID,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + TOKEN_EXPIRY.APPLE_MUSIC_JWT,
        aud: STREAMING_CONFIG.APPLE_MUSIC.AUDIENCE
      };

      const header = {
        alg: STREAMING_CONFIG.APPLE_MUSIC.ALGORITHM,
        kid: STREAMING_CONFIG.APPLE_MUSIC.KEY_ID
      };

      this.developerToken = jwt.sign(payload, privateKey, { 
        algorithm: 'ES256',
        header 
      });

      console.log('✅ Apple Music Developer Token generated');
    } catch (error) {
      console.error('❌ Failed to generate Apple Music Developer Token:', error);
    }
  }

  /**
   * Set user token for personalized content
   */
  setUserToken(userToken: string): void {
    this.userToken = userToken;
  }

  /**
   * Get authorization headers
   */
  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.developerToken}`,
      'Content-Type': 'application/json'
    };

    if (this.userToken) {
      headers['Music-User-Token'] = this.userToken;
    }

    return headers;
  }

  /**
   * Search Apple Music catalog
   */
  async searchTracks(query: string, limit: number = 25): Promise<StreamingTrack[]> {
    try {
      if (!this.developerToken) {
        throw new Error('Apple Music Developer Token not available');
      }

      const url = new URL(`${STREAMING_CONFIG.APPLE_MUSIC.BASE_URL}/catalog/us/search`);
      url.searchParams.set('term', query);
      url.searchParams.set('types', 'songs');
      url.searchParams.set('limit', limit.toString());

      const response = await fetch(url.toString(), {
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error(`Apple Music API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return this.transformAppleMusicTracks(data.results?.songs?.data || []);
    } catch (error) {
      console.error('Apple Music search error:', error);
      throw error;
    }
  }

  /**
   * Get track details by ID
   */
  async getTrack(trackId: string): Promise<StreamingTrack | null> {
    try {
      const response = await fetch(
        `${STREAMING_CONFIG.APPLE_MUSIC.BASE_URL}/catalog/us/songs/${trackId}`,
        { headers: this.getAuthHeaders() }
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

  /**
   * Get user's library (requires user token)
   */
  async getUserLibrary(limit: number = 100): Promise<StreamingTrack[]> {
    try {
      if (!this.userToken) {
        throw new Error('User token required for library access');
      }

      const response = await fetch(
        `${STREAMING_CONFIG.APPLE_MUSIC.BASE_URL}/me/library/songs?limit=${limit}`,
        { headers: this.getAuthHeaders() }
      );

      if (!response.ok) {
        throw new Error(`Apple Music library error: ${response.status}`);
      }

      const data = await response.json();
      return this.transformAppleMusicTracks(data.data || []);
    } catch (error) {
      console.error('Apple Music library error:', error);
      throw error;
    }
  }

  /**
   * Get recently played tracks
   */
  async getRecentlyPlayed(limit: number = 50): Promise<StreamingTrack[]> {
    try {
      if (!this.userToken) {
        return [];
      }

      const response = await fetch(
        `${STREAMING_CONFIG.APPLE_MUSIC.BASE_URL}/me/recent/played/tracks?limit=${limit}`,
        { headers: this.getAuthHeaders() }
      );

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return this.transformAppleMusicTracks(data.data || []);
    } catch (error) {
      console.error('Apple Music recently played error:', error);
      return [];
    }
  }

  /**
   * Get curated playlists
   */
  async getCuratedPlaylists(limit: number = 20): Promise<any[]> {
    try {
      const response = await fetch(
        `${STREAMING_CONFIG.APPLE_MUSIC.BASE_URL}/catalog/us/playlists?limit=${limit}`,
        { headers: this.getAuthHeaders() }
      );

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return data.data || [];
    } catch (error) {
      console.error('Apple Music playlists error:', error);
      return [];
    }
  }

  /**
   * Transform Apple Music track data to our standard format
   */
  private transformAppleMusicTracks(appleMusicTracks: any[]): StreamingTrack[] {
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
      } : undefined,
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
        trackNumber: track.attributes?.trackNumber,
        discNumber: track.attributes?.discNumber
      }
    }));
  }

  /**
   * Get streaming URL for playback
   */
  async getStreamingUrl(trackId: string): Promise<string | null> {
    try {
      const track = await this.getTrack(trackId);
      return track?.streamUrl || null;
    } catch (error) {
      console.error('Apple Music streaming URL error:', error);
      return null;
    }
  }

  /**
   * Check if service is available
   */
  isAvailable(): boolean {
    return !!this.developerToken;
  }

  /**
   * Get service info
   */
  getServiceInfo() {
    return {
      name: 'Apple Music',
      authenticated: this.isAvailable(),
      userAuthenticated: !!this.userToken,
      trackCount: '100+ million',
      features: ['Search', 'User Library', 'Recently Played', 'Curated Playlists']
    };
  }
}