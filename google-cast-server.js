/**
 * Google Cast Protocol Implementation
 * Real working cast to Chromecast and Android TV devices
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { spawn } = require('child_process');
const Client = require('castv2-client').Client;
const DefaultMediaReceiver = require('castv2-client').DefaultMediaReceiver;

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
const SERVER_IP = '192.168.12.125'; // Your server IP

// Internal State Management
const CAST_SYSTEM = {
  // Master playback state
  master: {
    isPlaying: false,
    currentTrack: null,
    currentTrackIndex: -1,
    position: 0,
    volume: 1.0,
    queue: [],
    startTime: null,
    duration: 0
  },
  
  // Connected cast devices with Google Cast clients
  devices: new Map(), // deviceId -> { client, player, name, ip, type, isConnected }
  
  // Real-time sync
  syncInterval: null,
  SYNC_INTERVAL_MS: 1000, // 1 second sync updates for cast devices
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

// Google Cast Functions
async function connectToCastDevice(deviceIP, deviceName) {
  try {
    logger.info(`🎯 Connecting to cast device: ${deviceName} (${deviceIP})`);
    
    const client = new Client();
    
    return new Promise((resolve, reject) => {
      client.connect(deviceIP, () => {
        logger.success(`🔗 Connected to ${deviceName}`);
        
        // Launch the default media receiver app
        client.launch(DefaultMediaReceiver, (err, player) => {
          if (err) {
            logger.error(`Failed to launch media receiver on ${deviceName}: ${err}`);
            reject(err);
            return;
          }
          
          logger.success(`📺 Media receiver launched on ${deviceName}`);
          
          const deviceId = `cast-${deviceIP}`;
          CAST_SYSTEM.devices.set(deviceId, {
            client: client,
            player: player,
            name: deviceName,
            ip: deviceIP,
            type: 'chromecast',
            isConnected: true
          });
          
          // Listen for player status updates
          player.on('status', (status) => {
            logger.info(`📊 ${deviceName} status: ${status.playerState} - ${status.currentTime}s`);
          });
          
          resolve({ deviceId, client, player });
        });
      });
      
      client.on('error', (err) => {
        logger.error(`Cast client error for ${deviceName}: ${err}`);
        reject(err);
      });
    });
  } catch (error) {
    logger.error(`Failed to connect to ${deviceName}: ${error}`);
    throw error;
  }
}

async function castMediaToDevice(deviceId, mediaUrl, metadata) {
  try {
    const device = CAST_SYSTEM.devices.get(deviceId);
    if (!device || !device.player) {
      throw new Error(`Device ${deviceId} not connected`);
    }
    
    logger.info(`🎵 Casting to ${device.name}: ${metadata.title}`);
    
    const media = {
      contentId: mediaUrl,
      contentType: 'audio/mpeg',
      streamType: 'BUFFERED', // or 'LIVE'
      metadata: {
        type: 0,
        metadataType: 0,
        title: metadata.title,
        subtitle: metadata.artist || '',
        images: metadata.artwork ? [{ url: metadata.artwork }] : []
      }
    };
    
    return new Promise((resolve, reject) => {
      device.player.load(media, { autoplay: true }, (err, status) => {
        if (err) {
          logger.error(`Failed to load media on ${device.name}: ${err}`);
          reject(err);
          return;
        }
        
        logger.success(`🎶 Now playing on ${device.name}: ${metadata.title}`);
        resolve(status);
      });
    });
  } catch (error) {
    logger.error(`Cast media error: ${error}`);
    throw error;
  }
}

async function pauseCastDevice(deviceId) {
  try {
    const device = CAST_SYSTEM.devices.get(deviceId);
    if (!device || !device.player) {
      throw new Error(`Device ${deviceId} not connected`);
    }
    
    return new Promise((resolve, reject) => {
      device.player.pause((err, status) => {
        if (err) {
          reject(err);
          return;
        }
        logger.info(`⏸️  Paused ${device.name}`);
        resolve(status);
      });
    });
  } catch (error) {
    logger.error(`Pause error: ${error}`);
    throw error;
  }
}

async function playCastDevice(deviceId) {
  try {
    const device = CAST_SYSTEM.devices.get(deviceId);
    if (!device || !device.player) {
      throw new Error(`Device ${deviceId} not connected`);
    }
    
    return new Promise((resolve, reject) => {
      device.player.play((err, status) => {
        if (err) {
          reject(err);
          return;
        }
        logger.info(`▶️  Resumed ${device.name}`);
        resolve(status);
      });
    });
  } catch (error) {
    logger.error(`Play error: ${error}`);
    throw error;
  }
}

async function stopCastDevice(deviceId) {
  try {
    const device = CAST_SYSTEM.devices.get(deviceId);
    if (!device || !device.player) {
      throw new Error(`Device ${deviceId} not connected`);
    }
    
    return new Promise((resolve, reject) => {
      device.player.stop((err, status) => {
        if (err) {
          reject(err);
          return;
        }
        logger.info(`⏹️  Stopped ${device.name}`);
        resolve(status);
      });
    });
  } catch (error) {
    logger.error(`Stop error: ${error}`);
    throw error;
  }
}

async function seekCastDevice(deviceId, currentTime) {
  try {
    const device = CAST_SYSTEM.devices.get(deviceId);
    if (!device || !device.player) {
      throw new Error(`Device ${deviceId} not connected`);
    }
    
    return new Promise((resolve, reject) => {
      device.player.seek(currentTime, (err, status) => {
        if (err) {
          reject(err);
          return;
        }
        logger.info(`⏩ Seeked ${device.name} to ${currentTime}s`);
        resolve(status);
      });
    });
  } catch (error) {
    logger.error(`Seek error: ${error}`);
    throw error;
  }
}

async function disconnectCastDevice(deviceId) {
  try {
    const device = CAST_SYSTEM.devices.get(deviceId);
    if (!device) {
      return;
    }
    
    if (device.client) {
      device.client.close();
    }
    
    CAST_SYSTEM.devices.delete(deviceId);
    logger.info(`🔌 Disconnected from ${device.name}`);
  } catch (error) {
    logger.error(`Disconnect error: ${error}`);
  }
}

// Playback Control Functions
async function playTrack(trackIndex) {
  if (trackIndex < 0 || trackIndex >= CAST_SYSTEM.master.queue.length) {
    throw new Error('Invalid track index');
  }
  
  const track = CAST_SYSTEM.master.queue[trackIndex];
  logger.info(`🎵 Playing track: ${track.name}`);
  
  CAST_SYSTEM.master.currentTrack = track;
  CAST_SYSTEM.master.currentTrackIndex = trackIndex;
  CAST_SYSTEM.master.isPlaying = true;
  CAST_SYSTEM.master.startTime = Date.now();
  CAST_SYSTEM.master.position = 0;
  
  // Create HTTP stream URL for the track
  const mediaUrl = `http://${SERVER_IP}:${PORT}/stream/track/${encodeURIComponent(track.filename)}`;
  
  const metadata = {
    title: track.name,
    artist: track.artist || 'Unknown Artist',
    artwork: track.artwork || null
  };
  
  // Cast to all connected devices
  const castPromises = [];
  CAST_SYSTEM.devices.forEach((device, deviceId) => {
    if (device.isConnected) {
      castPromises.push(castMediaToDevice(deviceId, mediaUrl, metadata));
    }
  });
  
  try {
    await Promise.all(castPromises);
    logger.success(`▶️  Now playing: ${track.name} on ${CAST_SYSTEM.devices.size} devices`);
    
    // Broadcast to web clients
    io.emit('playback_update', {
      isPlaying: true,
      currentTrack: track,
      currentTrackIndex: trackIndex,
      position: 0,
      queue: CAST_SYSTEM.master.queue
    });
  } catch (error) {
    logger.error(`Failed to cast to some devices: ${error}`);
  }
}

async function pauseAllDevices() {
  CAST_SYSTEM.master.isPlaying = false;
  
  const pausePromises = [];
  CAST_SYSTEM.devices.forEach((device, deviceId) => {
    if (device.isConnected) {
      pausePromises.push(pauseCastDevice(deviceId));
    }
  });
  
  try {
    await Promise.all(pausePromises);
    logger.info('⏸️  Paused playback on all devices');
    
    io.emit('playback_update', {
      isPlaying: false,
      currentTrack: CAST_SYSTEM.master.currentTrack,
      currentTrackIndex: CAST_SYSTEM.master.currentTrackIndex,
      position: CAST_SYSTEM.master.position,
      queue: CAST_SYSTEM.master.queue
    });
  } catch (error) {
    logger.error(`Failed to pause some devices: ${error}`);
  }
}

async function resumeAllDevices() {
  CAST_SYSTEM.master.isPlaying = true;
  CAST_SYSTEM.master.startTime = Date.now() - (CAST_SYSTEM.master.position * 1000);
  
  const playPromises = [];
  CAST_SYSTEM.devices.forEach((device, deviceId) => {
    if (device.isConnected) {
      playPromises.push(playCastDevice(deviceId));
    }
  });
  
  try {
    await Promise.all(playPromises);
    logger.info('▶️  Resumed playback on all devices');
    
    io.emit('playback_update', {
      isPlaying: true,
      currentTrack: CAST_SYSTEM.master.currentTrack,
      currentTrackIndex: CAST_SYSTEM.master.currentTrackIndex,
      position: CAST_SYSTEM.master.position,
      queue: CAST_SYSTEM.master.queue
    });
  } catch (error) {
    logger.error(`Failed to resume some devices: ${error}`);
  }
}

// Fast Cast Device Discovery
async function discoverCastDevices() {
  logger.info('🔍 Fast device discovery...');
  
  const devices = [];
  const knownIPs = ['192.168.12.107', '192.168.12.139'];
  const checkPromises = [];
  
  for (const ip of knownIPs) {
    checkPromises.push(checkSingleDevice(ip));
  }
  
  const subnet = '192.168.12';
  for (let i = 100; i <= 150; i++) {
    if (!knownIPs.includes(`${subnet}.${i}`)) {
      checkPromises.push(checkSingleDevice(`${subnet}.${i}`));
    }
  }
  
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
  
  // Send current state
  socket.emit('playback_update', {
    isPlaying: CAST_SYSTEM.master.isPlaying,
    currentTrack: CAST_SYSTEM.master.currentTrack,
    currentTrackIndex: CAST_SYSTEM.master.currentTrackIndex,
    position: CAST_SYSTEM.master.position,
    queue: CAST_SYSTEM.master.queue
  });
  
  socket.on('play', async () => {
    if (CAST_SYSTEM.master.currentTrack) {
      await resumeAllDevices();
    } else if (CAST_SYSTEM.master.queue.length > 0) {
      await playTrack(0);
    }
  });
  
  socket.on('pause', async () => {
    await pauseAllDevices();
  });
  
  socket.on('next', async () => {
    if (CAST_SYSTEM.master.currentTrackIndex < CAST_SYSTEM.master.queue.length - 1) {
      await playTrack(CAST_SYSTEM.master.currentTrackIndex + 1);
    }
  });
  
  socket.on('previous', async () => {
    if (CAST_SYSTEM.master.currentTrackIndex > 0) {
      await playTrack(CAST_SYSTEM.master.currentTrackIndex - 1);
    }
  });
  
  socket.on('disconnect', () => {
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
    CAST_SYSTEM.master.queue.push(track);
    logger.info(`➕ Added to queue: ${track.name}`);
    
    io.emit('queue_update', CAST_SYSTEM.master.queue);
    res.json({ success: true, queue: CAST_SYSTEM.master.queue });
  } else {
    res.status(404).json({ error: 'Track not found' });
  }
});

app.get('/api/queue', (req, res) => {
  res.json(CAST_SYSTEM.master.queue);
});

app.delete('/api/queue/clear', (req, res) => {
  CAST_SYSTEM.master.queue = [];
  io.emit('queue_update', CAST_SYSTEM.master.queue);
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

// Cast device connection with media casting
app.post('/api/cast/connect', async (req, res) => {
  try {
    const { deviceIP, deviceName, deviceType } = req.body;
    
    const result = await connectToCastDevice(deviceIP, deviceName);
    
    logger.success(`📺 Cast device connected: ${deviceName} (${deviceIP})`);
    
    // Broadcast device connection to all clients
    io.emit('device_connected', {
      deviceId: result.deviceId,
      deviceName: deviceName,
      deviceIP: deviceIP
    });
    
    res.json({ success: true, deviceId: result.deviceId });
  } catch (error) {
    logger.error(`Failed to connect to cast device: ${error}`);
    res.status(500).json({ error: error.message });
  }
});

// Cast media to specific device or all devices
app.post('/api/cast/media', async (req, res) => {
  try {
    const { deviceId, trackFilename, metadata } = req.body;
    
    // Find track in library
    const track = musicLibrary.find(t => t.filename === trackFilename);
    if (!track) {
      return res.status(404).json({ error: 'Track not found' });
    }
    
    // Update master state
    CAST_SYSTEM.master.currentTrack = track;
    CAST_SYSTEM.master.isPlaying = true;
    CAST_SYSTEM.master.startTime = Date.now();
    CAST_SYSTEM.master.position = 0;
    
    const mediaUrl = `http://${SERVER_IP}:${PORT}/stream/track/${encodeURIComponent(track.filename)}`;
    const castMetadata = {
      title: metadata?.title || track.name,
      artist: metadata?.artist || 'Unknown Artist'
    };
    
    if (deviceId === 'all') {
      // Cast to all connected devices (multi-room sync)
      const castPromises = [];
      CAST_SYSTEM.devices.forEach((device, devId) => {
        if (device.isConnected) {
          castPromises.push(castMediaToDevice(devId, mediaUrl, castMetadata));
        }
      });
      
      await Promise.all(castPromises);
      logger.success(`🎵 Multi-room cast: ${track.name} to ${CAST_SYSTEM.devices.size} devices`);
    } else {
      // Cast to specific device
      await castMediaToDevice(deviceId, mediaUrl, castMetadata);
      logger.success(`🎵 Single cast: ${track.name} to ${deviceId}`);
    }
    
    // Broadcast playback state to all clients
    io.emit('playback_update', {
      isPlaying: true,
      currentTrack: track,
      position: 0,
      devices: Array.from(CAST_SYSTEM.devices.keys())
    });
    
    res.json({ success: true });
  } catch (error) {
    logger.error(`Failed to cast media: ${error}`);
    res.status(500).json({ error: error.message });
  }
});

// Cast device disconnection
app.post('/api/cast/disconnect', async (req, res) => {
  try {
    const { deviceIP } = req.body;
    const deviceId = `cast-${deviceIP}`;
    
    await disconnectCastDevice(deviceId);
    res.json({ success: true });
  } catch (error) {
    logger.error(`Failed to disconnect cast device: ${error}`);
    res.status(500).json({ error: error.message });
  }
});

// Audio streaming endpoint for cast devices
app.get('/stream/track/:filename', (req, res) => {
  const filename = decodeURIComponent(req.params.filename);
  const filePath = path.join(MUSIC_DIR, filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Track not found' });
  }
  
  logger.info(`🎵 Streaming ${filename} to cast device`);
  
  // Set headers for audio streaming
  res.set({
    'Content-Type': 'audio/mpeg',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  
  // Create FFmpeg stream for the track
  const ffmpeg = spawn(FFMPEG_PATH, [
    '-i', filePath,
    '-f', 'mp3',
    '-acodec', 'mp3',
    '-ab', '320k',
    '-ar', '44100',
    '-ac', '2',
    '-'
  ], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  ffmpeg.stdout.pipe(res);
  
  ffmpeg.on('error', (error) => {
    logger.error(`FFmpeg error for ${filename}: ${error}`);
    res.end();
  });
  
  ffmpeg.on('exit', (code) => {
    logger.info(`FFmpeg stream for ${filename} ended with code: ${code}`);
  });
  
  req.on('close', () => {
    ffmpeg.kill('SIGTERM');
  });
});

// Enhanced playback controls with multi-device sync
app.post('/api/play', async (req, res) => {
  try {
    if (CAST_SYSTEM.master.currentTrack) {
      await resumeAllDevices();
    } else if (CAST_SYSTEM.master.queue.length > 0) {
      await playTrack(0);
    } else {
      return res.status(400).json({ error: 'No track available to play' });
    }
    
    // Broadcast state to all clients
    io.emit('playback_update', {
      isPlaying: true,
      currentTrack: CAST_SYSTEM.master.currentTrack,
      position: CAST_SYSTEM.master.position,
      devices: Array.from(CAST_SYSTEM.devices.keys())
    });
    
    res.json({ success: true, isPlaying: true });
  } catch (error) {
    logger.error(`Play error: ${error}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/pause', async (req, res) => {
  try {
    await pauseAllDevices();
    
    // Broadcast state to all clients
    io.emit('playback_update', {
      isPlaying: false,
      currentTrack: CAST_SYSTEM.master.currentTrack,
      position: CAST_SYSTEM.master.position,
      devices: Array.from(CAST_SYSTEM.devices.keys())
    });
    
    res.json({ success: true, isPlaying: false });
  } catch (error) {
    logger.error(`Pause error: ${error}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/stop', async (req, res) => {
  try {
    // Stop all cast devices
    const stopPromises = [];
    CAST_SYSTEM.devices.forEach((device, deviceId) => {
      if (device.isConnected) {
        stopPromises.push(stopCastDevice(deviceId));
      }
    });
    
    await Promise.all(stopPromises);
    
    // Reset master state
    CAST_SYSTEM.master.isPlaying = false;
    CAST_SYSTEM.master.currentTrack = null;
    CAST_SYSTEM.master.position = 0;
    
    // Broadcast state to all clients
    io.emit('playback_update', {
      isPlaying: false,
      currentTrack: null,
      position: 0,
      devices: Array.from(CAST_SYSTEM.devices.keys())
    });
    
    res.json({ success: true, isPlaying: false });
  } catch (error) {
    logger.error(`Stop error: ${error}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/next', async (req, res) => {
  try {
    if (CAST_SYSTEM.master.currentTrackIndex < CAST_SYSTEM.master.queue.length - 1) {
      await playTrack(CAST_SYSTEM.master.currentTrackIndex + 1);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/previous', async (req, res) => {
  try {
    if (CAST_SYSTEM.master.currentTrackIndex > 0) {
      await playTrack(CAST_SYSTEM.master.currentTrackIndex - 1);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
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
  try {
    if (!req.file) {
      logger.warn(`❌ Upload failed: No file provided`);
      return res.status(400).json({ error: 'No valid audio file uploaded' });
    }
    
    logger.info(`📁 File uploaded successfully: ${req.file.originalname} (${req.file.size} bytes)`);
    
    // Refresh music library
    const previousCount = musicLibrary.length;
    initializeMusicLibrary();
    const newCount = musicLibrary.length;
    
    logger.success(`✅ Library updated: ${previousCount} → ${newCount} tracks`);
    
    // Broadcast library update to all connected clients
    io.emit('library_update', {
      library: musicLibrary,
      newTrack: {
        filename: req.file.filename,
        name: req.file.originalname.replace(/\.(mp3|wav|flac|m4a)$/i, ''),
        size: req.file.size
      }
    });
    
    res.json({ 
      success: true, 
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      library: musicLibrary
    });
  } catch (error) {
    logger.error(`❌ Upload error: ${error.message}`);
    res.status(500).json({ error: `Upload failed: ${error.message}` });
  }
});

// Alternative upload endpoint that might work better with iOS
app.post('/api/upload-music', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      logger.warn(`❌ Music upload failed: No file provided`);
      return res.status(400).json({ error: 'No valid audio file uploaded' });
    }
    
    logger.info(`📁 Music file uploaded: ${req.file.originalname}`);
    initializeMusicLibrary();
    
    io.emit('library_update', { library: musicLibrary });
    
    res.json({ 
      success: true, 
      filename: req.file.filename,
      library: musicLibrary
    });
  } catch (error) {
    logger.error(`❌ Music upload error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'client/build')));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/stream')) {
    res.sendFile(path.join(__dirname, 'client/build/index.html'));
  }
});

// Initialize and start server
function startServer() {
  initializeMusicLibrary();
  
  server.listen(PORT, () => {
    logger.success(`🎵 Google Cast Music Server running on port ${PORT}`);
    logger.info(`Configuration: {
  musicDir: '${MUSIC_DIR}',
  fileCount: ${musicLibrary.length},
  serverIP: '${SERVER_IP}',
  castMode: 'Google Cast Protocol'
}`);
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('🛑 Shutting down server...');
  
  // Disconnect all cast devices
  CAST_SYSTEM.devices.forEach((device, deviceId) => {
    disconnectCastDevice(deviceId);
  });
  
  server.close(() => {
    logger.info('✅ Server shut down complete');
    process.exit(0);
  });
});

startServer();