import React, { useState, useEffect, useRef } from 'react';
import { StatusBar, StyleSheet, View, Text, TouchableOpacity, ScrollView, SafeAreaView, Alert, Linking, Platform, Modal } from 'react-native';
import Sound from 'react-native-sound';
import io, { Socket } from 'socket.io-client';
import { WebView } from 'react-native-webview';

// Enable sound playback in silence mode
Sound.setCategory('Playback');

// Initialize sound system
Sound.enableInSilenceMode(true);

// Icons
const PlayIcon = () => <Text style={styles.iconText}>▶️</Text>;
const PauseIcon = () => <Text style={styles.iconText}>⏸️</Text>;
const ConnectedIcon = () => <Text style={styles.iconText}>🟢</Text>;
const DisconnectedIcon = () => <Text style={styles.iconText}>🔴</Text>;
const MusicIcon = () => <Text style={styles.iconText}>🎵</Text>;
const LoadingIcon = () => <Text style={styles.iconText}>⏳</Text>;
const VolumeIcon = () => <Text style={styles.iconText}>🔊</Text>;

interface Track {
  id: string;
  name: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  url?: string;
}

const SERVER_URL = 'http://192.168.12.125:3000';

const App: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [musicFiles, setMusicFiles] = useState<Track[]>([]);
  const [queue, setQueue] = useState<Track[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(-1);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [queueExpanded, setQueueExpanded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  
  const isPlayingRef = useRef(false);
  const soundRef = useRef<Sound | null>(null);
  const pausePositionRef = useRef<number>(0); // Track position when paused

  // Simple audio test function
  const testAudioSystem = () => {
    console.log('🧪 Testing react-native-sound system...');
    setAudioLoading(true);
    setAudioError(null);

    // Test 1: Try to create a simple beep/system sound
    const systemSound = new Sound('beep.wav', Sound.MAIN_BUNDLE, (error) => {
      if (error) {
        console.log('❌ System sound failed:', error);
        // Test 2: Try a simple network audio file
        testNetworkAudio();
      } else {
        console.log('✅ System sound loaded successfully');
        setAudioLoading(false);
        systemSound.play((success) => {
          if (success) {
            console.log('✅ System sound played successfully');
            setIsPlaying(true);
            setTimeout(() => setIsPlaying(false), 1000);
          } else {
            console.log('❌ System sound playback failed');
          }
          systemSound.release();
        });
      }
    });
  };

  const testNetworkAudio = () => {
    console.log('🌐 Testing network audio...');
    // Try a very simple, reliable test audio URL
    const testUrl = 'https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3';
    
    const networkSound = new Sound(testUrl, null, (error) => {
      if (error) {
        console.error('❌ Network audio failed:', error);
        const errorMsg = typeof error === 'string' ? error : 
                        error?.message || JSON.stringify(error) || 'Network audio failed';
        setAudioError('Audio system test failed: ' + errorMsg);
        setAudioLoading(false);
      } else {
        console.log('✅ Network audio loaded successfully');
        setAudioLoading(false);
        networkSound.play((success) => {
          if (success) {
            console.log('✅ Network audio played successfully - Sound system is working!');
            setIsPlaying(true);
            setTimeout(() => setIsPlaying(false), 2000);
          } else {
            console.log('❌ Network audio playback failed');
            setAudioError('Audio playback failed');
          }
          networkSound.release();
        });
      }
    });
  };

  // Play audio from URL
  const playAudioFromURL = (url: string, trackName: string, startPosition: number = 0) => {
    console.log('🎵 Starting audio playback:', trackName, url);
    setAudioLoading(true);
    setAudioError(null);

    // Stop and release any existing sound
    if (soundRef.current) {
      console.log('🔄 Stopping and releasing existing sound');
      soundRef.current.stop();
      soundRef.current.release();
      soundRef.current = null;
    }

    // Add a small delay to ensure server stream is ready
    setTimeout(() => {
      console.log('🔗 Creating sound instance for URL:', url);
      
      // Create new sound instance
      soundRef.current = new Sound(url, null, (error) => {
        if (error) {
          console.error('❌ Failed to load sound from server stream:', error);
          console.error('❌ Error details:', {
            code: error.code,
            message: error.message,
            domain: error.domain
          });
          
          // Let's try the test audio to verify sound system still works
          console.log('🧪 Fallback: Testing with known working audio...');
          const testSound = new Sound('https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3', null, (testError) => {
            if (testError) {
              console.error('❌ Even test audio failed:', testError);
              setAudioError('Audio system error - restart app');
              setAudioLoading(false);
            } else {
              console.log('✅ Test audio works - server stream issue');
              setAudioError('Server stream unavailable - check server');
              setAudioLoading(false);
              testSound.play();
              setTimeout(() => testSound.release(), 2000);
            }
          });
          return;
        }

        console.log('✅ Server stream loaded successfully');
        console.log('📊 Stream info - Duration:', soundRef.current?.getDuration(), 'seconds');
        setAudioLoading(false);
        
        // Seek to start position if resuming
        if (startPosition > 0) {
          console.log('⏩ Seeking to resume position:', startPosition, 'seconds');
          soundRef.current?.setCurrentTime(startPosition);
        }
        
        // Play the sound
        soundRef.current?.play((success) => {
          console.log('🎵 Stream playback result:', success ? 'SUCCESS' : 'FAILED');
          if (success) {
            console.log('✅ Server stream finished playing - notifying server');
            console.log('🔍 Socket state:', { socketExists: !!socket, connected: connected });
            // Notify server that track completed successfully
            if (socket && connected) {
              console.log('📤 Emitting track_completed event to server');
              socket.emit('track_completed');
            } else {
              console.log('❌ Cannot emit track_completed - socket not available, attempting reconnection...');
              // Try to reconnect and then send the event
              if (socket && !connected) {
                socket.connect();
                // Wait a bit for reconnection then try to send event
                setTimeout(() => {
                  if (socket.connected) {
                    console.log('📤 Sending track_completed after reconnection');
                    socket.emit('track_completed');
                  }
                }, 1000);
              }
            }
          } else {
            console.error('❌ Server stream playback failed');
            setAudioError('Stream playback failed');
          }
          setIsPlaying(false);
          isPlayingRef.current = false;
        });

        setIsPlaying(true);
        isPlayingRef.current = true;
        console.log('▶️ Server stream playback started');
      });
    }, 500); // 500ms delay to let server stream initialize
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.stop();
        soundRef.current.release();
      }
    };
  }, []);

  // Socket.IO Connection
  const connectToServer = async () => {
    if (connected) {
      // Disconnect
      if (socket) {
        socket.disconnect();
        socket.removeAllListeners();
        setSocket(null);
      }
      setConnected(false);
      setMusicFiles([]);
      setQueue([]);
      setCurrentTrack(null);
      setCurrentTrackIndex(-1);
      setIsPlaying(false);
      return;
    }

    setConnecting(true);
    try {
      console.log('🔌 Connecting to music server:', SERVER_URL);
      
      const newSocket = io(SERVER_URL, {
        timeout: 10000,
        transports: ['polling', 'websocket'],
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
      });

      newSocket.on('connect', () => {
        console.log('✅ Connected to music server');
        setConnected(true);
        setSocket(newSocket);
        setConnecting(false);
        
        // Register as mobile audio player
        newSocket.emit('register_device', {
          type: 'MOBILE_PLAYER',
          name: 'iPhone Audio Player',
          capabilities: ['audio_playback', 'remote_control']
        });
      });

      newSocket.on('disconnect', (reason) => {
        console.log('❌ Disconnected from music server:', reason);
        setConnected(false);
        // Don't set socket to null immediately - let reconnection handle it
      });

      newSocket.on('reconnect', (attemptNumber) => {
        console.log(`🔄 Reconnected to server (attempt ${attemptNumber})`);
        setConnected(true);
        setSocket(newSocket);
        
        // Re-register device after reconnection
        newSocket.emit('register_device', {
          type: 'MOBILE_PLAYER',
          name: 'iPhone Audio Player',
          capabilities: ['audio_playback', 'remote_control']
        });
      });

      newSocket.on('reconnect_error', (error) => {
        console.error('❌ Reconnection failed:', error);
      });

      newSocket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        setConnecting(false);
        Alert.alert('Connection Error', 'Failed to connect to music server.');
      });

      // Listen for playback state
      newSocket.on('playback_state', (data) => {
        console.log('📊 Received playback state:', data);
        console.log('🔍 Current Track Index from server:', data.currentTrackIndex);
        console.log('🔍 Queue length:', (data.queue || []).length);
        setMusicFiles(data.musicLibrary || []);
        setQueue(data.queue || []);
        setCurrentTrackIndex(data.currentTrackIndex || -1);
        
        const newTrack = (data.queue && data.currentTrackIndex >= 0 && data.queue[data.currentTrackIndex]) 
          || data.currentTrack;
          
        if (newTrack && (!currentTrack || newTrack.name !== currentTrack.name)) {
          console.log('🎵 New track detected from server:', newTrack.name);
          setCurrentTrack(newTrack);
          setAudioLoading(false);
          setAudioError(null);
          
          // If server is playing, try to play the music file directly
          const serverPlaying = data.isPlaying || false;
          if (serverPlaying) {
            console.log('📻 Server is broadcasting, tuning into stream');
            // Just tune into the server's radio broadcast
            const streamUrl = `${SERVER_URL}/stream/current`;
            console.log('📻 Tuning into broadcast:', streamUrl);
            playAudioFromURL(streamUrl, newTrack.title || newTrack.name);
          }
        }
        
        const serverPlaying = data.isPlaying || false;
        if (serverPlaying !== isPlayingRef.current) {
          setIsPlaying(serverPlaying);
          isPlayingRef.current = serverPlaying;
        }
      });
      
      // Listen for track changes
      newSocket.on('track_changed', (track) => {
        console.log('📻 Track changed event:', track.name);
        pausePositionRef.current = 0; // Reset pause position for new track
        // Play individual file URL instead of stream
        const fileUrl = `${SERVER_URL}/music/${encodeURIComponent(track.name)}`;
        console.log('🎵 Playing individual file:', fileUrl);
        playAudioFromURL(fileUrl, track.title || track.name, 0);
      });

      // Listen for queue updates
      newSocket.on('queue_updated', (newQueue) => {
        console.log('📋 Queue updated:', newQueue);
        setQueue(newQueue || []);
      });

      // Listen for library updates (after uploads)
      newSocket.on('library_updated', (updatedLibrary) => {
        console.log('📚 Music library updated:', updatedLibrary.length, 'files');
        setMusicFiles(updatedLibrary || []);
      });
      
      // Listen for playback state updates (after track changes) - SINGLE SOURCE OF TRUTH
      newSocket.on('playback_state_update', (data) => {
        console.log('🔄 Playback state update:', data);
        console.log('🔍 Updated Track Index from server:', data.currentTrackIndex);
        // Update ALL state from server - this is the authoritative source
        setCurrentTrackIndex(data.currentTrackIndex !== undefined ? data.currentTrackIndex : -1);
        setCurrentTrack(data.currentTrack || null);
        setQueue(data.queue || []);
        setIsPlaying(data.isPlaying || false);
        isPlayingRef.current = data.isPlaying || false;
      });

      // Simple radio tuning - no complex sync needed
      // The stream IS the synchronization

    } catch (error) {
      console.error('Socket creation failed:', error);
      setConnecting(false);
      Alert.alert('Connection Error', 'Failed to create connection');
    }
  };

  // Audio Playback Controls
  const handlePlayPause = async () => {
    if (!connected || !socket) {
      Alert.alert('Not Connected', 'Please connect to the music server first');
      return;
    }

    if (queue.length === 0) {
      Alert.alert('No Music', 'Add songs to queue first');
      return;
    }

    if (audioLoading) {
      console.log('Audio is loading, please wait...');
      return;
    }

    if (isPlaying && soundRef.current) {
      // Pause current track and save position
      console.log('⏸️ Pausing current track');
      
      // Get current position before pausing
      if (soundRef.current.getCurrentTime) {
        soundRef.current.getCurrentTime((seconds) => {
          pausePositionRef.current = seconds;
          console.log('💾 Saved pause position:', seconds, 'seconds');
        });
      }
      
      soundRef.current.pause();
      setIsPlaying(false);
      isPlayingRef.current = false;
      socket.emit('pause');
    } else {
      // Start or resume playback
      if (currentTrack && pausePositionRef.current > 0) {
        // True resume - only if we have a saved pause position
        console.log('▶️ Resuming paused track from server');
        socket.emit('play');
        
        const streamUrl = `${SERVER_URL}/stream/current`;
        console.log('📻 Resuming - tuning back into broadcast:', streamUrl);
        // No resume position - just tune back into the live broadcast
        
        playAudioFromURL(streamUrl, currentTrack.title || currentTrack.name, 0);
      } else if (currentTrack) {
        // Current track but no pause position - just tell server to play, track_changed will handle audio
        console.log('▶️ Playing current track from server (let track_changed handle audio)');
        socket.emit('play');
      } else if (queue.length > 0) {
        // No current track but queue exists, start first track
        console.log('🎵 Starting first track from server:', queue[0].name);
        pausePositionRef.current = 0; // Clear pause position for new track
        socket.emit('play_track', { filename: queue[0].name });
        
        // Let track_changed event handle the audio playback
      } else {
        console.log('❌ No tracks in queue to play');
        Alert.alert('No Music', 'Add songs to queue first');
      }
    }
  };

  // Queue Management
  const addSongToQueue = (fileName: string) => {
    if (socket && connected) {
      console.log('➕ Adding song to queue:', fileName);
      socket.emit('add_to_queue', { filename: fileName });
    }
  };

  const addRandomSong = () => {
    if (musicFiles.length > 0) {
      const firstSong = musicFiles[0];
      console.log('🎲 Adding random song to queue:', firstSong.name);
      addSongToQueue(firstSong.name);
    }
  };

  const clearQueue = () => {
    if (socket && connected) {
      console.log('🗑️ Clearing queue');
      socket.emit('clear_queue');
    }
  };

  const skipToNext = () => {
    if (socket && connected) {
      console.log('⏭️ Skipping to next track');
      socket.emit('next_track');
    }
  };

  const skipToPrevious = () => {
    if (socket && connected) {
      console.log('⏮️ Skipping to previous track - Current index:', currentTrackIndex);
      socket.emit('previous_track');
    }
  };

  // Upload music file
  const uploadMusicFile = async () => {
    if (!connected) {
      Alert.alert('Not Connected', 'Please connect to the music server first');
      return;
    }

    setShowUploadModal(true);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#121212" />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <VolumeIcon />
          <Text style={styles.headerTitle}>iPhone Music Player</Text>
        </View>
        
        {/* Connection Status */}
        <View style={styles.connectionContainer}>
          <View style={[styles.connectionStatus, { 
            backgroundColor: connected ? '#1DB954' : connecting ? '#FFA500' : '#E22134' 
          }]}>
            {connecting ? <LoadingIcon /> : connected ? <ConnectedIcon /> : <DisconnectedIcon />}
            <Text style={styles.connectionText}>
              {connecting ? 'Connecting...' : connected ? 'Connected' : 'Disconnected'}
            </Text>
          </View>
          
          <TouchableOpacity 
            style={[styles.connectButton, { opacity: connecting ? 0.7 : 1 }]}
            onPress={connectToServer}
            disabled={connecting}
          >
            <Text style={styles.connectButtonText}>
              {connecting ? 'Connecting...' : connected ? 'Disconnect' : 'Connect to Server'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Audio Status */}
        {connected && (
          <View style={styles.audioStatusContainer}>
            <Text style={styles.audioStatusTitle}>🎵 iPhone Music Player</Text>
            <Text style={styles.audioStatusText}>
              {audioLoading ? '⏳ Loading music from server...' : 
               audioError ? `❌ ${audioError}` :
               isPlaying ? '🎵 Playing music from iPhone speakers!' :
               queue.length > 0 ? '✅ Ready to play music - Press Play to start' : '📱 Add songs to queue first'}
            </Text>
          </View>
        )}

        {/* Current Track */}
        <View style={styles.trackContainer}>
          <View style={styles.albumArt}>
            <MusicIcon />
          </View>
          
          {currentTrack ? (
            <View style={styles.trackInfo}>
              <Text style={styles.trackTitle}>{currentTrack.title || currentTrack.name}</Text>
              <Text style={styles.trackArtist}>
                {audioLoading ? '⏳ Loading...' :
                 isPlaying ? '🎵 Playing on iPhone' : 
                 audioError ? '❌ Audio Error' : '📱 Ready to play'}
              </Text>
              <Text style={styles.trackAlbum}>
                {currentTrack.artist || 'Unknown Artist'} • iPhone Speakers
              </Text>
            </View>
          ) : (
            <View style={styles.trackInfo}>
              <Text style={styles.noTrackText}>
                {connected ? 'Add a song to queue to start playing' : 'Connect to server'}
              </Text>
            </View>
          )}
        </View>

        {/* Playback Controls */}
        <View style={styles.controlsContainer}>
          <View style={styles.playbackRow}>
            <TouchableOpacity 
              style={[styles.skipButton, { 
                opacity: connected && currentTrackIndex > 0 ? 1 : 0.5 
              }]}
              onPress={() => {
                console.log('⏮️ Skip backward pressed. Current index:', currentTrackIndex, 'Queue length:', queue.length);
                console.log('🔍 Button state - Connected:', connected, 'Index > 0:', currentTrackIndex > 0, 'Disabled:', !connected || currentTrackIndex <= 0);
                skipToPrevious();
              }}
              disabled={!connected || currentTrackIndex <= 0}
            >
              <Text style={styles.skipButtonText}>⏮️</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.playButton, {
                opacity: connected && queue.length > 0 && !audioLoading ? 1 : 0.5,
                backgroundColor: audioError ? '#E22134' : '#1DB954'
              }]}
              onPress={handlePlayPause}
              disabled={!connected || queue.length === 0 || audioLoading}
            >
              {audioLoading ? <LoadingIcon /> : isPlaying ? <PauseIcon /> : <PlayIcon />}
              <Text style={styles.playButtonText}>
                {audioLoading ? 'Loading' : isPlaying ? 'Pause' : 'Play'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.skipButton, { 
                opacity: connected && currentTrackIndex < queue.length - 1 ? 1 : 0.5 
              }]}
              onPress={skipToNext}
              disabled={!connected || currentTrackIndex >= queue.length - 1}
            >
              <Text style={styles.skipButtonText}>⏭️</Text>
            </TouchableOpacity>
          </View>

          {/* Queue Actions */}
          {connected && (
            <View style={styles.queueActions}>
              {musicFiles.length > 0 && queue.length === 0 && (
                <TouchableOpacity 
                  style={styles.addSongButton}
                  onPress={addRandomSong}
                >
                  <Text style={styles.addSongButtonText}>Add Song to Test</Text>
                </TouchableOpacity>
              )}

              {queue.length > 0 && (
                <TouchableOpacity 
                  style={styles.clearButton}
                  onPress={clearQueue}
                >
                  <Text style={styles.clearButtonText}>Clear Queue</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Current Queue */}
        {connected && queue.length > 0 && (
          <View style={styles.queueContainer}>
            <Text style={styles.queueTitle}>Playback Queue ({queue.length} songs)</Text>
            {(queueExpanded ? queue : queue.slice(0, 3)).map((track, index) => (
              <View key={`${track.id || track.name}-${index}`} style={[
                styles.queueItem,
                index === currentTrackIndex && styles.currentQueueItem
              ]}>
                <Text style={styles.queueIndex}>{index + 1}</Text>
                <Text style={[
                  styles.queueItemText,
                  index === currentTrackIndex && styles.currentQueueItemText
                ]}>{track.title || track.name}</Text>
                {index === currentTrackIndex && isPlaying && (
                  <Text style={styles.playingIndicator}>♪</Text>
                )}
              </View>
            ))}
            {queue.length > 3 && (
              <TouchableOpacity 
                style={styles.expandQueueButton}
                onPress={() => setQueueExpanded(!queueExpanded)}
              >
                <Text style={styles.expandQueueText}>
                  {queueExpanded 
                    ? '▲ Show less' 
                    : `... and ${queue.length - 3} more songs`
                  }
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Music Library */}
        {connected && (
          <View style={styles.libraryContainer}>
            <View style={styles.libraryHeader}>
              <Text style={styles.libraryTitle}>Music Library ({musicFiles.length} songs)</Text>
              <TouchableOpacity 
                style={[styles.uploadButton, { opacity: uploading ? 0.7 : 1 }]}
                onPress={uploadMusicFile}
                disabled={uploading}
              >
                <Text style={styles.uploadButtonText}>
                  {uploading ? '⏳ Uploading...' : '📁 Upload Music'}
                </Text>
              </TouchableOpacity>
            </View>
            {musicFiles.length > 0 && (
              <ScrollView style={styles.libraryScroll} nestedScrollEnabled={true}>
                {musicFiles.map((file, index) => (
                  <TouchableOpacity 
                    key={file.id || file.name}
                    style={styles.libraryItem}
                    onPress={() => addSongToQueue(file.name)}
                  >
                    <Text style={styles.libraryItemText}>
                      {file.title || file.name}
                    </Text>
                    <Text style={styles.addButtonText}>+</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        )}

        {/* Instructions */}
        <View style={styles.featuresContainer}>
          <Text style={styles.featuresTitle}>🎵 iPhone Audio Player</Text>
          <Text style={styles.featureItem}>• Plays music directly from iPhone speakers</Text>
          <Text style={styles.featureItem}>• Streams audio from your music server</Text>
          <Text style={styles.featureItem}>• Real-time playback control</Text>
          <Text style={styles.featureItem}>• Queue management</Text>
          <Text style={styles.featureNote}>
            💡 This app streams audio directly to your iPhone. You'll hear music from your device speakers!
          </Text>
        </View>
      </ScrollView>

      {/* Upload Modal */}
      <Modal
        visible={showUploadModal}
        animationType="slide"
        onRequestClose={() => setShowUploadModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Upload Music</Text>
            <TouchableOpacity 
              style={styles.closeButton}
              onPress={() => setShowUploadModal(false)}
            >
              <Text style={styles.closeButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
          <WebView
            source={{ uri: SERVER_URL }}
            style={styles.webview}
            onMessage={(event) => {
              // Listen for upload completion messages
              const data = event.nativeEvent.data;
              if (data === 'upload_complete') {
                setShowUploadModal(false);
                Alert.alert('Success!', 'Files uploaded successfully!');
              }
            }}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginLeft: 12,
  },
  connectionContainer: {
    gap: 12,
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  connectionText: {
    color: '#FFFFFF',
    fontWeight: '600',
    marginLeft: 8,
    fontSize: 14,
  },
  connectButton: {
    backgroundColor: '#1DB954',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    alignSelf: 'flex-start',
  },
  connectButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  audioStatusContainer: {
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
    alignItems: 'center',
  },
  audioStatusTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  audioStatusText: {
    fontSize: 14,
    color: '#B3B3B3',
    textAlign: 'center',
  },
  trackContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  albumArt: {
    width: 200,
    height: 200,
    backgroundColor: '#333333',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  trackInfo: {
    alignItems: 'center',
  },
  trackTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  trackArtist: {
    fontSize: 18,
    color: '#1DB954',
    textAlign: 'center',
    marginBottom: 4,
  },
  trackAlbum: {
    fontSize: 16,
    color: '#B3B3B3',
    textAlign: 'center',
    marginBottom: 8,
  },
  noTrackText: {
    fontSize: 18,
    color: '#666666',
    textAlign: 'center',
  },
  controlsContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
    gap: 20,
  },
  playbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 30,
  },
  skipButton: {
    width: 50,
    height: 50,
    backgroundColor: '#333333',
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skipButtonText: {
    fontSize: 24,
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1DB954',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  playButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 12,
    marginTop: 4,
  },
  queueActions: {
    flexDirection: 'row',
    gap: 12,
  },
  addSongButton: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  addSongButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  clearButton: {
    backgroundColor: '#E22134',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  clearButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 12,
  },
  queueContainer: {
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  queueTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333333',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  currentQueueItem: {
    backgroundColor: '#1DB954',
  },
  queueIndex: {
    color: '#B3B3B3',
    fontSize: 14,
    fontWeight: 'bold',
    width: 30,
  },
  queueItemText: {
    color: '#FFFFFF',
    fontSize: 14,
    flex: 1,
  },
  currentQueueItemText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  playingIndicator: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  libraryContainer: {
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
    maxHeight: 400, // Limit height so it doesn't take up whole screen
  },
  libraryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  libraryScroll: {
    maxHeight: 320, // Make it scrollable
  },
  libraryTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    flex: 1,
  },
  uploadButton: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  uploadButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  libraryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#333333',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  libraryItemText: {
    color: '#FFFFFF',
    fontSize: 14,
    flex: 1,
  },
  addButtonText: {
    color: '#1DB954',
    fontSize: 20,
    fontWeight: 'bold',
  },
  moreText: {
    color: '#B3B3B3',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  expandQueueButton: {
    alignItems: 'center',
    paddingVertical: 8,
    marginTop: 8,
  },
  expandQueueText: {
    color: '#1DB954',
    fontSize: 14,
    fontWeight: '600',
  },
  featuresContainer: {
    paddingVertical: 24,
    paddingBottom: 40,
  },
  featuresTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  featureItem: {
    fontSize: 16,
    color: '#B3B3B3',
    marginBottom: 8,
    lineHeight: 24,
  },
  featureNote: {
    fontSize: 14,
    color: '#1DB954',
    marginTop: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 20,
  },
  iconText: {
    fontSize: 20,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#121212',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  closeButton: {
    backgroundColor: '#1DB954',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  webview: {
    flex: 1,
  },
});

export default App;