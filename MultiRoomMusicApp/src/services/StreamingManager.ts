import { AppleMusicService } from './AppleMusicService';
import { SoundCloudService } from './SoundCloudService';
import { StreamingTrack } from '../types';
import { STREAMING_SERVICES } from '../config/streaming';

export class StreamingManager {
  private appleMusicService: AppleMusicService;
  private soundCloudService: SoundCloudService;

  constructor() {
    this.appleMusicService = new AppleMusicService();
    this.soundCloudService = new SoundCloudService();
  }

  /**
   * Search across all available streaming services
   */
  async searchAllServices(query: string, limit: number = 25): Promise<{
    appleMusic: StreamingTrack[];
    soundCloud: StreamingTrack[];
    combined: StreamingTrack[];
  }> {
    const results = {
      appleMusic: [] as StreamingTrack[],
      soundCloud: [] as StreamingTrack[],
      combined: [] as StreamingTrack[]
    };

    try {
      // Search all services in parallel
      const [appleMusicResults, soundCloudResults] = await Promise.allSettled([
        this.appleMusicService.searchTracks(query, limit),
        this.soundCloudService.searchTracks(query, limit)
      ]);

      // Process Apple Music results
      if (appleMusicResults.status === 'fulfilled') {
        results.appleMusic = appleMusicResults.value;
        results.combined.push(...appleMusicResults.value);
      } else {
        console.warn('Apple Music search failed:', appleMusicResults.reason);
      }

      // Process SoundCloud results  
      if (soundCloudResults.status === 'fulfilled') {
        results.soundCloud = soundCloudResults.value;
        results.combined.push(...soundCloudResults.value);
      } else {
        console.warn('SoundCloud search failed:', soundCloudResults.reason);
      }

      // Sort combined results by relevance (prioritize exact matches)
      results.combined = this.sortByRelevance(results.combined, query);

      return results;
    } catch (error) {
      console.error('StreamingManager search error:', error);
      return results;
    }
  }

  /**
   * Get track from specific service
   */
  async getTrack(trackId: string, service: 'apple-music' | 'soundcloud'): Promise<StreamingTrack | null> {
    try {
      switch (service) {
        case 'apple-music':
          return await this.appleMusicService.getTrack(trackId);
        case 'soundcloud':
          return await this.soundCloudService.getTrack(trackId);
        default:
          throw new Error(`Unknown service: ${service}`);
      }
    } catch (error) {
      console.error(`Get track error for ${service}:`, error);
      return null;
    }
  }

  /**
   * Get streaming URL for playback
   */
  async getStreamingUrl(trackId: string, service: 'apple-music' | 'soundcloud'): Promise<string | null> {
    try {
      switch (service) {
        case 'apple-music':
          return await this.appleMusicService.getStreamingUrl(trackId);
        case 'soundcloud':
          return await this.soundCloudService.getStreamingUrl(trackId);
        default:
          return null;
      }
    } catch (error) {
      console.error(`Streaming URL error for ${service}:`, error);
      return null;
    }
  }

  /**
   * Get personalized content for user
   */
  async getPersonalizedContent(service: 'apple-music' | 'soundcloud'): Promise<{
    recentlyPlayed: StreamingTrack[];
    userLibrary: StreamingTrack[];
    playlists: any[];
  }> {
    const content = {
      recentlyPlayed: [] as StreamingTrack[],
      userLibrary: [] as StreamingTrack[],
      playlists: [] as any[]
    };

    try {
      switch (service) {
        case 'apple-music':
          const [recentlyPlayed, userLibrary, playlists] = await Promise.allSettled([
            this.appleMusicService.getRecentlyPlayed(),
            this.appleMusicService.getUserLibrary(),
            this.appleMusicService.getCuratedPlaylists()
          ]);

          if (recentlyPlayed.status === 'fulfilled') {
            content.recentlyPlayed = recentlyPlayed.value;
          }
          if (userLibrary.status === 'fulfilled') {
            content.userLibrary = userLibrary.value;
          }
          if (playlists.status === 'fulfilled') {
            content.playlists = playlists.value;
          }
          break;

        case 'soundcloud':
          const [userLikes, userPlaylists, trending] = await Promise.allSettled([
            this.soundCloudService.getUserLikes(),
            this.soundCloudService.getUserPlaylists(),
            this.soundCloudService.getTrendingTracks()
          ]);

          if (userLikes.status === 'fulfilled') {
            content.userLibrary = userLikes.value;
          }
          if (userPlaylists.status === 'fulfilled') {
            content.playlists = userPlaylists.value;
          }
          if (trending.status === 'fulfilled') {
            content.recentlyPlayed = trending.value.slice(0, 20);
          }
          break;
      }

      return content;
    } catch (error) {
      console.error(`Personalized content error for ${service}:`, error);
      return content;
    }
  }

  /**
   * Get trending/featured content
   */
  async getFeaturedContent(): Promise<{
    appleMusicPlaylists: any[];
    soundCloudTrending: StreamingTrack[];
    combined: StreamingTrack[];
  }> {
    const content = {
      appleMusicPlaylists: [] as any[],
      soundCloudTrending: [] as StreamingTrack[],
      combined: [] as StreamingTrack[]
    };

    try {
      const [appleMusicPlaylists, soundCloudTrending] = await Promise.allSettled([
        this.appleMusicService.getCuratedPlaylists(),
        this.soundCloudService.getTrendingTracks()
      ]);

      if (appleMusicPlaylists.status === 'fulfilled') {
        content.appleMusicPlaylists = appleMusicPlaylists.value;
      }

      if (soundCloudTrending.status === 'fulfilled') {
        content.soundCloudTrending = soundCloudTrending.value;
        content.combined.push(...soundCloudTrending.value);
      }

      return content;
    } catch (error) {
      console.error('Featured content error:', error);
      return content;
    }
  }

  /**
   * Set user tokens for personalized content
   */
  setUserTokens(appleMusicUserToken?: string, soundCloudAccessToken?: string): void {
    if (appleMusicUserToken) {
      this.appleMusicService.setUserToken(appleMusicUserToken);
    }
    
    if (soundCloudAccessToken) {
      this.soundCloudService.setAccessToken(soundCloudAccessToken);
    }
  }

  /**
   * Get OAuth URLs for user authentication
   */
  getOAuthUrls(): { soundCloud: string } {
    return {
      soundCloud: this.soundCloudService.getOAuthUrl()
    };
  }

  /**
   * Exchange OAuth codes for tokens
   */
  async exchangeOAuthCode(service: 'soundcloud', code: string): Promise<string | null> {
    try {
      switch (service) {
        case 'soundcloud':
          return await this.soundCloudService.exchangeCodeForToken(code);
        default:
          throw new Error(`OAuth not supported for service: ${service}`);
      }
    } catch (error) {
      console.error(`OAuth exchange error for ${service}:`, error);
      return null;
    }
  }

  /**
   * Get all available services and their status
   */
  getServicesStatus(): typeof STREAMING_SERVICES {
    const services = [...STREAMING_SERVICES];
    
    // Update availability based on actual service status
    services.forEach(service => {
      switch (service.id) {
        case 'apple-music':
          service.available = this.appleMusicService.isAvailable();
          break;
        case 'soundcloud':
          service.available = this.soundCloudService.isAvailable();
          break;
        case 'spotify':
          service.available = false; // Not implemented yet
          break;
      }
    });

    return services;
  }

  /**
   * Get detailed service information
   */
  getServiceInfo() {
    return {
      appleMusic: this.appleMusicService.getServiceInfo(),
      soundCloud: this.soundCloudService.getServiceInfo(),
      totalServices: 2,
      activeServices: [
        this.appleMusicService.isAvailable() ? 'apple-music' : null,
        this.soundCloudService.isAvailable() ? 'soundcloud' : null
      ].filter(Boolean)
    };
  }

  /**
   * Sort tracks by relevance to search query
   */
  private sortByRelevance(tracks: StreamingTrack[], query: string): StreamingTrack[] {
    const queryLower = query.toLowerCase();
    
    return tracks.sort((a, b) => {
      // Exact title matches get highest priority
      const aExactTitle = a.name.toLowerCase().includes(queryLower) ? 1 : 0;
      const bExactTitle = b.name.toLowerCase().includes(queryLower) ? 1 : 0;
      
      if (aExactTitle !== bExactTitle) {
        return bExactTitle - aExactTitle;
      }
      
      // Then exact artist matches
      const aExactArtist = a.artist.toLowerCase().includes(queryLower) ? 1 : 0;
      const bExactArtist = b.artist.toLowerCase().includes(queryLower) ? 1 : 0;
      
      if (aExactArtist !== bExactArtist) {
        return bExactArtist - aExactArtist;
      }
      
      // Prefer Apple Music over SoundCloud for mainstream tracks
      if (a.service !== b.service) {
        return a.service === 'apple-music' ? -1 : 1;
      }
      
      // Finally sort by duration (prefer full tracks over previews)
      return b.duration - a.duration;
    });
  }
}