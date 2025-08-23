const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { spawn } = require('child_process');

const app = express();
const server = http.createServer(app);

// Socket.IO with CORS configuration
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// CORS headers for HTTP requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Configuration
const PORT = 3000;
const MUSIC_DIR = path.join(__dirname, 'music');
const FFMPEG_PATH = '/opt/homebrew/bin/ffmpeg';

// =============================================================================
// PURE SOCKET.IO SYNCHRONIZATION SYSTEM
// =============================================================================

// Master playback timeline
const playbackState = {
  isPlaying: false,
  currentTrack: null,
  position: 0,           // Current position in milliseconds
  startTime: 0,          // When playback started (server timestamp)
  lastUpdate: Date.now() // Last state update timestamp
};

// Device registry and sync management
const devices = new Map(); // socketId -> deviceInfo
const deviceTypes = {
  CHROMECAST: 'chromecast',
  BLUETOOTH: 'bluetooth', 
  WEB: 'web',
  MOBILE: 'mobile'
};

// Device-specific latency compensation (in milliseconds)
const DEVICE_LATENCIES = {
  [deviceTypes.CHROMECAST]: 85,
  [deviceTypes.BLUETOOTH]: 250,
  [deviceTypes.WEB]: 20,
  [deviceTypes.MOBILE]: 50
};

// Sync coordinator for orchestrating multi-device playback
class SyncCoordinator {
  constructor() {
    this.syncTolerance = 50; // Acceptable sync drift in ms
    this.syncInterval = 1000; // Sync check interval
    this.isActive = false;
  }

  start() {
    if (this.isActive) return;
    this.isActive = true;
    
    this.syncTimer = setInterval(() => {
      this.broadcastSyncUpdate();
    }, this.syncInterval);
    
    console.log(`✅ Sync coordinator started (tolerance: ${this.syncTolerance}ms)`);
  }

  stop() {
    if (!this.isActive) return;
    this.isActive = false;
    
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    
    console.log('⏹️  Sync coordinator stopped');
  }

  getCurrentPosition() {
    if (!playbackState.isPlaying) {
      return playbackState.position;
    }
    
    const elapsed = Date.now() - playbackState.startTime;
    return playbackState.position + elapsed;
  }

  broadcastSyncUpdate() {
    if (devices.size === 0) return;

    const currentPosition = this.getCurrentPosition();
    const timestamp = Date.now();
    
    // Send sync update to all connected devices
    devices.forEach((device, socketId) => {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        const compensatedPosition = currentPosition + (DEVICE_LATENCIES[device.type] || 0);
        
        socket.emit('sync_update', {
          position: compensatedPosition,
          isPlaying: playbackState.isPlaying,
          timestamp: timestamp,
          track: playbackState.currentTrack,
          latencyCompensation: DEVICE_LATENCIES[device.type] || 0
        });
      }
    });
  }

  handlePlay(position = null) {
    const now = Date.now();
    
    if (position !== null) {
      playbackState.position = position;
    }
    
    playbackState.isPlaying = true;
    playbackState.startTime = now;
    playbackState.lastUpdate = now;
    
    // Broadcast coordinated play command
    this.broadcastPlayCommand();
  }

  handlePause() {
    const now = Date.now();
    
    if (playbackState.isPlaying) {
      playbackState.position = this.getCurrentPosition();
    }
    
    playbackState.isPlaying = false;
    playbackState.lastUpdate = now;
    
    // Broadcast coordinated pause command
    this.broadcastPauseCommand();
  }

  handleSeek(position) {
    const now = Date.now();
    
    playbackState.position = position;
    playbackState.startTime = now;
    playbackState.lastUpdate = now;
    
    // Broadcast coordinated seek command
    this.broadcastSeekCommand(position);
  }

  broadcastPlayCommand() {
    const timestamp = Date.now();
    const delayMs = 100; // Small delay to ensure all devices start together
    
    devices.forEach((device, socketId) => {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        const compensatedDelay = delayMs + (DEVICE_LATENCIES[device.type] || 0);
        
        socket.emit('sync_play', {
          position: playbackState.position,
          startTime: timestamp + delayMs,
          delay: compensatedDelay,
          track: playbackState.currentTrack
        });
      }
    });
  }

  broadcastPauseCommand() {
    const timestamp = Date.now();
    
    devices.forEach((device, socketId) => {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('sync_pause', {
          position: this.getCurrentPosition(),
          timestamp: timestamp
        });
      }
    });
  }

  broadcastSeekCommand(position) {
    const timestamp = Date.now();
    
    devices.forEach((device, socketId) => {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('sync_seek', {
          position: position,
          timestamp: timestamp,
          track: playbackState.currentTrack
        });
      }
    });
  }
}

const syncCoordinator = new SyncCoordinator();

// =============================================================================
// MUSIC MANAGEMENT
// =============================================================================

let musicFiles = [];
let queue = [];
let currentTrackIndex = -1;
let httpAudioProcess = null;

// Initialize music library
function initializeMusicLibrary() {
  try {
    if (!fs.existsSync(MUSIC_DIR)) {
      fs.mkdirSync(MUSIC_DIR, { recursive: true });
      console.log(`📁 Created music directory: ${MUSIC_DIR}`);
    }
    
    const files = fs.readdirSync(MUSIC_DIR);
    musicFiles = files
      .filter(file => /\.(mp3|wav|flac|m4a)$/i.test(file))
      .map(file => ({
        name: file,
        path: path.join(MUSIC_DIR, file),
        title: file.replace(/\.(mp3|wav|flac|m4a)$/i, ''),
        duration: 0 // Could be populated with metadata later
      }));
    
    console.log(`✅ Found ${musicFiles.length} music files`);
  } catch (error) {
    console.error('❌ Error initializing music library:', error);
  }
}

// Start HTTP audio stream
function startHttpAudioStream(trackPath) {
  stopHttpAudioStream();
  
  const ffmpegArgs = [
    '-i', trackPath,
    '-acodec', 'mp3',
    '-ab', '192k',
    '-ac', '2',
    '-ar', '44100',
    '-f', 'mp3',
    'pipe:1'
  ];
  
  httpAudioProcess = spawn(FFMPEG_PATH, ffmpegArgs);
  
  httpAudioProcess.on('error', (error) => {
    console.error('❌ HTTP audio stream error:', error);
  });
  
  httpAudioProcess.on('exit', (code) => {
    console.log(`🎵 HTTP audio stream exited with code ${code}`);
  });
  
  console.log(`🎵 Started HTTP audio stream for: ${path.basename(trackPath)}`);
}

function stopHttpAudioStream() {
  if (httpAudioProcess) {
    httpAudioProcess.kill('SIGTERM');
    httpAudioProcess = null;
    console.log('⏹️  Stopped HTTP audio stream');
  }
}

// =============================================================================
// SOCKET.IO EVENT HANDLERS
// =============================================================================

io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);
  
  // Device registration
  socket.on('register_device', (deviceInfo) => {
    const device = {
      id: socket.id,
      type: deviceInfo.type || deviceTypes.WEB,
      name: deviceInfo.name || 'Unknown Device',
      capabilities: deviceInfo.capabilities || [],
      joinTime: Date.now()
    };
    
    devices.set(socket.id, device);
    console.log(`📱 Device registered: ${device.name} (${device.type})`);
    
    // Send current state to new device
    socket.emit('playback_state', {
      isPlaying: playbackState.isPlaying,
      currentTrack: playbackState.currentTrack,
      position: syncCoordinator.getCurrentPosition(),
      queue: queue,
      musicLibrary: musicFiles
    });
    
    // Start sync coordinator if this is the first device
    if (devices.size === 1) {
      syncCoordinator.start();
    }
    
    // Broadcast device list update
    io.emit('devices_update', Array.from(devices.values()));
  });
  
  // Playback controls
  socket.on('play', (data) => {
    console.log('▶️  Play command received');
    syncCoordinator.handlePlay(data?.position);
  });
  
  socket.on('pause', () => {
    console.log('⏸️  Pause command received');
    syncCoordinator.handlePause();
  });
  
  socket.on('seek', (data) => {
    console.log(`⏭️  Seek command received: ${data.position}ms`);
    syncCoordinator.handleSeek(data.position);
  });
  
  socket.on('next_track', () => {
    console.log('⏭️  Next track command received');
    playNextTrack();
  });
  
  socket.on('previous_track', () => {
    console.log('⏮️  Previous track command received');
    playPreviousTrack();
  });
  
  // Queue management
  socket.on('add_to_queue', (data) => {
    const track = musicFiles.find(f => f.name === data.filename);
    if (track) {
      queue.push(track);
      console.log(`➕ Added to queue: ${track.title}`);
      io.emit('queue_updated', queue);
    }
  });
  
  socket.on('clear_queue', () => {
    queue = [];
    console.log('🗑️  Queue cleared');
    io.emit('queue_updated', queue);
  });
  
  socket.on('play_track', (data) => {
    const track = musicFiles.find(f => f.name === data.filename);
    if (track) {
      playTrack(track);
    }
  });
  
  // Disconnect handling
  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
    devices.delete(socket.id);
    
    // Stop sync coordinator if no devices left
    if (devices.size === 0) {
      syncCoordinator.stop();
      syncCoordinator.handlePause(); // Pause playback
    }
    
    // Broadcast device list update
    io.emit('devices_update', Array.from(devices.values()));
  });
});

// =============================================================================
// TRACK PLAYBACK FUNCTIONS
// =============================================================================

function playTrack(track) {
  console.log(`🎵 Playing track: ${track.title}`);
  
  playbackState.currentTrack = track;
  playbackState.position = 0;
  
  // Start HTTP audio stream
  startHttpAudioStream(track.path);
  
  // Update queue index if track is in queue
  const queueIndex = queue.findIndex(q => q.name === track.name);
  if (queueIndex !== -1) {
    currentTrackIndex = queueIndex;
  }
  
  // Start coordinated playback
  syncCoordinator.handlePlay(0);
  
  // Broadcast track change
  io.emit('track_changed', track);
}

function playNextTrack() {
  if (queue.length === 0) return;
  
  currentTrackIndex = (currentTrackIndex + 1) % queue.length;
  playTrack(queue[currentTrackIndex]);
}

function playPreviousTrack() {
  if (queue.length === 0) return;
  
  currentTrackIndex = currentTrackIndex > 0 ? currentTrackIndex - 1 : queue.length - 1;
  playTrack(queue[currentTrackIndex]);
}

// =============================================================================
// HTTP ENDPOINTS
// =============================================================================

// Serve audio stream
app.get('/stream/current', (req, res) => {
  if (!httpAudioProcess || !playbackState.currentTrack) {
    return res.status(404).send('No audio stream available');
  }
  
  res.writeHead(200, {
    'Content-Type': 'audio/mpeg',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  
  httpAudioProcess.stdout.pipe(res);
  
  // Handle client disconnect
  req.on('close', () => {
    console.log('🔌 HTTP stream client disconnected');
  });
});

// API endpoints
app.get('/api/music', (req, res) => {
  res.json({ files: musicFiles });
});

app.get('/api/queue', (req, res) => {
  res.json({ queue: queue });
});

app.get('/api/status', (req, res) => {
  res.json({
    isPlaying: playbackState.isPlaying,
    currentTrack: playbackState.currentTrack,
    position: syncCoordinator.getCurrentPosition(),
    devices: Array.from(devices.values()),
    queue: queue
  });
});

// Apple Music search endpoint (placeholder)
app.get('/api/apple-music/search', (req, res) => {
  // For now, return empty results since we don't have Apple Music integration yet
  res.json([]);
});

// Test endpoint to simulate playing a track
app.post('/api/test-play', (req, res) => {
  if (musicFiles.length === 0) {
    return res.status(400).json({ error: 'No music files available' });
  }
  
  const firstTrack = musicFiles[0];
  playTrack(firstTrack);
  res.json({ 
    message: 'Started playing test track',
    track: firstTrack
  });
});

// File upload
const storage = multer.diskStorage({
  destination: MUSIC_DIR,
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowed = /\.(mp3|wav|flac|m4a)$/i;
    cb(null, allowed.test(file.originalname));
  }
});

app.post('/api/upload', upload.single('music'), (req, res) => {
  if (req.file) {
    initializeMusicLibrary(); // Refresh library
    io.emit('library_updated', musicFiles);
    res.json({ success: true, filename: req.file.filename });
  } else {
    res.status(400).json({ error: 'No valid audio file uploaded' });
  }
});

// Serve React client
app.use(express.static(path.join(__dirname, 'client/build')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build/index.html'));
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

// Initialize and start server
initializeMusicLibrary();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ 🎵 Pure Socket.IO Music Server running on port ${PORT}`);
  console.log(`ℹ️  Server accessible at: http://192.168.12.125:${PORT}`);
  console.log(`ℹ️  Configuration: {
  musicDir: '${MUSIC_DIR}',
  fileCount: ${musicFiles.length},
  syncTolerance: ${syncCoordinator.syncTolerance}ms
}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n⏹️  Shutting down gracefully...');
  syncCoordinator.stop();
  stopHttpAudioStream();
  server.close(() => {
    console.log('✅ Server shut down');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n⏹️  Received SIGTERM, shutting down gracefully...');
  syncCoordinator.stop();
  stopHttpAudioStream();
  server.close(() => {
    console.log('✅ Server shut down');
    process.exit(0);
  });
});