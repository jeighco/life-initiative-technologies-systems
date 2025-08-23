import React, { useState, useEffect, useCallback } from 'react';
import { Play, Pause, SkipForward, Upload, Trash2, WifiOff, Wifi, AlertCircle, RefreshCw, Cast, Volume2, VolumeX, Users, Edit3, Move, Settings, Search, Music } from 'lucide-react';

const SERVER_IP = '192.168.12.125';
const serverAddress = `http://${SERVER_IP}:3000`;

// Error Boundary Component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
          <div className="text-center p-8">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
            <p className="text-gray-300 mb-4">The music player encountered an error.</p>
            <button 
              onClick={() => window.location.reload()} 
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2 mx-auto"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Connection Status Component
const ConnectionStatus = ({ status, error, onRetry }) => {
  const getStatusDisplay = () => {
    switch (status) {
      case 'connected':
        return {
          icon: <Wifi className="w-5 h-5 text-green-500" />,
          text: 'Connected',
          bgColor: 'bg-green-500/10 border-green-500/20'
        };
      case 'connecting':
        return {
          icon: <RefreshCw className="w-5 h-5 text-yellow-500 animate-spin" />,
          text: 'Connecting...',
          bgColor: 'bg-yellow-500/10 border-yellow-500/20'
        };
      case 'disconnected':
        return {
          icon: <WifiOff className="w-5 h-5 text-gray-500" />,
          text: 'Disconnected',
          bgColor: 'bg-gray-500/10 border-gray-500/20'
        };
      case 'error':
        return {
          icon: <AlertCircle className="w-5 h-5 text-red-500" />,
          text: 'Connection Problem',
          bgColor: 'bg-red-500/10 border-red-500/20'
        };
      default:
        return {
          icon: <WifiOff className="w-5 h-5 text-gray-500" />,
          text: 'Unknown',
          bgColor: 'bg-gray-500/10 border-gray-500/20'
        };
    }
  };

  const { icon, text, bgColor } = getStatusDisplay();

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${bgColor}`}>
      {icon}
      <div className="flex-1">
        <div className="text-sm font-medium">{text}</div>
        {error && (
          <div className="text-xs text-gray-400 mt-1">
            {error.message || 'Connection failed'}
          </div>
        )}
      </div>
      {(status === 'error' || status === 'disconnected') && (
        <button
          onClick={onRetry}
          className="text-xs bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded"
        >
          Retry
        </button>
      )}
    </div>
  );
};

// Main App Component
const App = () => {
  const [socket, setSocket] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [error, setError] = useState(null);
  const [musicFiles, setMusicFiles] = useState([]);
  const [queue, setQueue] = useState([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [castAvailable, setCastAvailable] = useState(false);
  const [castConnected, setCastConnected] = useState(false);
  const [castDevice, setCastDevice] = useState(null);
  const [castRetryCount, setCastRetryCount] = useState(0);
  const [latencyDelays, setLatencyDelays] = useState({
    snapcast: 0,
    chromecast: 50,
    bluetooth: 250
  });
  const [activeZones, setActiveZones] = useState({
    snapcast: true,
    chromecast: false,
    bluetooth: false
  });
  const [snapcastConnected, setSnapcastConnected] = useState(false);
  const [snapcastClients, setSnapcastClients] = useState([]);
  const [snapcastGroups, setSnapcastGroups] = useState([]);
  const [snapcastStatus, setSnapcastStatus] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  
  // Sync monitoring state
  const [syncStatus, setSyncStatus] = useState(null);
  const [showSyncMonitoring, setShowSyncMonitoring] = useState(false);

  // Stable Socket.IO Connection with better cleanup
  const connectSocket = useCallback(() => {
    // Prevent multiple connections
    if (socket?.connected) {
      console.log('⚠️  Socket already connected, skipping...');
      return;
    }

    // Clean up any existing socket first
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
    }

    setConnectionStatus('connecting');
    setError(null);

    try {
      const io = window.io;
      if (typeof io === 'undefined') {
        throw new Error('Socket.IO not loaded');
      }

      console.log('🔌 Creating new socket connection...');

      // Stable connection configuration
      const newSocket = io(serverAddress, {
        timeout: 15000,
        transports: ['polling'],  // Force polling only - more stable
        forceNew: true,
        upgrade: false,  // Prevent upgrading to websocket
        reconnection: true,
        reconnectionAttempts: 5, // Reduced from 10
        reconnectionDelay: 3000, // Increased from 2000
        reconnectionDelayMax: 10000,
        autoConnect: true
      });

      // Connection event handlers
      newSocket.on('connect', () => {
        console.log('✅ Connected to server');
        setConnectionStatus('connected');
        setError(null);
        setSocket(newSocket);
      });

      newSocket.on('disconnect', (reason) => {
        console.log('❌ Disconnected from server:', reason);
        setConnectionStatus('disconnected');
        if (reason === 'io server disconnect') {
          // Server disconnected us, reconnect manually
          setTimeout(() => newSocket.connect(), 2000);
        }
      });

      newSocket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        setConnectionStatus('error');
        setError({ 
          code: 'CONNECTION_ERROR', 
          message: 'Unable to connect to music server' 
        });
      });

      newSocket.on('reconnect', (attemptNumber) => {
        console.log('🔄 Reconnected after', attemptNumber, 'attempts');
        setConnectionStatus('connected');
        setError(null);
      });

      newSocket.on('reconnecting', (attemptNumber) => {
        console.log('🔄 Reconnecting attempt', attemptNumber);
        setConnectionStatus('connecting');
      });

      newSocket.on('reconnect_error', (error) => {
        console.error('Reconnect error:', error);
        setConnectionStatus('error');
        setError({ 
          code: 'RECONNECT_ERROR', 
          message: 'Failed to reconnect to server' 
        });
      });

      newSocket.on('reconnect_failed', () => {
        console.error('Reconnection failed');
        setConnectionStatus('error');
        setError({ 
          code: 'RECONNECT_FAILED', 
          message: 'Could not reconnect to server' 
        });
      });

      // Music-specific event handlers
      newSocket.on('initial_data', (data) => {
        console.log('📊 Received initial data:', data);
        setMusicFiles(data.files || []);
        setQueue(data.queue || []);
        setCurrentTrackIndex(data.currentTrackIndex || -1);
        setIsPlaying(data.isPlaying || false);
      });

      newSocket.on('update_state', (state) => {
        console.log('🔄 State update:', state);
        setMusicFiles(state.files || []);
        setQueue(state.queue || []);
        setCurrentTrackIndex(state.currentTrackIndex || -1);
        setIsPlaying(state.isPlaying || false);
      });

      newSocket.on('stream_error', (errorData) => {
        console.error('🎵 Stream error:', errorData);
        setError({
          code: 'STREAM_ERROR',
          message: errorData.message || 'Audio stream failed'
        });
      });

      newSocket.on('upload_progress', (progress) => {
        setUploadProgress(progress);
      });

      newSocket.on('latencyUpdate', (data) => {
        console.log('🎛️ Latency settings updated:', data);
        setLatencyDelays(data.delays);
        setActiveZones(data.activeZones);
      });

      newSocket.on('snapcast_connected', (connected) => {
        console.log('📡 Snapcast connection status:', connected);
        setSnapcastConnected(connected);
      });

      newSocket.on('snapcast_status', (data) => {
        console.log('📊 Snapcast status updated:', data);
        setSnapcastStatus(data.status);
        setSnapcastClients(data.clients);
        setSnapcastGroups(data.groups);
      });

      // Start the connection
      newSocket.connect();

    } catch (error) {
      console.error('Failed to create socket:', error);
      setConnectionStatus('error');
      setError({ 
        code: 'SOCKET_CREATION_ERROR', 
        message: 'Failed to initialize connection' 
      });
    }
  }, [socket]);

  // Auto-connect on mount with cleanup
  useEffect(() => {
    // Small delay to ensure DOM is ready
    const connectTimer = setTimeout(() => {
      connectSocket();
    }, 100);

    // Initialize Chromecast after DOM is ready
    const castTimer = setTimeout(() => {
      initializeCast();
    }, 500);

    return () => {
      clearTimeout(connectTimer);
      clearTimeout(castTimer);
      if (socket) {
        socket.disconnect();
      }
    };
  }, []); // Remove connectSocket dependency to prevent loops

  // Separate effect to handle socket dependency changes
  useEffect(() => {
    if (!socket && connectionStatus === 'disconnected') {
      const retryTimer = setTimeout(() => {
        console.log('🔄 Auto-retry connection...');
        connectSocket();
      }, 3000);
      
      return () => clearTimeout(retryTimer);
    }
  }, [socket, connectionStatus, connectSocket]);

  // Fetch latency settings and Snapcast status when connected
  useEffect(() => {
    if (connectionStatus === 'connected') {
      fetchLatencySettings();
      fetchSnapcastStatus();
      fetchSyncStatus();
    }
  }, [connectionStatus]);

  // Chromecast connection monitor
  useEffect(() => {
    if (!castAvailable) return;

    const monitorCastConnection = () => {
      try {
        const context = window.cast?.framework?.CastContext?.getInstance();
        if (!context) return;

        const session = context.getCurrentSession();
        const actuallyConnected = !!session;
        
        // Check if our state is out of sync
        if (castConnected !== actuallyConnected) {
          console.log(`📺 Connection state mismatch. Expected: ${castConnected}, Actual: ${actuallyConnected}`);
          setCastConnected(actuallyConnected);
          
          if (!actuallyConnected) {
            setCastDevice(null);
            setCastRetryCount(0);
            console.log('📺 Cast device disconnected unexpectedly');
          }
        }
        
        // If we think we're connected but session is null, try to recover
        if (castConnected && !session) {
          console.log('📺 Cast session lost, attempting recovery...');
          setCastConnected(false);
          setCastDevice(null);
        }
        
      } catch (error) {
        console.warn('📺 Cast connection monitor error:', error);
      }
    };

    // Monitor every 10 seconds
    const monitorInterval = setInterval(monitorCastConnection, 10000);

    return () => {
      clearInterval(monitorInterval);
    };
  }, [castAvailable, castConnected]);

  // Periodic sync status updates
  useEffect(() => {
    if (connectionStatus !== 'connected') return;
    
    const syncRefreshInterval = setInterval(fetchSyncStatus, 15000);
    return () => clearInterval(syncRefreshInterval);
  }, [connectionStatus]);

  // Chromecast initialization with fallback
  const initializeCast = () => {
    console.log('📺 Initializing Cast...');
    
    // Check if already loaded
    if (window.chrome?.cast?.framework) {
      console.log('📺 Cast already loaded, setting up...');
      setupCast();
      return;
    }

    // Check if script already exists
    const existingScript = document.querySelector('script[src*="cast_sender.js"]');
    if (existingScript) {
      console.log('📺 Cast script already exists, waiting for load...');
      // Poll for framework availability more aggressively
      let attempts = 0;
      const maxAttempts = 20; // Try for 10 seconds
      
      const pollForFramework = () => {
        attempts++;
        if (window.cast?.framework?.CastContext) {
          console.log('📺 Framework became available after', attempts, 'attempts');
          setupCast();
        } else if (attempts < maxAttempts) {
          console.log('📺 Polling attempt', attempts, '- framework not ready yet');
          setTimeout(pollForFramework, 500);
        } else {
          console.error('📺 Framework never became available after', maxAttempts, 'attempts');
          // Try reloading the script
          existingScript.remove();
          setTimeout(initializeCast, 1000);
        }
      };
      
      pollForFramework();
      return;
    }

    // Load Cast SDK with better error handling
    const script = document.createElement('script');
    script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
    script.async = true;
    script.defer = true; // Add defer for better loading
    
    script.onload = () => {
      console.log('📺 Cast SDK script loaded');
      // Give SDK more time to initialize
      setTimeout(() => {
        if (window.chrome?.cast?.framework) {
          setupCast();
        } else {
          console.warn('📺 Cast SDK loaded but framework not ready, retrying...');
          // Try again with longer delay
          setTimeout(() => {
            if (window.chrome?.cast?.framework) {
              setupCast();
            } else {
              console.error('📺 Cast SDK failed to initialize after retries');
            }
          }, 3000);
        }
      }, 1500); // Increased delay
    };
    
    script.onerror = (error) => {
      console.error('📺 Failed to load Cast SDK:', error);
      // Try alternative CDN or give up gracefully
      setTimeout(() => {
        console.log('📺 Retrying Cast SDK load...');
        initializeCast();
      }, 5000);
    };
    
    document.head.appendChild(script);
    console.log('📺 Loading Cast SDK from CDN...');

    // Global callback for Cast API with better handling
    window['__onGCastApiAvailable'] = (isAvailable) => {
      console.log('📺 Cast API callback - available:', isAvailable);
      if (isAvailable) {
        // Poll more aggressively after callback
        let callbackAttempts = 0;
        const maxCallbackAttempts = 10;
        
        const pollAfterCallback = () => {
          callbackAttempts++;
          if (window.cast?.framework?.CastContext) {
            console.log('📺 Framework ready via callback after', callbackAttempts, 'attempts');
            setupCast();
          } else if (callbackAttempts < maxCallbackAttempts) {
            console.log('📺 Callback polling attempt', callbackAttempts);
            setTimeout(pollAfterCallback, 200);
          } else {
            console.error('📺 Framework never became available via callback');
          }
        };
        
        pollAfterCallback();
      } else {
        console.error('📺 Cast API not available via callback');
      }
    };
  };

  const setupCast = () => {
    try {
      console.log('📺 Setting up Cast framework...');
      
      // Wait for cast framework to be fully available
      if (!window.cast?.framework?.CastContext) {
        console.warn('📺 Cast framework not ready, waiting...');
        setTimeout(() => {
          if (window.cast?.framework?.CastContext) {
            setupCast();
          } else {
            console.error('📺 Cast framework still not available after wait');
          }
        }, 1000);
        return;
      }

      // Check if already initialized
      let context;
      try {
        context = window.cast.framework.CastContext.getInstance();
      } catch (error) {
        console.log('📺 Creating new Cast context...');
        // Framework exists but context not initialized yet
        setTimeout(setupCast, 500);
        return;
      }

      // Configure the context
      try {
        context.setOptions({
          receiverApplicationId: window.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
          autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
        });
        console.log('📺 Cast context configured successfully');
      } catch (optionsError) {
        console.error('📺 Failed to set Cast options:', optionsError);
        return;
      }

      setCastAvailable(true);
      console.log('📺 Cast button should now be visible');

      // Add session state listener with enhanced monitoring
      try {
        context.addEventListener(window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED, (event) => {
          const session = context.getCurrentSession();
          const connected = !!session;
          console.log('📺 Cast session state changed:', connected ? 'Connected' : 'Disconnected');
          
          if (connected && session) {
            // Extract device information
            const deviceInfo = {
              name: session.getSessionObj()?.receiver?.friendlyName || 'Unknown Device',
              id: session.getSessionObj()?.receiver?.receiverId || null,
              capabilities: session.getSessionObj()?.receiver?.capabilities || []
            };
            setCastDevice(deviceInfo);
            console.log(`📺 Connected to: ${deviceInfo.name}`);
            
            // Reset retry count on successful connection
            setCastRetryCount(0);
            
            // Add session event listeners for better error handling
            session.addUpdateListener((isAlive) => {
              if (!isAlive) {
                console.log('📺 Cast session ended');
                setCastConnected(false);
                setCastDevice(null);
              }
            });
            
            // Add media session listeners
            session.addMessageListener('urn:x-cast:com.google.cast.media', (namespace, message) => {
              console.log('📺 Cast media message:', message);
            });
            
            // Auto-start casting if music is playing
            if (isPlaying && currentTrackIndex >= 0) {
              setTimeout(() => {
                startCasting(queue[currentTrackIndex]);
              }, 1000); // Small delay to ensure session is ready
            }
          } else {
            setCastDevice(null);
            console.log('📺 Cast session disconnected');
          }
          
          setCastConnected(connected);
        });
      } catch (listenerError) {
        console.error('📺 Failed to add session listener:', listenerError);
      }

      // Check for existing session
      try {
        const existingSession = context.getCurrentSession();
        if (existingSession) {
          console.log('📺 Found existing cast session');
          setCastConnected(true);
        }
      } catch (sessionError) {
        console.warn('📺 Could not check existing session:', sessionError);
      }

    } catch (error) {
      console.error('📺 Cast setup failed:', error);
      // Retry setup after delay
      setTimeout(() => {
        console.log('📺 Retrying Cast setup...');
        setupCast();
      }, 2000);
    }
  };

  const startCasting = async (track, retryAttempt = 0) => {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_BASE = 2000; // Start with 2 seconds
    
    try {
      const context = window.cast.framework.CastContext.getInstance();
      const session = context.getCurrentSession();
      
      if (!session) {
        console.warn('📺 No active cast session available');
        return false;
      }
      
      if (!track) {
        console.warn('📺 No track provided for casting');
        return false;
      }
      
      console.log(`📺 Starting cast: ${track.name} (attempt ${retryAttempt + 1}/${MAX_RETRIES + 1})`);
      
      // Create media info with enhanced metadata and device-specific URL
      let streamUrl;
      if (track.streamUrl || track.previewUrl) {
        // Use direct URLs for streaming services
        streamUrl = track.streamUrl || track.previewUrl;
      } else {
        // Use device-specific endpoint to prevent conflicts between multiple Chromecasts
        const deviceId = castDevice?.name ? encodeURIComponent(castDevice.name.replace(/\s+/g, '-')) : 'default';
        streamUrl = `${serverAddress}/stream/device/${deviceId}`;
      }
      
      console.log(`📺 Using stream URL: ${streamUrl}`);
      const mediaInfo = new window.chrome.cast.media.MediaInfo(streamUrl, 'audio/mpeg');
      
      // Enhanced metadata
      mediaInfo.metadata = new window.chrome.cast.media.MusicTrackMediaMetadata();
      mediaInfo.metadata.title = track.name || 'Unknown Track';
      mediaInfo.metadata.artist = track.artist || 'Multi-Room Music';
      mediaInfo.metadata.albumName = track.album || 'Unknown Album';
      
      if (track.artwork) {
        mediaInfo.metadata.images = [{
          url: track.artwork,
          height: 300,
          width: 300
        }];
      }
      
      // Set duration if available
      if (track.duration) {
        mediaInfo.duration = track.duration;
      }
      
      // Configure load request with better settings
      const request = new window.chrome.cast.media.LoadRequest(mediaInfo);
      request.autoplay = true;
      request.currentTime = 0;
      
      // Add custom data for debugging
      request.customData = {
        trackId: track.id,
        service: track.service || 'local',
        timestamp: Date.now()
      };
      
      try {
        // Load media with timeout and error handling
        const mediaSession = await session.loadMedia(request);
        console.log(`📺 ✅ Successfully started casting: ${track.name} to ${castDevice?.name || 'device'}`);
        
        // Add media session event listeners
        mediaSession.addUpdateListener((isAlive) => {
          if (!isAlive) {
            console.log('📺 Media session ended');
          }
        });
        
        // Listen for player state changes
        mediaSession.addPlayerStateListener((playerState) => {
          console.log('📺 Player state:', playerState);
          
          if (playerState === window.chrome.cast.media.PlayerState.IDLE) {
            const idleReason = mediaSession.getIdleReason();
            if (idleReason === window.chrome.cast.media.IdleReason.ERROR) {
              console.error('📺 Playback error on cast device');
              // Try to restart casting
              if (retryAttempt < MAX_RETRIES) {
                setTimeout(() => {
                  console.log('📺 Retrying cast due to playback error...');
                  startCasting(track, retryAttempt + 1);
                }, RETRY_DELAY_BASE * Math.pow(2, retryAttempt));
              }
            } else if (idleReason === window.chrome.cast.media.IdleReason.FINISHED) {
              console.log('📺 Track finished on cast device');
            }
          }
        });
        
        setCastRetryCount(0); // Reset on success
        return true;
        
      } catch (loadError) {
        console.error('📺 Failed to load media:', loadError);
        
        // Handle specific error types
        if (loadError.code === window.chrome.cast.ErrorCode.LOAD_MEDIA_FAILED) {
          console.error('📺 Load media failed - possibly unsupported format or network issue');
        } else if (loadError.code === window.chrome.cast.ErrorCode.SESSION_ERROR) {
          console.error('📺 Session error during media load');
        } else if (loadError.code === window.chrome.cast.ErrorCode.CHANNEL_ERROR) {
          console.error('📺 Channel error during media load');
        }
        
        // Retry logic with exponential backoff
        if (retryAttempt < MAX_RETRIES) {
          const retryDelay = RETRY_DELAY_BASE * Math.pow(2, retryAttempt);
          console.log(`📺 Retrying in ${retryDelay}ms... (attempt ${retryAttempt + 1}/${MAX_RETRIES})`);
          
          setCastRetryCount(retryAttempt + 1);
          
          setTimeout(() => {
            startCasting(track, retryAttempt + 1);
          }, retryDelay);
          
          return false;
        } else {
          console.error(`📺 Failed to cast after ${MAX_RETRIES} attempts, giving up`);
          setError({
            code: 'CAST_ERROR',
            message: `Failed to cast "${track.name}" after ${MAX_RETRIES} attempts`
          });
          setCastRetryCount(0);
          return false;
        }
      }
      
    } catch (error) {
      console.error('📺 Cast error:', error);
      
      // Retry for general errors too
      if (retryAttempt < MAX_RETRIES) {
        const retryDelay = RETRY_DELAY_BASE * Math.pow(2, retryAttempt);
        console.log(`📺 General error, retrying in ${retryDelay}ms...`);
        
        setTimeout(() => {
          startCasting(track, retryAttempt + 1);
        }, retryDelay);
      }
      
      return false;
    }
  };

  const toggleCast = async () => {
    try {
      const context = window.cast.framework.CastContext.getInstance();
      
      if (castConnected) {
        console.log('📺 Disconnecting from cast device...');
        const session = context.getCurrentSession();
        if (session) {
          await session.endSession(true);
          console.log('📺 Cast session ended');
        }
        setCastConnected(false);
        setCastDevice(null);
        setCastRetryCount(0);
      } else {
        console.log('📺 Requesting cast session...');
        
        try {
          const session = await context.requestSession();
          console.log('📺 Cast session established');
          
          // Wait a moment for session to stabilize
          setTimeout(async () => {
            if (isPlaying && currentTrackIndex >= 0 && queue[currentTrackIndex]) {
              console.log('📺 Auto-starting cast for current track...');
              await startCasting(queue[currentTrackIndex]);
            }
          }, 1500);
          
        } catch (sessionError) {
          console.error('📺 Failed to establish cast session:', sessionError);
          
          // Handle specific session errors
          if (sessionError.code === window.chrome.cast.ErrorCode.CANCEL) {
            console.log('📺 Cast session cancelled by user');
          } else if (sessionError.code === window.chrome.cast.ErrorCode.TIMEOUT) {
            console.error('📺 Cast session timeout - no devices found');
            setError({
              code: 'CAST_TIMEOUT',
              message: 'No Chromecast devices found. Make sure your devices are on the same network.'
            });
          } else if (sessionError.code === window.chrome.cast.ErrorCode.RECEIVER_UNAVAILABLE) {
            console.error('📺 Cast receiver unavailable');
            setError({
              code: 'CAST_UNAVAILABLE', 
              message: 'Chromecast device is unavailable. Try restarting the device.'
            });
          } else {
            setError({
              code: 'CAST_ERROR',
              message: 'Failed to connect to Chromecast device'
            });
          }
        }
      }
    } catch (error) {
      console.error('📺 Cast toggle error:', error);
      setError({
        code: 'CAST_ERROR',
        message: 'Chromecast connection error'
      });
    }
  };

  // Manual retry connection with full cleanup
  const retryConnection = () => {
    console.log('🔄 Manual retry connection...');
    
    // Clean up existing connection
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
      setSocket(null);
    }
    
    // Clear any existing timers
    setConnectionStatus('disconnected');
    setError(null);
    
    // Attempt new connection after cleanup
    setTimeout(() => {
      connectSocket();
    }, 1000);
  };

  // Music control functions
  const addToQueue = (fileId) => {
    if (socket?.connected) {
      socket.emit('add_to_queue', fileId);
    } else {
      setError({ code: 'NOT_CONNECTED', message: 'Not connected to server' });
    }
  };

  const removeFromQueue = (index) => {
    if (socket?.connected) {
      socket.emit('remove_from_queue', index);
    }
  };

  const clearQueue = () => {
    if (socket?.connected) {
      socket.emit('clear_queue');
    }
  };

  const togglePlayPause = () => {
    if (socket?.connected) {
      socket.emit('play_pause');
    }
  };

  const nextTrack = () => {
    if (socket?.connected) {
      socket.emit('next_track');
    }
  };

  const previousTrack = () => {
    if (socket?.connected) {
      socket.emit('previous_track');
    }
  };

  const skipToTrack = (index) => {
    if (socket?.connected) {
      socket.emit('skip_to_track', index);
    }
  };

  // Latency control functions
  const fetchLatencySettings = async () => {
    try {
      const response = await fetch(`${serverAddress}/api/latency`);
      if (response.ok) {
        const data = await response.json();
        setLatencyDelays(data.delays);
        setActiveZones(data.activeZones);
      }
    } catch (error) {
      console.error('Failed to fetch latency settings:', error);
    }
  };

  const updateLatencyDelay = async (zone, delay) => {
    try {
      console.log(`🎛️ Updating ${zone} delay to ${delay}ms`);
      
      const response = await fetch(`${serverAddress}/api/latency/delays`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ [zone]: delay }),
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ Latency update successful:', result);
        setLatencyDelays(prev => ({ ...prev, [zone]: delay }));
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('❌ Latency update failed:', response.status, errorData);
        setError({ 
          code: 'LATENCY_UPDATE_ERROR', 
          message: `Failed to update latency: ${errorData.error || 'Server error'}` 
        });
      }
    } catch (error) {
      console.error('❌ Failed to update latency delay:', error);
      setError({ 
        code: 'LATENCY_UPDATE_ERROR', 
        message: 'Network error: Failed to update latency settings' 
      });
    }
  };

  const toggleZone = async (zone) => {
    const newActiveState = !activeZones[zone];
    try {
      console.log(`🔧 Toggling ${zone} zone to ${newActiveState}`);
      
      const response = await fetch(`${serverAddress}/api/latency/zones`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ [zone]: newActiveState }),
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ Zone toggle successful:', result);
        setActiveZones(prev => ({ ...prev, [zone]: newActiveState }));
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('❌ Zone toggle failed:', response.status, errorData);
        setError({ 
          code: 'ZONE_UPDATE_ERROR', 
          message: `Failed to toggle zone: ${errorData.error || 'Server error'}` 
        });
      }
    } catch (error) {
      console.error('❌ Failed to toggle zone:', error);
      setError({ 
        code: 'ZONE_UPDATE_ERROR', 
        message: 'Network error: Failed to toggle zone' 
      });
    }
  };

  // Sync monitoring functions
  const fetchSyncStatus = async () => {
    try {
      const response = await fetch(`${serverAddress}/api/sync/status`);
      if (response.ok) {
        const data = await response.json();
        setSyncStatus(data);
        console.log('📊 Sync status updated:', data);
      } else {
        console.error('Failed to fetch sync status:', response.status);
      }
    } catch (error) {
      console.error('Failed to fetch sync status:', error);
    }
  };

  const calibrateSync = async () => {
    try {
      console.log('🔄 Triggering manual sync calibration...');
      const response = await fetch(`${serverAddress}/api/sync/calibrate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ Sync calibration completed:', result);
        // Refresh sync status after calibration
        setTimeout(fetchSyncStatus, 1000);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('❌ Sync calibration failed:', response.status, errorData);
        setError({ 
          code: 'SYNC_CALIBRATION_ERROR', 
          message: `Failed to calibrate sync: ${errorData.error || 'Server error'}` 
        });
      }
    } catch (error) {
      console.error('❌ Failed to calibrate sync:', error);
      setError({ 
        code: 'SYNC_CALIBRATION_ERROR', 
        message: 'Network error: Failed to calibrate sync' 
      });
    }
  };

  // Snapcast control functions
  const fetchSnapcastStatus = async () => {
    try {
      const response = await fetch(`${serverAddress}/api/snapcast/status`);
      if (response.ok) {
        const data = await response.json();
        setSnapcastConnected(data.connected);
        setSnapcastStatus(data.status);
        setSnapcastClients(data.clients);
        setSnapcastGroups(data.groups);
      }
    } catch (error) {
      console.error('Failed to fetch Snapcast status:', error);
    }
  };

  const setClientVolume = async (clientId, volume, muted = null) => {
    try {
      const response = await fetch(`${serverAddress}/api/snapcast/client/volume`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ clientId, volume, muted }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to set client volume');
      }
    } catch (error) {
      console.error('Failed to set client volume:', error);
      setError({ code: 'SNAPCAST_ERROR', message: 'Failed to control client volume' });
    }
  };

  const setClientName = async (clientId, name) => {
    try {
      const response = await fetch(`${serverAddress}/api/snapcast/client/name`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ clientId, name }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to set client name');
      }
    } catch (error) {
      console.error('Failed to set client name:', error);
      setError({ code: 'SNAPCAST_ERROR', message: 'Failed to update client name' });
    }
  };

  const setGroupMute = async (groupId, muted) => {
    try {
      const response = await fetch(`${serverAddress}/api/snapcast/group/mute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ groupId, muted }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to set group mute');
      }
    } catch (error) {
      console.error('Failed to set group mute:', error);
      setError({ code: 'SNAPCAST_ERROR', message: 'Failed to control group mute' });
    }
  };

  const moveClientToGroup = async (clientId, groupId) => {
    try {
      const response = await fetch(`${serverAddress}/api/snapcast/client/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ clientId, groupId }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to move client');
      }
    } catch (error) {
      console.error('Failed to move client:', error);
      setError({ code: 'SNAPCAST_ERROR', message: 'Failed to move client to group' });
    }
  };

  const refreshSnapcastStatus = async () => {
    try {
      const response = await fetch(`${serverAddress}/api/snapcast/refresh`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        throw new Error('Failed to refresh status');
      }
    } catch (error) {
      console.error('Failed to refresh Snapcast status:', error);
      setError({ code: 'SNAPCAST_ERROR', message: 'Failed to refresh Snapcast status' });
    }
  };

  // Apple Music search functions
  const searchAppleMusic = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const response = await fetch(`${serverAddress}/api/apple-music/search?q=${encodeURIComponent(query)}&limit=20`);
      
      if (!response.ok) {
        throw new Error('Search failed');
      }
      
      const data = await response.json();
      setSearchResults(data.tracks || []);
      console.log(`🍎 Found ${data.tracks?.length || 0} Apple Music tracks`);
    } catch (error) {
      console.error('Apple Music search error:', error);
      setError({ code: 'SEARCH_ERROR', message: 'Apple Music search failed' });
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const addAppleMusicTrack = async (track) => {
    try {
      const response = await fetch(`${serverAddress}/api/apple-music/add-to-queue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ track }),
      });

      if (!response.ok) {
        throw new Error('Failed to add track');
      }

      console.log(`🍎 Added Apple Music track to queue: ${track.name}`);
      
      // Clear search after adding
      setSearchQuery('');
      setSearchResults([]);
    } catch (error) {
      console.error('Error adding Apple Music track:', error);
      setError({ code: 'APPLE_MUSIC_ERROR', message: 'Failed to add track to queue' });
    }
  };

  // Handle search input
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    searchAppleMusic(searchQuery);
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // File upload function
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('music', file);

    try {
      setUploadProgress({ percent: 0, status: 'uploading' });

      const response = await fetch(`${serverAddress}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        setUploadProgress({ percent: 100, status: 'complete' });
        setTimeout(() => setUploadProgress(null), 2000);
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      setUploadProgress({ percent: 0, status: 'error' });
      setError({ code: 'UPLOAD_ERROR', message: 'File upload failed' });
      setTimeout(() => setUploadProgress(null), 3000);
    }

    event.target.value = '';
  };

  const getStatusText = () => {
    if (connectionStatus !== 'connected') return 'Offline';
    if (queue.length === 0) return 'No songs in queue';
    if (isPlaying) return `Playing: ${queue[currentTrackIndex]?.name || 'Unknown'}`;
    return `Paused: ${queue[currentTrackIndex]?.name || 'Ready to play'}`;
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-900 text-white">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-4">🎵 Multi-Room Music Player</h1>
            <ConnectionStatus 
              status={connectionStatus} 
              error={error} 
              onRetry={retryConnection}
            />
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-6 bg-red-500/10 border border-red-500/20 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-400">
                <AlertCircle className="w-5 h-5" />
                <span className="font-medium">Error: {error.code}</span>
              </div>
              <p className="text-sm text-red-300 mt-1">{error.message}</p>
            </div>
          )}

          {/* Upload Section */}
          <div className="mb-8 bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">Upload Music</h2>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded cursor-pointer">
                <Upload className="w-4 h-4" />
                Choose File
                <input
                  type="file"
                  accept=".mp3,.wav,.flac,.m4a"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={connectionStatus !== 'connected'}
                />
              </label>
              {uploadProgress && (
                <div className="text-sm">
                  {uploadProgress.status === 'uploading' && `Uploading... ${uploadProgress.percent}%`}
                  {uploadProgress.status === 'complete' && '✅ Upload complete!'}
                  {uploadProgress.status === 'error' && '❌ Upload failed'}
                </div>
              )}
            </div>
          </div>

          {/* Apple Music Search Section */}
          <div className="mb-8 bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Music className="w-5 h-5" />
                Apple Music Search
              </h2>
              <button
                onClick={() => setShowSearch(!showSearch)}
                className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm flex items-center gap-1"
              >
                <Search className="w-4 h-4" />
                {showSearch ? 'Hide' : 'Show'} Search
              </button>
            </div>
            
            {showSearch && (
              <div>
                <form onSubmit={handleSearchSubmit} className="mb-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Search for songs, artists, albums..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="flex-1 bg-gray-700 text-white px-4 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                      disabled={connectionStatus !== 'connected' || searching}
                    />
                    <button
                      type="submit"
                      disabled={connectionStatus !== 'connected' || searching || !searchQuery.trim()}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-6 py-2 rounded flex items-center gap-2"
                    >
                      <Search className="w-4 h-4" />
                      {searching ? 'Searching...' : 'Search'}
                    </button>
                  </div>
                </form>

                {/* Search Results */}
                {searchResults.length > 0 && (
                  <div className="max-h-96 overflow-y-auto space-y-2">
                    <div className="text-sm text-gray-400 mb-2">
                      Found {searchResults.length} results (30-second previews)
                    </div>
                    {searchResults.map((track, index) => (
                      <div
                        key={track.id}
                        className="flex items-center justify-between bg-gray-700 p-3 rounded hover:bg-gray-600"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {track.artwork && (
                            <img
                              src={track.artwork}
                              alt={`${track.name} artwork`}
                              className="w-12 h-12 rounded object-cover"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{track.name}</div>
                            <div className="text-sm text-gray-400 truncate">
                              {track.artist} • {track.album}
                            </div>
                            <div className="text-xs text-gray-500">
                              {track.duration ? formatDuration(track.duration) : ''} 
                              {track.explicit && <span className="ml-2 text-red-400">Explicit</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {track.previewUrl && (
                            <button
                              onClick={() => addAppleMusicTrack(track)}
                              disabled={connectionStatus !== 'connected'}
                              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-3 py-1 rounded text-sm"
                              title="Add 30-second preview to queue"
                            >
                              Add Preview
                            </button>
                          )}
                          {!track.previewUrl && (
                            <span className="text-xs text-gray-500">No Preview</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {searching && (
                  <div className="text-center text-gray-400 py-4">
                    <Search className="w-8 h-8 mx-auto mb-2 animate-pulse" />
                    Searching Apple Music...
                  </div>
                )}

                {searchQuery && !searching && searchResults.length === 0 && (
                  <div className="text-center text-gray-400 py-8">
                    No results found for "{searchQuery}"
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Music Library */}
          <div className="mb-8 bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">Music Library ({musicFiles.length} songs)</h2>
            <div className="grid gap-2 max-h-64 overflow-y-auto">
              {musicFiles.length === 0 ? (
                <div className="text-center text-gray-400 py-8">
                  {connectionStatus === 'connected' ? 'No music files found' : 'Loading music library...'}
                </div>
              ) : (
                musicFiles.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between bg-gray-700 p-3 rounded hover:bg-gray-600"
                  >
                    <span className="truncate">{file.name}</span>
                    <button
                      onClick={() => addToQueue(file.id)}
                      disabled={connectionStatus !== 'connected'}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-3 py-1 rounded text-sm"
                    >
                      {connectionStatus === 'connected' ? 'Add to Queue' : 'Offline'}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Playback Controls */}
          <div className="mb-8 bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">Playback Controls</h2>
            <div className="flex items-center gap-4 mb-4">
              <button
                onClick={previousTrack}
                disabled={connectionStatus !== 'connected' || currentTrackIndex <= 0}
                className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed p-3 rounded"
              >
                <SkipForward className="w-5 h-5 rotate-180" />
              </button>
              <button
                onClick={togglePlayPause}
                disabled={connectionStatus !== 'connected' || queue.length === 0}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed p-3 rounded"
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>
              <button
                onClick={nextTrack}
                disabled={connectionStatus !== 'connected' || currentTrackIndex >= queue.length - 1}
                className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed p-3 rounded"
              >
                <SkipForward className="w-5 h-5" />
              </button>
              
              {/* Chromecast Button */}
              {castAvailable && (
                <button
                  onClick={toggleCast}
                  disabled={connectionStatus !== 'connected'}
                  className={`p-3 rounded transition-all ${
                    castConnected 
                      ? 'bg-green-600 hover:bg-green-700 text-white' 
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  } disabled:bg-gray-800 disabled:cursor-not-allowed`}
                  title={castConnected ? 'Disconnect from Chromecast' : 'Cast to TV'}
                >
                  <Cast className="w-5 h-5" />
                </button>
              )}
            </div>
            <div className="text-sm text-gray-400">
              {getStatusText()}
              {castConnected && castDevice && (
                <span className="text-green-400 ml-2">• Casting to {castDevice.name}</span>
              )}
              {castRetryCount > 0 && (
                <span className="text-yellow-400 ml-2">• Retrying cast ({castRetryCount}/3)</span>
              )}
            </div>
          </div>

          {/* Latency Controls */}
          <div className="mb-8 bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">Audio Synchronization</h2>
            <div className="grid gap-6 md:grid-cols-3">
              {/* Snapcast Delay */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Snapcast</label>
                  <input
                    type="checkbox"
                    checked={activeZones.snapcast}
                    onChange={() => toggleZone('snapcast')}
                    className="rounded"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={latencyDelays.snapcast}
                    onChange={(e) => updateLatencyDelay('snapcast', parseInt(e.target.value))}
                    disabled={connectionStatus !== 'connected'}
                    className="flex-1"
                  />
                  <span className="text-sm text-gray-400 w-12">{latencyDelays.snapcast}ms</span>
                </div>
              </div>

              {/* Chromecast Delay */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Chromecast</label>
                  <input
                    type="checkbox"
                    checked={activeZones.chromecast}
                    onChange={() => toggleZone('chromecast')}
                    className="rounded"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={latencyDelays.chromecast}
                    onChange={(e) => updateLatencyDelay('chromecast', parseInt(e.target.value))}
                    disabled={connectionStatus !== 'connected'}
                    className="flex-1"
                  />
                  <span className="text-sm text-gray-400 w-12">{latencyDelays.chromecast}ms</span>
                </div>
              </div>

              {/* Bluetooth Delay */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Bluetooth</label>
                  <input
                    type="checkbox"
                    checked={activeZones.bluetooth}
                    onChange={() => toggleZone('bluetooth')}
                    className="rounded"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="100"
                    max="500"
                    value={latencyDelays.bluetooth}
                    onChange={(e) => updateLatencyDelay('bluetooth', parseInt(e.target.value))}
                    disabled={connectionStatus !== 'connected'}
                    className="flex-1"
                  />
                  <span className="text-sm text-gray-400 w-12">{latencyDelays.bluetooth}ms</span>
                </div>
              </div>
            </div>
            <div className="mt-4 text-xs text-gray-500">
              Adjust delays to synchronize audio playback across different zones and devices
            </div>
          </div>

          {/* Sync Quality Monitoring */}
          <div className="mb-8 bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Sync Quality Monitoring
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowSyncMonitoring(!showSyncMonitoring)}
                  className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-sm flex items-center gap-1"
                >
                  {showSyncMonitoring ? 'Hide' : 'Show'} Details
                </button>
                <button
                  onClick={calibrateSync}
                  disabled={connectionStatus !== 'connected'}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-3 py-1 rounded text-sm flex items-center gap-1"
                >
                  <RefreshCw className="w-4 h-4" />
                  Calibrate
                </button>
              </div>
            </div>

            {/* Sync Quality Overview */}
            {syncStatus && (
              <div className="grid gap-4 md:grid-cols-3 mb-4">
                {Object.entries(syncStatus.syncQuality || {}).map(([zone, quality]) => {
                  const isActive = syncStatus.activeZones?.[zone];
                  return (
                    <div key={zone} className={`p-4 rounded-lg border ${
                      isActive 
                        ? 'bg-green-500/10 border-green-500/20' 
                        : 'bg-gray-700/50 border-gray-600/50'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-medium capitalize">{zone}</h3>
                        <div className={`px-2 py-1 rounded text-xs ${
                          isActive ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                        }`}>
                          {isActive ? 'Active' : 'Inactive'}
                        </div>
                      </div>
                      
                      {isActive && (
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span>Accuracy:</span>
                            <span className={`font-medium ${
                              quality.accuracy >= 80 ? 'text-green-400' :
                              quality.accuracy >= 60 ? 'text-yellow-400' : 'text-red-400'
                            }`}>
                              {quality.accuracy}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Jitter:</span>
                            <span className={`font-medium ${
                              quality.jitter <= 10 ? 'text-green-400' :
                              quality.jitter <= 30 ? 'text-yellow-400' : 'text-red-400'
                            }`}>
                              {quality.jitter}ms
                            </span>
                          </div>
                          {syncStatus.detectedLatencies?.[zone] && (
                            <div className="flex justify-between">
                              <span>Latency:</span>
                              <span className="text-gray-300">
                                {Math.round(syncStatus.detectedLatencies[zone].average)}ms
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Detailed Sync Information */}
            {showSyncMonitoring && syncStatus && (
              <div className="space-y-4 border-t border-gray-700 pt-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <h4 className="font-medium mb-2">Network Conditions</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Stability:</span>
                        <span className={`capitalize font-medium ${
                          syncStatus.networkConditions?.stability === 'excellent' ? 'text-green-400' :
                          syncStatus.networkConditions?.stability === 'good' ? 'text-blue-400' :
                          syncStatus.networkConditions?.stability === 'fair' ? 'text-yellow-400' : 'text-red-400'
                        }`}>
                          {syncStatus.networkConditions?.stability || 'Unknown'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Avg RTT:</span>
                        <span>{syncStatus.networkConditions?.avgRtt || 0}ms</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Packet Loss:</span>
                        <span>{syncStatus.networkConditions?.packetLoss || 0}%</span>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">Connected Devices</h4>
                    <div className="space-y-1 text-sm">
                      {syncStatus.connectedDevices?.length > 0 ? (
                        syncStatus.connectedDevices.map((device, index) => (
                          <div key={index} className="text-gray-300">• {device}</div>
                        ))
                      ) : (
                        <div className="text-gray-500">No devices connected</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Recent Sync Events */}
                {syncStatus.syncEvents?.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Recent Events</h4>
                    <div className="space-y-1 text-sm max-h-32 overflow-y-auto">
                      {syncStatus.syncEvents.slice(-5).reverse().map((event, index) => (
                        <div key={index} className="flex justify-between text-gray-300">
                          <span>{event.type.replace('_', ' ')}</span>
                          <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 text-xs text-gray-500">
              Real-time monitoring of multi-room audio synchronization quality and network conditions
            </div>
          </div>

          {/* Snapcast Client Management */}
          <div className="mb-8 bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Users className="w-5 h-5" />
                Snapcast Clients ({snapcastClients.length})
              </h2>
              <div className="flex items-center gap-2">
                <div className={`flex items-center gap-2 px-3 py-1 rounded text-sm ${
                  snapcastConnected 
                    ? 'bg-green-500/10 border border-green-500/20 text-green-400' 
                    : 'bg-red-500/10 border border-red-500/20 text-red-400'
                }`}>
                  {snapcastConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
                  {snapcastConnected ? 'Connected' : 'Disconnected'}
                </div>
                <button
                  onClick={refreshSnapcastStatus}
                  disabled={connectionStatus !== 'connected'}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-3 py-1 rounded text-sm flex items-center gap-1"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </button>
              </div>
            </div>

            {!snapcastConnected ? (
              <div className="text-center text-gray-400 py-8">
                <WifiOff className="w-12 h-12 mx-auto mb-4 text-gray-600" />
                <p>Not connected to Snapcast server</p>
                <p className="text-sm text-gray-500 mt-1">Make sure Snapcast server is running on localhost:1705</p>
              </div>
            ) : snapcastClients.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                <Users className="w-12 h-12 mx-auto mb-4 text-gray-600" />
                <p>No Snapcast clients found</p>
                <p className="text-sm text-gray-500 mt-1">Start Snapcast clients to see them here</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Groups */}
                {snapcastGroups.map((group) => (
                  <div key={group.id} className="border border-gray-700 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        Group: {group.name || `Group ${group.id}`}
                      </h3>
                      <button
                        onClick={() => setGroupMute(group.id, !group.muted)}
                        disabled={connectionStatus !== 'connected'}
                        className={`p-2 rounded transition-colors ${
                          group.muted 
                            ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' 
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                        title={group.muted ? 'Unmute Group' : 'Mute Group'}
                      >
                        {group.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* Clients in this group */}
                    <div className="space-y-2">
                      {snapcastClients.filter(client => client.groupId === group.id).map((client) => (
                        <div key={client.id} className="bg-gray-700 rounded p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <div className={`w-3 h-3 rounded-full ${
                                client.connected ? 'bg-green-500' : 'bg-red-500'
                              }`} />
                              <div>
                                <div className="font-medium">{client.host.name || client.host.ip}</div>
                                <div className="text-sm text-gray-400">
                                  {client.host.ip} • {client.config.name || 'Unnamed'}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  const newName = prompt('Enter new name:', client.config.name || '');
                                  if (newName !== null && newName !== client.config.name) {
                                    setClientName(client.id, newName);
                                  }
                                }}
                                disabled={connectionStatus !== 'connected' || !client.connected}
                                className="p-1 text-gray-400 hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Edit Name"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <select
                                value={client.groupId}
                                onChange={(e) => moveClientToGroup(client.id, e.target.value)}
                                disabled={connectionStatus !== 'connected' || !client.connected}
                                className="bg-gray-600 text-white text-sm rounded px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Move to Group"
                              >
                                {snapcastGroups.map((g) => (
                                  <option key={g.id} value={g.id}>
                                    {g.name || `Group ${g.id}`}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {/* Volume Control */}
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => setClientVolume(client.id, client.config.volume.percent, !client.config.volume.muted)}
                              disabled={connectionStatus !== 'connected' || !client.connected}
                              className={`p-1 rounded transition-colors ${
                                client.config.volume.muted 
                                  ? 'bg-red-500/20 text-red-400' 
                                  : 'text-gray-300 hover:text-gray-100'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                              title={client.config.volume.muted ? 'Unmute' : 'Mute'}
                            >
                              {client.config.volume.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                            </button>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={client.config.volume.percent}
                              onChange={(e) => setClientVolume(client.id, parseInt(e.target.value))}
                              disabled={connectionStatus !== 'connected' || !client.connected || client.config.volume.muted}
                              className="flex-1 disabled:opacity-50"
                            />
                            <span className="text-sm text-gray-400 w-12">
                              {client.config.volume.muted ? 'Muted' : `${client.config.volume.percent}%`}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Queue */}
          <div className="bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Queue ({queue.length} songs)</h2>
              {queue.length > 0 && (
                <button
                  onClick={clearQueue}
                  disabled={connectionStatus !== 'connected'}
                  className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-3 py-1 rounded text-sm flex items-center gap-1"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear
                </button>
              )}
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {queue.length === 0 ? (
                <div className="text-center text-gray-400 py-8">
                  Queue is empty. Add songs from the library above.
                </div>
              ) : (
                queue.map((track, index) => (
                  <div
                    key={`${track.id}-${index}`}
                    className={`flex items-center justify-between p-3 rounded cursor-pointer ${
                      index === currentTrackIndex
                        ? 'bg-blue-600/20 border border-blue-500/30'
                        : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                    onClick={() => skipToTrack(index)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-gray-400 text-sm w-8">{index + 1}</span>
                      <span className="truncate">{track.name}</span>
                      {index === currentTrackIndex && isPlaying && (
                        <span className="text-green-400 text-xs">♪ Playing</span>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromQueue(index);
                      }}
                      disabled={connectionStatus !== 'connected'}
                      className="text-red-400 hover:text-red-300 disabled:text-gray-600 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default App;
