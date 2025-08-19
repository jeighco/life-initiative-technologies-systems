import React, { useState, useEffect, useCallback } from 'react';
import { Play, Pause, SkipForward, Upload, Trash2, WifiOff, Wifi, AlertCircle, RefreshCw, Cast } from 'lucide-react';

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
const [latencySettings, setLatencySettings] = useState({
    delays: { snapcast: 0, chromecast: 50, bluetooth: 250 },
    activeZones: { snapcast: true, chromecast: false, bluetooth: false }
  });
  const [castConnected, setCastConnected] = useState(false);

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
        fetchLatencySettings();
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
        setLatencySettings(data);
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

      // Add session state listener
      try {
        context.addEventListener(window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED, (event) => {
          const session = context.getCurrentSession();
          const connected = !!session;
          console.log('📺 Cast session state changed:', connected ? 'Connected' : 'Disconnected');
          setCastConnected(connected);
          
          if (session && isPlaying && currentTrackIndex >= 0) {
            startCasting(queue[currentTrackIndex]);
          }
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

  const startCasting = (track) => {
    try {
      const context = window.cast.framework.CastContext.getInstance();
      const session = context.getCurrentSession();
      
      if (session && track) {
        const mediaInfo = new window.chrome.cast.media.MediaInfo(
          `${serverAddress}/stream/current`,
          'audio/mpeg'
        );
        
        mediaInfo.metadata = new window.chrome.cast.media.MusicTrackMediaMetadata();
        mediaInfo.metadata.title = track.name;
        mediaInfo.metadata.artist = 'Multi-Room Music';
        
        const request = new window.chrome.cast.media.LoadRequest(mediaInfo);
        request.autoplay = true;
        
        session.loadMedia(request).catch(console.error);
      }
    } catch (error) {
      console.error('Cast error:', error);
    }
  };

  const toggleCast = () => {
    try {
      const context = window.cast.framework.CastContext.getInstance();
      
      if (castConnected) {
        context.getCurrentSession()?.endSession(true);
      } else {
        context.requestSession().then(() => {
          if (isPlaying && currentTrackIndex >= 0) {
            startCasting(queue[currentTrackIndex]);
          }
        }).catch(console.error);
      }
    } catch (error) {
      console.error('Cast toggle error:', error);
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

  // Latency control functions
  const fetchLatencySettings = async () => {
    try {
      const response = await fetch(`${serverAddress}/api/latency`);
      const data = await response.json();
      setLatencySettings(data);
    } catch (error) {
      console.error('Failed to fetch latency settings:', error);
    }
  };

  const updateDelay = async (zone, delay) => {
    try {
      const response = await fetch(`${serverAddress}/api/latency/delays`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [zone]: delay })
      });
      setLatencySettings(prev => ({
        ...prev,
        delays: { ...prev.delays, [zone]: delay }
      }));
    } catch (error) {
      console.error('Failed to update delay:', error);
    }
  };

  const updateActiveZone = async (zone, active) => {
    try {
      const response = await fetch(`${serverAddress}/api/latency/zones`, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [zone]: active })
      });
      setLatencySettings(prev => ({
        ...prev,
        activeZones: { ...prev.activeZones, [zone]: active }
      }));
    } catch (error) {
      console.error('Failed to update zone:', error);
    }
  };

  const testSync = async () => {
    try {
      await fetch(`${serverAddress}/api/latency/test`, { method: 'POST' });
    } catch (error) {
      console.error('Failed to test sync:', error);
    }
  };
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


          {/* Latency Control Panel */}
          <div className="mb-8 bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">🎚️ Audio Sync Controls</h2>
            
            {/* Zone Selection */}
            <div className="mb-6">
              <h3 className="text-lg font-medium mb-3">Active Zones</h3>
              <div className="flex gap-6">
                {Object.entries(latencySettings.activeZones).map(([zone, active]) => (
                  <label key={zone} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={(e) => updateActiveZone(zone, e.target.checked)}
                      className="w-4 h-4"
                      disabled={connectionStatus !== 'connected'}
                    />
                    <span className="capitalize">{zone}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Delay Sliders */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium mb-3">Delay Compensation</h3>
              {Object.entries(latencySettings.delays).map(([zone, delay]) => (
                <div key={zone} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="capitalize font-medium">{zone}</span>
                    <span className="text-sm text-gray-400">{delay}ms</span>
                  </div>
                  <input
                    type="range"
                    min={zone === 'bluetooth' ? 100 : 0}
                    max={zone === 'snapcast' ? 100 : zone === 'chromecast' ? 200 : 500}
                    step="10"
                    value={delay}
                    onChange={(e) => updateDelay(zone, parseInt(e.target.value))}
                    disabled={connectionStatus !== 'connected'}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              ))}
            </div>

            {/* Test Sync Button */}
            <div className="mt-6">
              <button
                onClick={testSync}
                disabled={connectionStatus !== 'connected'}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-4 py-2 rounded"
              >
                🔊 Test Sync
              </button>
            </div>
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
              {castConnected && <span className="text-green-400 ml-2">• Casting to TV</span>}
            </div>
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
