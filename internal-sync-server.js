/**
 * Internal Sync Music Server - Complete Snapcast Replacement
 * Real-time multi-device audio streaming with Apple Music/Spotify-like casting
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { spawn } = require('child_process');
// Using native fetch (available in Node.js 18+)

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

// Internal Sync System - No Snapcast dependency
const SYNC_SYSTEM = {
  // Master playback state
  master: {
    isPlaying: false,
    currentTrack: null,
    position: 0,
    volume: 1.0,
    queue: [],
    startTime: null,
    duration: 0
  },
  
  // Connected devices
  devices: new Map(), // deviceId -> { type, name, ip, socket, stream, syncOffset }
  
  // Audio streams per device
  streams: new Map(), // deviceId -> FFmpeg process
  
  // Real-time sync
  syncInterval: null,
  SYNC_INTERVAL_MS: 100, // 10 times per second sync updates
  
  // Latency compensation per device type
  delays: {
    web: 0,        // Web browsers (reference)
    chromecast: 80,   // Chromecast network + processing delay
    airplay: 120,     // AirPlay delay
    bluetooth: 200,   // Bluetooth audio latency
    upnp: 100        // DLNA/UPnP devices
  }
};

// Logging with timestamps
const logger = {
  info: (msg) => console.log(`[${new Date().toISOString()}] ℹ️  ${msg}`),
  success: (msg) => console.log(`[${new Date().toISOString()}] ✅ ${msg}`),
  warn: (msg) => console.log(`[${new Date().toISOString()}] ⚠️  ${msg}`),
  error: (msg) => console.log(`[${new Date().toISOString()}] ❌ ${msg}`)
};

// Initialize music library
let musicLibrary = [];

function initializeMusicLibrary() {
  if (!fs.existsSync(MUSIC_DIR)) {
    fs.mkdirSync(MUSIC_DIR, { recursive: true });
  }
  
  const files = fs.readdirSync(MUSIC_DIR)
    .filter(file => /\.(mp3|wav|flac|m4a)$/i.test(file))
    .map(file => ({
      filename: file,
      name: file.replace(/\.(mp3|wav|flac|m4a)$/i, ''),
      path: path.join(MUSIC_DIR, file)
    }));
  
  musicLibrary = files;
  logger.info(`Found ${musicLibrary.length} music files`);
  return files;
}

// Internal Sync System Functions
function startMasterClock() {
  if (SYNC_SYSTEM.syncInterval) {
    clearInterval(SYNC_SYSTEM.syncInterval);
  }
  
  SYNC_SYSTEM.syncInterval = setInterval(() => {
    if (SYNC_SYSTEM.master.isPlaying && SYNC_SYSTEM.master.startTime) {
      // Calculate current position
      const elapsed = (Date.now() - SYNC_SYSTEM.master.startTime) / 1000;
      SYNC_SYSTEM.master.position = elapsed;
      
      // Broadcast sync update to all connected devices
      broadcastSyncUpdate();
    }
  }, SYNC_SYSTEM.SYNC_INTERVAL_MS);
}

function broadcastSyncUpdate() {
  const syncData = {
    type: 'sync_update',
    isPlaying: SYNC_SYSTEM.master.isPlaying,
    position: SYNC_SYSTEM.master.position,
    track: SYNC_SYSTEM.master.currentTrack,
    volume: SYNC_SYSTEM.master.volume,
    timestamp: Date.now()
  };
  
  // Send to all web clients
  io.emit('sync_update', syncData);
  
  // Send to cast devices with their specific latency compensation
  SYNC_SYSTEM.devices.forEach((device, deviceId) => {
    if (device.socket && device.socket.connected) {
      const compensatedData = {
        ...syncData,
        position: syncData.position + (SYNC_SYSTEM.delays[device.type] || 0) / 1000
      };
      device.socket.emit('sync_update', compensatedData);
    }
  });
}

function createDeviceStream(deviceId, trackPath) {
  logger.info(`🎵 Creating stream for device: ${deviceId}`);
  
  // Kill existing stream for this device
  if (SYNC_SYSTEM.streams.has(deviceId)) {
    const existingStream = SYNC_SYSTEM.streams.get(deviceId);
    if (existingStream && !existingStream.killed) {
      existingStream.kill('SIGTERM');
    }
  }
  
  // Create new FFmpeg stream
  const ffmpegArgs = [
    '-i', trackPath,
    '-f', 'mp3',
    '-acodec', 'mp3',
    '-ab', '320k',
    '-ar', '44100',
    '-ac', '2',
    '-avoid_negative_ts', 'make_zero',
    '-'
  ];
  
  const stream = spawn(FFMPEG_PATH, ffmpegArgs, {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  stream.on('error', (error) => {
    logger.error(`Stream error for ${deviceId}: ${error}`);
  });
  
  stream.on('exit', (code) => {
    logger.info(`Stream for ${deviceId} ended with code: ${code}`);
    SYNC_SYSTEM.streams.delete(deviceId);
  });
  
  SYNC_SYSTEM.streams.set(deviceId, stream);
  return stream;
}

async function playTrack(track) {
  logger.info(`🎵 Playing track: ${track.name}`);
  
  SYNC_SYSTEM.master.currentTrack = track;
  SYNC_SYSTEM.master.isPlaying = true;
  SYNC_SYSTEM.master.startTime = Date.now();
  SYNC_SYSTEM.master.position = 0;
  
  // Create streams for all connected devices
  const trackPath = path.join(MUSIC_DIR, track.filename);
  
  SYNC_SYSTEM.devices.forEach((device, deviceId) => {
    createDeviceStream(deviceId, trackPath);
  });
  
  // Start master clock
  startMasterClock();
  
  // Broadcast to all clients
  broadcastSyncUpdate();
  
  logger.success(`▶️  Now playing: ${track.name} across ${SYNC_SYSTEM.devices.size} devices`);
}

function pausePlayback() {
  SYNC_SYSTEM.master.isPlaying = false;
  
  // Pause all device streams
  SYNC_SYSTEM.streams.forEach((stream, deviceId) => {
    if (stream && !stream.killed) {
      stream.kill('SIGSTOP'); // Pause process
    }
  });
  
  broadcastSyncUpdate();
  logger.info('⏸️  Playback paused across all devices');
}

function resumePlayback() {
  SYNC_SYSTEM.master.isPlaying = true;
  SYNC_SYSTEM.master.startTime = Date.now() - (SYNC_SYSTEM.master.position * 1000);
  
  // Resume all device streams
  SYNC_SYSTEM.streams.forEach((stream, deviceId) => {
    if (stream && !stream.killed) {
      stream.kill('SIGCONT'); // Resume process
    }
  });
  
  broadcastSyncUpdate();
  logger.info('▶️  Playback resumed across all devices');
}

function stopPlayback() {
  SYNC_SYSTEM.master.isPlaying = false;
  SYNC_SYSTEM.master.currentTrack = null;
  SYNC_SYSTEM.master.position = 0;
  SYNC_SYSTEM.master.startTime = null;
  
  // Stop all streams
  SYNC_SYSTEM.streams.forEach((stream, deviceId) => {
    if (stream && !stream.killed) {
      stream.kill('SIGTERM');
    }
  });
  SYNC_SYSTEM.streams.clear();
  
  if (SYNC_SYSTEM.syncInterval) {
    clearInterval(SYNC_SYSTEM.syncInterval);
    SYNC_SYSTEM.syncInterval = null;
  }
  
  broadcastSyncUpdate();
  logger.info('⏹️  Playback stopped across all devices');
}

// Fast Cast Device Discovery - optimized for known devices
async function discoverCastDevices() {
  logger.info('🔍 Fast device discovery...');
  
  const devices = [];
  
  // Known working IPs first for faster response
  const knownIPs = ['192.168.12.107', '192.168.12.139'];
  const checkPromises = [];
  
  // Check known devices first
  for (const ip of knownIPs) {
    checkPromises.push(checkSingleDevice(ip));
  }
  
  // Check a smaller range in parallel for new devices
  const subnet = '192.168.12';
  for (let i = 100; i <= 150; i++) {
    if (!knownIPs.includes(`${subnet}.${i}`)) {
      checkPromises.push(checkSingleDevice(`${subnet}.${i}`));
    }
  }
  
  // Wait for all checks to complete (max 3 seconds each)
  const results = await Promise.allSettled(checkPromises);
  
  results.forEach(result => {
    if (result.status === 'fulfilled' && result.value) {
      devices.push(result.value);
    }
  });
  
  logger.info(`🎯 Discovery complete. Found ${devices.length} devices`);
  return devices;
}

async function checkSingleDevice(ip) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch(`http://${ip}:8008/setup/eureka_info`, { 
      method: 'GET',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const data = await response.json();
      const deviceName = data.name || data.device_name || `Chromecast (${ip})`;
      
      logger.success(`✅ Found cast device: ${deviceName} at ${ip}`);
      
      return {
        id: `chromecast-${ip}-8008`,
        name: deviceName,
        ip: ip,
        port: 8008,
        type: 'chromecast',
        isAvailable: true,
        isConnected: false
      };
    }
  } catch (error) {
    // Device not reachable
  }
  
  return null;
}

// Socket.IO Connection Handling
io.on('connection', (socket) => {
  const clientIP = socket.handshake.address;
  logger.info(`🔌 Client connected: ${socket.id} from ${clientIP}`);
  
  // Register as web device
  const deviceId = `web-${socket.id}`;
  SYNC_SYSTEM.devices.set(deviceId, {
    type: 'web',
    name: `Web Client (${clientIP})`,
    ip: clientIP,
    socket: socket,
    syncOffset: 0
  });
  
  // Send current state
  socket.emit('sync_update', {
    type: 'sync_update',
    isPlaying: SYNC_SYSTEM.master.isPlaying,
    position: SYNC_SYSTEM.master.position,
    track: SYNC_SYSTEM.master.currentTrack,
    volume: SYNC_SYSTEM.master.volume,
    queue: SYNC_SYSTEM.master.queue,
    timestamp: Date.now()
  });
  
  // Handle playback controls
  socket.on('play', () => {
    if (SYNC_SYSTEM.master.currentTrack) {
      resumePlayback();
    } else if (SYNC_SYSTEM.master.queue.length > 0) {
      playTrack(SYNC_SYSTEM.master.queue[0]);
    }
  });
  
  socket.on('pause', () => {
    pausePlayback();
  });
  
  socket.on('stop', () => {
    stopPlayback();
  });
  
  socket.on('next', () => {
    // Implement next track logic
    logger.info('⏭️  Next track requested');
  });
  
  socket.on('previous', () => {
    // Implement previous track logic
    logger.info('⏮️  Previous track requested');
  });
  
  socket.on('seek', (position) => {
    SYNC_SYSTEM.master.position = position;
    SYNC_SYSTEM.master.startTime = Date.now() - (position * 1000);
    broadcastSyncUpdate();
    logger.info(`⏩ Seeked to ${position}s`);
  });
  
  socket.on('disconnect', () => {
    SYNC_SYSTEM.devices.delete(deviceId);
    logger.info(`🔌 Client disconnected: ${socket.id}`);
  });
});

// REST API Endpoints
app.use(express.json());

// Music library
app.get('/api/library', (req, res) => {
  res.json(musicLibrary);
});

// Queue management
app.post('/api/queue/add', (req, res) => {
  const { filename } = req.body;
  const track = musicLibrary.find(t => t.filename === filename);
  
  if (track) {
    SYNC_SYSTEM.master.queue.push(track);
    logger.info(`➕ Added to queue: ${track.name}`);
    
    broadcastSyncUpdate();
    res.json({ success: true, queue: SYNC_SYSTEM.master.queue });
  } else {
    res.status(404).json({ error: 'Track not found' });
  }
});

app.get('/api/queue', (req, res) => {
  res.json(SYNC_SYSTEM.master.queue);
});

app.delete('/api/queue/clear', (req, res) => {
  SYNC_SYSTEM.master.queue = [];
  broadcastSyncUpdate();
  res.json({ success: true });
});

// Device discovery
app.get('/api/cast/discover', async (req, res) => {
  try {
    const devices = await discoverCastDevices();
    res.json({
      devices: devices,
      devicesFound: devices.length
    });
  } catch (error) {
    logger.error(`Discovery error: ${error}`);
    res.status(500).json({ error: 'Discovery failed' });
  }
});

// Cast device connection
app.post('/api/cast/connect', (req, res) => {
  const { deviceIP, deviceName, deviceType } = req.body;
  const deviceId = `cast-${deviceIP}`;
  
  SYNC_SYSTEM.devices.set(deviceId, {
    type: deviceType || 'chromecast',
    name: deviceName,
    ip: deviceIP,
    socket: null, // Cast devices don't use WebSocket
    syncOffset: SYNC_SYSTEM.delays[deviceType] || 0
  });
  
  logger.success(`📺 Cast device connected: ${deviceName} (${deviceIP})`);
  
  // If currently playing, start stream for this device
  if (SYNC_SYSTEM.master.currentTrack && SYNC_SYSTEM.master.isPlaying) {
    const trackPath = path.join(MUSIC_DIR, SYNC_SYSTEM.master.currentTrack.filename);
    createDeviceStream(deviceId, trackPath);
  }
  
  res.json({ success: true });
});

// Cast device disconnection
app.post('/api/cast/disconnect', (req, res) => {
  const { deviceIP } = req.body;
  const deviceId = `cast-${deviceIP}`;
  
  // Stop stream for this device
  if (SYNC_SYSTEM.streams.has(deviceId)) {
    const stream = SYNC_SYSTEM.streams.get(deviceId);
    if (stream && !stream.killed) {
      stream.kill('SIGTERM');
    }
    SYNC_SYSTEM.streams.delete(deviceId);
  }
  
  SYNC_SYSTEM.devices.delete(deviceId);
  logger.info(`📺 Cast device disconnected: ${deviceIP}`);
  
  res.json({ success: true });
});

// Device-specific audio streams
app.get('/stream/:deviceId', (req, res) => {
  const deviceId = req.params.deviceId;
  const stream = SYNC_SYSTEM.streams.get(deviceId);
  
  if (!stream || stream.killed) {
    return res.status(404).json({ error: 'No active stream for device' });
  }
  
  res.set({
    'Content-Type': 'audio/mpeg',
    'Transfer-Encoding': 'chunked',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  
  stream.stdout.pipe(res);
  
  stream.on('error', () => {
    res.end();
  });
  
  req.on('close', () => {
    // Client disconnected
  });
});

// Playback controls
app.post('/api/play', (req, res) => {
  if (SYNC_SYSTEM.master.currentTrack) {
    resumePlayback();
  } else if (SYNC_SYSTEM.master.queue.length > 0) {
    playTrack(SYNC_SYSTEM.master.queue[0]);
  }
  res.json({ success: true });
});

app.post('/api/pause', (req, res) => {
  pausePlayback();
  res.json({ success: true });
});

app.post('/api/stop', (req, res) => {
  stopPlayback();
  res.json({ success: true });
});

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, MUSIC_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /\.(mp3|wav|flac|m4a)$/i;
    cb(null, allowedTypes.test(file.originalname));
  }
});

app.post('/api/upload', upload.single('musicFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No valid audio file uploaded' });
  }
  
  logger.info(`📁 File uploaded: ${req.file.originalname}`);
  initializeMusicLibrary(); // Refresh library
  
  res.json({ 
    success: true, 
    filename: req.file.filename,
    library: musicLibrary
  });
});

// Serve static files and React app
app.use(express.static(path.join(__dirname, 'client/build')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build/index.html'));
});

// Initialize and start server
function startServer() {
  initializeMusicLibrary();
  startMasterClock();
  
  server.listen(PORT, () => {
    logger.success(`🎵 Internal Sync Music Server running on port ${PORT}`);
    logger.info(`Configuration: {
  musicDir: '${MUSIC_DIR}',
  fileCount: ${musicLibrary.length},
  syncMode: 'Internal (No Snapcast)'
}`);
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('🛑 Shutting down server...');
  
  // Stop all streams
  SYNC_SYSTEM.streams.forEach((stream) => {
    if (stream && !stream.killed) {
      stream.kill('SIGTERM');
    }
  });
  
  if (SYNC_SYSTEM.syncInterval) {
    clearInterval(SYNC_SYSTEM.syncInterval);
  }
  
  server.close(() => {
    logger.info('✅ Server shut down complete');
    process.exit(0);
  });
});

startServer();