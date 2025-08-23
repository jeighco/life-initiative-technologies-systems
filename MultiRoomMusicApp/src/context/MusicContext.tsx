import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { MusicFile, StreamingTrack, PlaybackState } from '../types';
import { useSocket } from './SocketContext';
import { audioService } from '../services/AudioService';
import { appleMusicAuthService } from '../services/AppleMusicAuthService';

interface MusicContextValue {
  playbackState: PlaybackState;
  musicFiles: MusicFile[];
  streamingTracks: StreamingTrack[];
  
  // Playback controls
  play: () => void;
  pause: () => void;
  togglePlayPause: () => void;
  nextTrack: () => void;
  previousTrack: () => void;
  skipToTrack: (index: number) => void;
  playTrack: (track: MusicFile | StreamingTrack) => void;
  seekToPosition: (position: number) => void;
  
  // Queue management
  addToQueue: (track: MusicFile | StreamingTrack) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  moveQueueItem: (fromIndex: number, toIndex: number) => void;
  
  // Shuffle and repeat
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  
  // Library management
  refreshLibrary: () => void;
  uploadFile: (filePath: string) => Promise<void>;
  
  // Streaming integration
  searchSpotify: (query: string) => Promise<StreamingTrack[]>;
  searchAppleMusic: (query: string) => Promise<StreamingTrack[]>;
  searchSoundCloud: (query: string) => Promise<StreamingTrack[]>;
  
  // Apple Music authentication
  requestAppleMusicAuth: () => Promise<boolean>;
  signOutAppleMusic: () => Promise<void>;
  isAppleMusicAuthorized: boolean;
}

const MusicContext = createContext<MusicContextValue | undefined>(undefined);

export const MusicProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { socket, emit, connectionState } = useSocket();
  
  // Initialize AudioService
  useEffect(() => {
    const initializeAudio = async () => {
      try {
        await audioService.initialize();
        console.log('✅ AudioService initialized in MusicContext');
        
        // Initialize Apple Music authentication
        await appleMusicAuthService.initialize();
        const authStatus = await appleMusicAuthService.checkAuthorizationStatus();
        setIsAppleMusicAuthorized(authStatus.isAuthorized);
        console.log('✅ Apple Music auth service initialized');
      } catch (error) {
        console.error('❌ Failed to initialize services:', error);
      }
    };
    
    initializeAudio();
    
    return () => {
      // Cleanup audio service when component unmounts
      audioService.destroy();
    };
  }, []);
  
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    isPlaying: false,
    currentTrack: null,
    queue: [],
    currentTrackIndex: -1,
    position: 0,
    duration: 0,
    shuffle: false,
    repeat: 'none',
  });
  
  const [musicFiles, setMusicFiles] = useState<MusicFile[]>([]);
  const [streamingTracks, setStreamingTracks] = useState<StreamingTrack[]>([]);
  const [isAppleMusicAuthorized, setIsAppleMusicAuthorized] = useState<boolean>(false);

  // Handle iOS audio playbook based on server state
  const handleAudioPlayback = useCallback(async (
    newTrack: any, 
    isPlaying: boolean, 
    previousTrack: any, 
    wasPlaying: boolean
  ) => {
    try {
      // If track changed, we need to load new audio
      const trackChanged = newTrack?.id !== previousTrack?.id;
      
      if (trackChanged && newTrack) {
        console.log('🎵 Track changed, loading new audio:', newTrack.name);
        
        // Determine the stream URL - prioritize server stream for consistency
        let streamUrl = '';
        
        if (newTrack.previewUrl || newTrack.uri) {
          // For streaming tracks (Apple Music, etc), use the preview URL directly
          streamUrl = newTrack.previewUrl || newTrack.uri;
        } else {
          // For local files, stream from our server  
          const serverIP = connectionState.serverAddress.replace('http://', '').replace(':3000', '');
          streamUrl = `http://${serverIP}:3000/stream/current`;
        }
        
        console.log('📡 Streaming URL:', streamUrl);
        
        // Load the track in AudioService
        try {
          await audioService.playStream(
            streamUrl,
            newTrack.name || 'Unknown Track',
            newTrack.artist || 'Unknown Artist'
          );
        } catch (streamError) {
          console.error('❌ Failed to load stream, will retry:', streamError);
          // For local files, if server stream fails, wait and retry
          if (!newTrack.previewUrl && !newTrack.uri) {
            setTimeout(async () => {
              try {
                console.log('🔄 Retrying stream connection...');
                await audioService.playStream(
                  streamUrl,
                  newTrack.name || 'Unknown Track',
                  newTrack.artist || 'Unknown Artist'
                );
              } catch (retryError) {
                console.error('❌ Stream retry failed:', retryError);
              }
            }, 2000);
          }
        }
      }
      
      // Handle play/pause state changes
      if (!trackChanged && isPlaying !== wasPlaying) {
        if (isPlaying) {
          console.log('▶️ Resuming playback');
          await audioService.resumeStream();
        } else {
          console.log('⏸️ Pausing playback');
          await audioService.pauseStream();
        }
      }
      
      // If stopped (no track), stop audio service
      if (!newTrack && !isPlaying) {
        console.log('⏹️ Stopping playback');
        await audioService.stopStream();
      }
      
    } catch (error) {
      console.error('❌ Audio playback error:', error);
    }
  }, [connectionState.serverAddress]);

  // Socket event listeners for new sync system
  useEffect(() => {
    if (!socket) return;

    // Register this device with the sync system
    socket.emit('register_device', {
      type: 'mobile',
      name: 'React Native App',
      capabilities: ['playback', 'sync']
    });

    // Handle initial playback state
    socket.on('playback_state', (data) => {
      console.log('📡 Received playback state:', data);
      
      setMusicFiles(data.musicLibrary || []);
      const initialPlaybackState = {
        queue: data.queue || [],
        currentTrackIndex: -1, // Will be set by server
        isPlaying: data.isPlaying || false,
        currentTrack: data.currentTrack || null,
        position: data.position || 0,
      };
      
      setPlaybackState(prev => ({
        ...prev,
        ...initialPlaybackState,
      }));
      
      // If server is already playing something, start playback on iOS
      if (initialPlaybackState.currentTrack && initialPlaybackState.isPlaying) {
        console.log('🎵 Server already playing, starting iOS playback');
        handleAudioPlayback(initialPlaybackState.currentTrack, true, null, false);
      }
    });

    // Handle synchronized play command
    socket.on('sync_play', (data) => {
      console.log('▶️ Sync play command:', data);
      
      const wasPlaying = playbackState.isPlaying;
      const previousTrack = playbackState.currentTrack;
      
      setPlaybackState(prev => ({
        ...prev,
        isPlaying: true,
        currentTrack: data.track,
        position: data.position,
      }));
      
      // Calculate when to start playback (compensated for this device)
      const startTime = data.startTime || Date.now();
      const delay = Math.max(0, startTime - Date.now());
      
      setTimeout(() => {
        handleAudioPlayback(data.track, true, previousTrack, wasPlaying);
      }, delay);
    });

    // Handle synchronized pause command
    socket.on('sync_pause', (data) => {
      console.log('⏸️ Sync pause command:', data);
      
      setPlaybackState(prev => ({
        ...prev,
        isPlaying: false,
        position: data.position,
      }));
      
      handleAudioPlayback(playbackState.currentTrack, false, playbackState.currentTrack, true);
    });

    // Handle synchronized seek command
    socket.on('sync_seek', (data) => {
      console.log('⏭️ Sync seek command:', data);
      
      setPlaybackState(prev => ({
        ...prev,
        position: data.position,
        currentTrack: data.track,
      }));
      
      // Seek audio to new position
      audioService.seekToPosition(data.position);
    });

    // Handle real-time sync updates
    socket.on('sync_update', (data) => {
      // Update position without triggering audio changes
      setPlaybackState(prev => ({
        ...prev,
        position: data.position,
        isPlaying: data.isPlaying,
        currentTrack: data.track,
      }));
    });

    // Handle track changes
    socket.on('track_changed', (track) => {
      console.log('🎵 Track changed:', track.title);
      
      const wasPlaying = playbackState.isPlaying;
      const previousTrack = playbackState.currentTrack;
      
      setPlaybackState(prev => ({
        ...prev,
        currentTrack: track,
        position: 0,
      }));
      
      handleAudioPlayback(track, playbackState.isPlaying, previousTrack, wasPlaying);
    });

    // Handle queue updates
    socket.on('queue_updated', (queue) => {
      console.log('📝 Queue updated:', queue.length, 'tracks');
      setPlaybackState(prev => ({ ...prev, queue }));
    });

    // Handle library updates
    socket.on('library_updated', (files) => {
      console.log('📚 Library updated:', files.length, 'files');
      setMusicFiles(files);
    });

    // Handle device list updates
    socket.on('devices_update', (devices) => {
      console.log('📱 Connected devices:', devices.length);
    });

    return () => {
      socket.off('playback_state');
      socket.off('sync_play');
      socket.off('sync_pause');
      socket.off('sync_seek');
      socket.off('sync_update');
      socket.off('track_changed');
      socket.off('queue_updated');
      socket.off('library_updated');
      socket.off('devices_update');
    };
  }, [socket, playbackState.isPlaying, playbackState.currentTrack, handleAudioPlayback]);

  // Playback controls
  const play = useCallback(() => {
    emit('play');
  }, [emit]);

  const pause = useCallback(() => {
    emit('pause');
  }, [emit]);

  const togglePlayPause = useCallback(() => {
    emit('play_pause');
  }, [emit]);

  const nextTrack = useCallback(() => {
    emit('next_track');
  }, [emit]);

  const previousTrack = useCallback(() => {
    emit('previous_track');
  }, [emit]);

  const skipToTrack = useCallback((index: number) => {
    emit('skip_to_track', index);
  }, [emit]);

  const playTrack = useCallback((track: MusicFile | StreamingTrack) => {
    if ('uri' in track) {
      // Streaming track
      emit('play_streaming_track', track);
    } else {
      // Local file
      emit('play_track', { filename: track.name });
    }
  }, [emit]);

  const seekToPosition = useCallback((position: number) => {
    emit('seek', { position });
  }, [emit]);

  // Queue management
  const addToQueue = useCallback((track: MusicFile | StreamingTrack) => {
    if ('uri' in track) {
      // Streaming track - check if server supports this event
      emit('add_streaming_to_queue', track);
    } else {
      // Local file - use the filename for the new server API
      emit('add_to_queue', { filename: track.name });
    }
  }, [emit]);

  const removeFromQueue = useCallback((index: number) => {
    emit('remove_from_queue', index);
  }, [emit]);

  const clearQueue = useCallback(() => {
    emit('clear_queue');
  }, [emit]);

  const moveQueueItem = useCallback((fromIndex: number, toIndex: number) => {
    emit('move_queue_item', { fromIndex, toIndex });
  }, [emit]);

  // Shuffle and repeat
  const toggleShuffle = useCallback(() => {
    const newShuffle = !playbackState.shuffle;
    setPlaybackState(prev => ({ ...prev, shuffle: newShuffle }));
    emit('set_shuffle', newShuffle);
  }, [playbackState.shuffle, emit]);

  const toggleRepeat = useCallback(() => {
    const repeatModes: ('none' | 'one' | 'all')[] = ['none', 'one', 'all'];
    const currentIndex = repeatModes.indexOf(playbackState.repeat);
    const newRepeat = repeatModes[(currentIndex + 1) % repeatModes.length];
    setPlaybackState(prev => ({ ...prev, repeat: newRepeat }));
    emit('set_repeat', newRepeat);
  }, [playbackState.repeat, emit]);

  // Library management
  const refreshLibrary = useCallback(() => {
    emit('refresh_library');
  }, [emit]);

  const uploadFile = useCallback(async (filePath: string) => {
    // This would be implemented with file upload functionality
    // For now, we'll emit an event to the server
    emit('upload_file', { filePath });
  }, [emit]);

  // Streaming integration with full API implementation
  const searchSpotify = useCallback(async (query: string): Promise<StreamingTrack[]> => {
    // Spotify integration coming soon
    console.log('Searching Spotify for:', query);
    return [];
  }, []);

  const searchAppleMusic = useCallback(async (query: string): Promise<StreamingTrack[]> => {
    try {
      console.log('🍎 Searching Apple Music for:', query);
      
      // Make API call to our server which handles Apple Music integration
      const response = await fetch(`${connectionState.serverAddress}/api/apple-music/search?q=${encodeURIComponent(query)}&limit=25`);

      if (!response.ok) {
        throw new Error(`Apple Music search failed: ${response.status}`);
      }

      const tracks = await response.json();
      console.log(`✅ Found ${tracks.length} Apple Music tracks`);
      return tracks;
    } catch (error) {
      console.error('Apple Music search error:', error);
      return [];
    }
  }, [connectionState.serverAddress]);

  const searchSoundCloud = useCallback(async (query: string): Promise<StreamingTrack[]> => {
    console.log('☁️ SoundCloud integration not yet implemented on server');
    // SoundCloud integration coming soon
    return [];
  }, []);

  // Apple Music authentication functions
  const requestAppleMusicAuth = useCallback(async (): Promise<boolean> => {
    try {
      console.log('🔐 Requesting Apple Music authorization...');
      const success = await appleMusicAuthService.requestAuthorization();
      
      if (success) {
        setIsAppleMusicAuthorized(true);
        console.log('✅ Apple Music authorization successful');
      } else {
        console.log('❌ Apple Music authorization failed');
      }
      
      return success;
    } catch (error) {
      console.error('❌ Apple Music authorization error:', error);
      return false;
    }
  }, []);

  const signOutAppleMusic = useCallback(async (): Promise<void> => {
    try {
      await appleMusicAuthService.signOut();
      setIsAppleMusicAuthorized(false);
      console.log('✅ Signed out of Apple Music');
    } catch (error) {
      console.error('❌ Apple Music sign out error:', error);
    }
  }, []);

  const contextValue: MusicContextValue = {
    playbackState,
    musicFiles,
    streamingTracks,
    
    // Playback controls
    play,
    pause,
    togglePlayPause,
    nextTrack,
    previousTrack,
    skipToTrack,
    playTrack,
    seekToPosition,
    
    // Queue management
    addToQueue,
    removeFromQueue,
    clearQueue,
    moveQueueItem,
    
    // Shuffle and repeat
    toggleShuffle,
    toggleRepeat,
    
    // Library management
    refreshLibrary,
    uploadFile,
    
    // Streaming integration
    searchSpotify,
    searchAppleMusic,
    searchSoundCloud,
    
    // Apple Music authentication
    requestAppleMusicAuth,
    signOutAppleMusic,
    isAppleMusicAuthorized,
  };

  return (
    <MusicContext.Provider value={contextValue}>
      {children}
    </MusicContext.Provider>
  );
};

export const useMusic = (): MusicContextValue => {
  const context = useContext(MusicContext);
  if (!context) {
    throw new Error('useMusic must be used within a MusicProvider');
  }
  return context;
};