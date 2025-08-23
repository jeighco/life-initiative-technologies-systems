import { STREAMING_CONFIG } from '../config/streaming';
import { StreamingTrack } from '../types';

export class SoundCloudService {
  private accessToken: string | null = null;

  constructor() {
    // SoundCloud uses client credentials flow for public content
  }

  /**
   * Set user access token for personalized content
   */
  setAccessToken(accessToken: string): void {
    this.accessToken = accessToken;
  }

  /**
   * Generate OAuth URL for user authentication
   */
  getOAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: STREAMING_CONFIG.SOUNDCLOUD.CLIENT_ID,
      redirect_uri: STREAMING_CONFIG.SOUNDCLOUD.REDIRECT_URI,
      response_type: 'code',
      scope: 'non-expiring',
      display: 'popup'
    });

    return `${STREAMING_CONFIG.SOUNDCLOUD.AUTH_URL}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<string | null> {
    try {
      const response = await fetch(STREAMING_CONFIG.SOUNDCLOUD.TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: STREAMING_CONFIG.SOUNDCLOUD.CLIENT_ID,
          client_secret: STREAMING_CONFIG.SOUNDCLOUD.CLIENT_SECRET,
          redirect_uri: STREAMING_CONFIG.SOUNDCLOUD.REDIRECT_URI,
          grant_type: 'authorization_code',
          code: code
        })
      });

      if (!response.ok) {
        throw new Error(`SoundCloud token exchange failed: ${response.status}`);
      }

      const data = await response.json();
      this.accessToken = data.access_token;
      return this.accessToken;
    } catch (error) {
      console.error('SoundCloud token exchange error:', error);
      return null;
    }
  }

  /**
   * Search SoundCloud tracks
   */
  async searchTracks(query: string, limit: number = 25): Promise<StreamingTrack[]> {
    try {
      const url = new URL(`${STREAMING_CONFIG.SOUNDCLOUD.BASE_URL}/tracks`);
      url.searchParams.set('client_id', STREAMING_CONFIG.SOUNDCLOUD.CLIENT_ID);
      url.searchParams.set('q', query);
      url.searchParams.set('limit', limit.toString());
      url.searchParams.set('linked_partitioning', '1');

      if (this.accessToken) {
        url.searchParams.set('oauth_token', this.accessToken);
      }

      const response = await fetch(url.toString());

      if (!response.ok) {
        throw new Error(`SoundCloud API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return this.transformSoundCloudTracks(data.collection || []);
    } catch (error) {
      console.error('SoundCloud search error:', error);
      throw error;
    }
  }

  /**
   * Get track details by ID
   */
  async getTrack(trackId: string): Promise<StreamingTrack | null> {
    try {
      const url = new URL(`${STREAMING_CONFIG.SOUNDCLOUD.BASE_URL}/tracks/${trackId}`);
      url.searchParams.set('client_id', STREAMING_CONFIG.SOUNDCLOUD.CLIENT_ID);

      if (this.accessToken) {
        url.searchParams.set('oauth_token', this.accessToken);
      }

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

  /**
   * Get user's liked tracks (requires authentication)
   */
  async getUserLikes(limit: number = 100): Promise<StreamingTrack[]> {
    try {
      if (!this.accessToken) {
        throw new Error('Access token required for user likes');
      }

      const url = new URL(`${STREAMING_CONFIG.SOUNDCLOUD.BASE_URL}/me/favorites`);
      url.searchParams.set('client_id', STREAMING_CONFIG.SOUNDCLOUD.CLIENT_ID);
      url.searchParams.set('oauth_token', this.accessToken);
      url.searchParams.set('limit', limit.toString());

      const response = await fetch(url.toString());

      if (!response.ok) {
        throw new Error(`SoundCloud likes error: ${response.status}`);
      }

      const data = await response.json();
      return this.transformSoundCloudTracks(data || []);
    } catch (error) {
      console.error('SoundCloud likes error:', error);
      throw error;
    }
  }

  /**
   * Get trending tracks
   */
  async getTrendingTracks(genre?: string, limit: number = 50): Promise<StreamingTrack[]> {
    try {
      const url = new URL(`${STREAMING_CONFIG.SOUNDCLOUD.BASE_URL}/tracks`);
      url.searchParams.set('client_id', STREAMING_CONFIG.SOUNDCLOUD.CLIENT_ID);
      url.searchParams.set('limit', limit.toString());
      url.searchParams.set('order', 'hotness');
      url.searchParams.set('linked_partitioning', '1');

      if (genre) {
        url.searchParams.set('tags', genre);
      }

      if (this.accessToken) {
        url.searchParams.set('oauth_token', this.accessToken);
      }

      const response = await fetch(url.toString());

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return this.transformSoundCloudTracks(data.collection || []);
    } catch (error) {
      console.error('SoundCloud trending error:', error);
      return [];
    }
  }

  /**
   * Get user's playlists
   */
  async getUserPlaylists(limit: number = 20): Promise<any[]> {
    try {
      if (!this.accessToken) {
        return [];
      }

      const url = new URL(`${STREAMING_CONFIG.SOUNDCLOUD.BASE_URL}/me/playlists`);
      url.searchParams.set('client_id', STREAMING_CONFIG.SOUNDCLOUD.CLIENT_ID);
      url.searchParams.set('oauth_token', this.accessToken);
      url.searchParams.set('limit', limit.toString());

      const response = await fetch(url.toString());

      if (!response.ok) {
        return [];
      }

      return await response.json();
    } catch (error) {
      console.error('SoundCloud playlists error:', error);
      return [];
    }
  }

  /**
   * Transform SoundCloud track data to our standard format
   */
  private transformSoundCloudTracks(soundcloudTracks: any[]): StreamingTrack[] {
    return soundcloudTracks
      .filter(track => track.streamable) // Only include streamable tracks
      .map(track => ({
        id: track.id.toString(),
        name: track.title || 'Unknown',
        artist: track.user?.username || 'Unknown Artist',
        album: track.user?.username || 'SoundCloud',
        duration: track.duration ? Math.floor(track.duration / 1000) : 0,
        uri: track.permalink_url || '',
        streamUrl: this.getStreamUrl(track),
        artwork: track.artwork_url ? {
          url: track.artwork_url.replace('-large', '-t500x500'),
          width: 500,
          height: 500
        } : undefined,
        service: 'soundcloud',
        explicit: false, // SoundCloud doesn't have explicit flags
        preview: {
          url: this.getStreamUrl(track),
          duration: Math.min(Math.floor((track.duration || 0) / 1000), 30)
        },
        metadata: {
          genre: track.genre,
          description: track.description,
          playbackCount: track.playback_count,
          likesCount: track.favoritings_count,
          createdAt: track.created_at,
          waveform: track.waveform_url
        }
      }));
  }

  /**
   * Get streaming URL for a track
   */
  private getStreamUrl(track: any): string {
    if (track.stream_url) {
      return `${track.stream_url}?client_id=${STREAMING_CONFIG.SOUNDCLOUD.CLIENT_ID}`;
    }
    
    // Fallback for tracks without direct stream URLs
    if (track.id) {
      return `${STREAMING_CONFIG.SOUNDCLOUD.BASE_URL}/tracks/${track.id}/stream?client_id=${STREAMING_CONFIG.SOUNDCLOUD.CLIENT_ID}`;
    }
    
    return '';
  }

  /**
   * Get streaming URL for playback
   */
  async getStreamingUrl(trackId: string): Promise<string | null> {
    try {
      const track = await this.getTrack(trackId);
      return track?.streamUrl || null;
    } catch (error) {
      console.error('SoundCloud streaming URL error:', error);
      return null;
    }
  }

  /**
   * Check if service is available
   */
  isAvailable(): boolean {
    return !!STREAMING_CONFIG.SOUNDCLOUD.CLIENT_ID;
  }

  /**
   * Get service info
   */
  getServiceInfo() {
    return {
      name: 'SoundCloud',
      authenticated: this.isAvailable(),
      userAuthenticated: !!this.accessToken,
      trackCount: 'Millions',
      features: ['Search', 'Trending', 'User Likes', 'Playlists', 'Independent Artists']
    };
  }
}