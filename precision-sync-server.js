/**
 * Precision Multi-Room Sync Server
 * Apple Music/Spotify-style casting with microsecond precision sync
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
const StreamingIntegration = require('./streaming-integration');

const app = express();
const server = http.createServer(app);

// Socket.IO with enhanced configuration
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: false
  },
  transports: ['polling', 'websocket'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000
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
const SERVER_IP = '192.168.12.125';

// Initialize Streaming Services
const streamingIntegration = new StreamingIntegration();

// Precision Sync System
const SYNC_ENGINE = {
  // Master timing - high precision
  master: {
    isPlaying: false,
    currentTrack: null,
    trackStartTime: null,  // When track started (high precision timestamp)
    trackDuration: 0,
    pausedAt: 0,          // Position when paused
    queue: [],
    currentTrackIndex: -1
  },
  
  // Connected devices with precise timing
  devices: new Map(), // deviceId -> { client, player, name, ip, latencyOffset, lastSyncTime }
  
  // Real-time sync monitoring
  syncMonitor: null,
  SYNC_INTERVAL_MS: 2000,   // Check sync every 2 seconds (less aggressive)
  SYNC_TOLERANCE_MS: 300,   // Resync if >300ms drift (tolerance zone)
  MIN_RESYNC_INTERVAL_MS: 5000, // Don't resync same device within 5 seconds
  
  // Device latency compensation (measured in ms)
  deviceLatency: new Map(), // deviceId -> measured latency
  
  // Timing precision
  getHighPrecisionTime: () => {
    const [seconds, nanoseconds] = process.hrtime();
    return (seconds * 1000) + (nanoseconds / 1000000);
  }
};

// Logging with timestamps
const logger = {
  info: (msg) => console.log(`[${new Date().toISOString()}] ℹ️  ${msg}`),
  success: (msg) => console.log(`[${new Date().toISOString()}] ✅ ${msg}`),
  warn: (msg) => console.log(`[${new Date().toISOString()}] ⚠️  ${msg}`),
  error: (msg) => console.log(`[${new Date().toISOString()}] ❌ ${msg}`),
  sync: (msg) => console.log(`[${new Date().toISOString()}] 🔄 ${msg}`)
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
      id: file, // Use filename as ID for React key compatibility
      filename: file,
      name: file.replace(/\.(mp3|wav|flac|m4a)$/i, ''),
      path: path.join(MUSIC_DIR, file)
    }));
  
  musicLibrary = files;
  logger.info(`Found ${musicLibrary.length} music files`);
  return files;
}

// Precision timing functions
function getCurrentPosition() {
  if (!SYNC_ENGINE.master.isPlaying || !SYNC_ENGINE.master.trackStartTime) {
    return SYNC_ENGINE.master.pausedAt || 0;
  }
  
  const now = SYNC_ENGINE.getHighPrecisionTime();
  const elapsed = (now - SYNC_ENGINE.master.trackStartTime) / 1000; // Convert to seconds
  return (SYNC_ENGINE.master.pausedAt || 0) + elapsed;
}

function getMasterSyncData() {
  return {
    isPlaying: SYNC_ENGINE.master.isPlaying,
    currentTrack: SYNC_ENGINE.master.currentTrack,
    currentPosition: getCurrentPosition(),
    trackDuration: SYNC_ENGINE.master.trackDuration,
    serverTime: SYNC_ENGINE.getHighPrecisionTime(),
    trackStartTime: SYNC_ENGINE.master.trackStartTime,
    pausedAt: SYNC_ENGINE.master.pausedAt
  };
}

// Device latency measurement
async function measureDeviceLatency(deviceId) {
  const device = SYNC_ENGINE.devices.get(deviceId);
  if (!device || !device.player) return 50; // Default fallback
  
  const measurements = [];
  
  for (let i = 0; i < 3; i++) {
    const start = SYNC_ENGINE.getHighPrecisionTime();
    
    try {
      await new Promise((resolve, reject) => {
        device.player.getStatus((err, status) => {
          if (err) reject(err);
          else resolve(status);
        });
      });
      
      const latency = SYNC_ENGINE.getHighPrecisionTime() - start;
      measurements.push(latency);
    } catch (error) {
      // Skip failed measurement
    }
    
    // Small delay between measurements
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  if (measurements.length === 0) return 50;
  
  // Use median to avoid outliers
  measurements.sort((a, b) => a - b);
  const median = measurements[Math.floor(measurements.length / 2)];
  
  SYNC_ENGINE.deviceLatency.set(deviceId, median);
  logger.sync(`📏 ${device.name} latency: ${median.toFixed(1)}ms`);
  
  return median;
}

// Precision sync monitoring
function startSyncMonitoring() {
  if (SYNC_ENGINE.syncMonitor) {
    clearInterval(SYNC_ENGINE.syncMonitor);
  }
  
  SYNC_ENGINE.syncMonitor = setInterval(async () => {
    if (!SYNC_ENGINE.master.isPlaying) return;
    
    const masterPosition = getCurrentPosition();
    const masterTime = SYNC_ENGINE.getHighPrecisionTime();
    
    // Check each device for sync drift
    for (const [deviceId, device] of SYNC_ENGINE.devices) {
      if (!device.isConnected || !device.player) continue;
      
      try {
        const latency = SYNC_ENGINE.deviceLatency.get(deviceId) || 50;
        
        // Get device status
        device.player.getStatus((err, status) => {
          if (err || !status) return;
          
          const devicePosition = status.currentTime || 0;
          const expectedPosition = masterPosition - (latency / 1000); // Compensate for latency
          const drift = Math.abs(devicePosition - expectedPosition);
          
          // Log sync status
          if (drift > 0.05) { // Log if >50ms drift
            logger.sync(`📊 ${device.name}: ${devicePosition.toFixed(2)}s (drift: ${(drift * 1000).toFixed(0)}ms)`);
          }
          
          // Resync if drift is too large AND we haven't resynced recently
          if (drift > (SYNC_ENGINE.SYNC_TOLERANCE_MS / 1000)) {
            const now = Date.now();
            const lastSync = device.lastSyncTime || 0;
            const timeSinceLastSync = now - lastSync;
            
            if (timeSinceLastSync >= SYNC_ENGINE.MIN_RESYNC_INTERVAL_MS) {
              logger.warn(`🔄 Resyncing ${device.name}: ${(drift * 1000).toFixed(0)}ms drift (last sync: ${(timeSinceLastSync/1000).toFixed(1)}s ago)`);
              device.lastSyncTime = now;
              resyncDevice(deviceId, expectedPosition);
            } else {
              logger.warn(`⏳ Skipping resync for ${device.name}: ${(drift * 1000).toFixed(0)}ms drift (throttled - ${((SYNC_ENGINE.MIN_RESYNC_INTERVAL_MS - timeSinceLastSync)/1000).toFixed(1)}s remaining)`);
            }
          }
        });
      } catch (error) {
        // Skip sync check for this device
      }
    }
    
    // Broadcast sync data to iOS app
    io.emit('sync_status', {
      masterPosition: masterPosition,
      masterTime: masterTime,
      devices: Array.from(SYNC_ENGINE.devices.entries()).map(([id, device]) => ({
        id: id,
        name: device.name,
        isConnected: device.isConnected,
        latency: SYNC_ENGINE.deviceLatency.get(id) || 0
      }))
    });
    
  }, SYNC_ENGINE.SYNC_INTERVAL_MS);
}

// Precision device resync
async function resyncDevice(deviceId, targetPosition) {
  const device = SYNC_ENGINE.devices.get(deviceId);
  if (!device || !device.player) return;
  
  try {
    await new Promise((resolve, reject) => {
      device.player.seek(targetPosition, (err, status) => {
        if (err) reject(err);
        else resolve(status);
      });
    });
    
    logger.sync(`🎯 Resynced ${device.name} to ${targetPosition.toFixed(2)}s`);
  } catch (error) {
    logger.error(`Failed to resync ${device.name}: ${error}`);
  }
}

// Google Cast functions with precision timing
async function connectToCastDevice(deviceIP, deviceName) {
  try {
    logger.info(`🎯 Connecting to cast device: ${deviceName} (${deviceIP})`);
    
    const client = new Client();
    
    return new Promise((resolve, reject) => {
      client.connect(deviceIP, () => {
        logger.success(`🔗 Connected to ${deviceName}`);
        
        client.launch(DefaultMediaReceiver, async (err, player) => {
          if (err) {
            logger.error(`Failed to launch media receiver on ${deviceName}: ${err}`);
            reject(err);
            return;
          }
          
          logger.success(`📺 Media receiver launched on ${deviceName}`);
          
          const deviceId = `cast-${deviceIP}`;
          
          // Store device with timing info
          SYNC_ENGINE.devices.set(deviceId, {
            client: client,
            player: player,
            name: deviceName,
            ip: deviceIP,
            type: 'chromecast',
            isConnected: true,
            lastSyncTime: SYNC_ENGINE.getHighPrecisionTime()
          });
          
          // Measure device latency
          await measureDeviceLatency(deviceId);
          
          // Listen for player status updates
          player.on('status', (status) => {
            if (status.playerState === 'PLAYING' || status.playerState === 'PAUSED') {
              const device = SYNC_ENGINE.devices.get(deviceId);
              if (device) {
                device.lastPosition = status.currentTime;
                device.lastSyncTime = SYNC_ENGINE.getHighPrecisionTime();
              }
            }
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

// Precision media casting with late-join sync
async function castMediaToDevice(deviceId, mediaUrl, metadata, startPosition = 0) {
  try {
    const device = SYNC_ENGINE.devices.get(deviceId);
    if (!device || !device.player) {
      throw new Error(`Device ${deviceId} not connected`);
    }
    
    logger.info(`🎵 Casting to ${device.name}: ${metadata.title} (start at ${startPosition.toFixed(2)}s)`);
    
    const media = {
      contentId: mediaUrl,
      contentType: 'audio/mpeg',
      streamType: 'BUFFERED',
      metadata: {
        type: 0,
        metadataType: 0,
        title: metadata.title,
        subtitle: metadata.artist || '',
        images: metadata.artwork ? [{ url: metadata.artwork }] : []
      }
    };
    
    return new Promise((resolve, reject) => {
      // Load media with autoplay false for precise timing control
      device.player.load(media, { autoplay: false, currentTime: startPosition }, (err, status) => {
        if (err) {
          logger.error(`Failed to load media on ${device.name}: ${err}`);
          reject(err);
          return;
        }
        
        // Start playback with precise timing
        device.player.play((playErr, playStatus) => {
          if (playErr) {
            logger.error(`Failed to start playback on ${device.name}: ${playErr}`);
            reject(playErr);
            return;
          }
          
          logger.success(`🎶 Now playing on ${device.name}: ${metadata.title}`);
          device.lastSyncTime = SYNC_ENGINE.getHighPrecisionTime();
          resolve(playStatus);
        });
      });
    });
  } catch (error) {
    logger.error(`Cast media error: ${error}`);
    throw error;
  }
}

// Multi-room track playback with precision sync
async function playTrackWithPrecisionSync(track, startFromPosition = 0) {
  logger.info(`🎵 Starting precision sync playback: ${track.name}`);
  
  // Update master state
  SYNC_ENGINE.master.currentTrack = track;
  SYNC_ENGINE.master.isPlaying = true;
  SYNC_ENGINE.master.trackStartTime = SYNC_ENGINE.getHighPrecisionTime();
  SYNC_ENGINE.master.pausedAt = startFromPosition;
  
  // Emit cast status update
  io.emit('cast_status_update', {
    playerState: 'playing',
    currentTime: startFromPosition,
    duration: track.duration || 0,
  });
  
  // Emit playback state update for iOS app
  io.emit('update_state', {
    files: musicLibrary,
    queue: SYNC_ENGINE.master.queue || [],
    currentTrackIndex: SYNC_ENGINE.master.queue?.indexOf(track) || 0,
    isPlaying: true,
    currentTrack: track,
  });
  
  const mediaUrl = `http://${SERVER_IP}:${PORT}/stream/track/${encodeURIComponent(track.filename)}`;
  const metadata = {
    title: track.name,
    artist: track.artist || 'Unknown Artist'
  };
  
  // Start casting to all devices with calculated positions
  const castPromises = [];
  SYNC_ENGINE.devices.forEach(async (device, deviceId) => {
    if (device.isConnected) {
      const latency = SYNC_ENGINE.deviceLatency.get(deviceId) || 50;
      
      // Devices with higher latency start slightly earlier to compensate
      const deviceStartPosition = Math.max(0, startFromPosition - (latency / 1000));
      
      castPromises.push(castMediaToDevice(deviceId, mediaUrl, metadata, deviceStartPosition));
    }
  });
  
  try {
    await Promise.all(castPromises);
    logger.success(`▶️  Precision sync started: ${track.name} across ${SYNC_ENGINE.devices.size} devices`);
    
    // Start sync monitoring
    startSyncMonitoring();
    
    // Broadcast to iOS app with device status
    io.emit('playback_update', {
      isPlaying: true,
      currentTrack: track,
      position: startFromPosition,
      devices: Array.from(SYNC_ENGINE.devices.entries()).map(([id, device]) => ({
        id: id,
        name: device.name,
        isConnected: device.isConnected,
        latency: SYNC_ENGINE.deviceLatency.get(id) || 0
      }))
    });
    
  } catch (error) {
    logger.error(`Failed to start precision sync: ${error}`);
    throw error;
  }
}

// Precision pause across all devices
async function pauseAllDevicesWithSync() {
  const pausePosition = getCurrentPosition();
  SYNC_ENGINE.master.isPlaying = false;
  SYNC_ENGINE.master.pausedAt = pausePosition;
  
  // Emit cast status update
  io.emit('cast_status_update', {
    playerState: 'paused',
    currentTime: pausePosition,
  });
  
  // Emit playback state update for iOS app
  io.emit('update_state', {
    files: musicLibrary,
    queue: SYNC_ENGINE.master.queue || [],
    currentTrackIndex: SYNC_ENGINE.master.queue?.indexOf(SYNC_ENGINE.master.currentTrack) || -1,
    isPlaying: false,
    currentTrack: SYNC_ENGINE.master.currentTrack,
  });
  
  const pausePromises = [];
  SYNC_ENGINE.devices.forEach((device, deviceId) => {
    if (device.isConnected) {
      pausePromises.push(new Promise((resolve) => {
        device.player.pause((err, status) => {
          if (err) {
            logger.error(`Failed to pause ${device.name}: ${err}`);
          } else {
            logger.info(`⏸️  Paused ${device.name} at ${pausePosition.toFixed(2)}s`);
          }
          resolve();
        });
      }));
    }
  });
  
  await Promise.all(pausePromises);
  
  // Stop sync monitoring
  if (SYNC_ENGINE.syncMonitor) {
    clearInterval(SYNC_ENGINE.syncMonitor);
    SYNC_ENGINE.syncMonitor = null;
  }
  
  io.emit('playback_update', {
    isPlaying: false,
    currentTrack: SYNC_ENGINE.master.currentTrack,
    position: pausePosition,
    devices: Array.from(SYNC_ENGINE.devices.entries()).map(([id, device]) => ({
      id: id,
      name: device.name,
      isConnected: device.isConnected
    }))
  });
  
  logger.success('⏸️  Precision pause complete');
}

// Precision resume
async function resumeAllDevicesWithSync() {
  const resumePosition = SYNC_ENGINE.master.pausedAt || 0;
  
  // Reset timing
  SYNC_ENGINE.master.isPlaying = true;
  SYNC_ENGINE.master.trackStartTime = SYNC_ENGINE.getHighPrecisionTime();
  
  // Emit cast status update
  io.emit('cast_status_update', {
    playerState: 'playing',
    currentTime: resumePosition,
  });
  
  const resumePromises = [];
  SYNC_ENGINE.devices.forEach((device, deviceId) => {
    if (device.isConnected) {
      resumePromises.push(new Promise((resolve) => {
        device.player.play((err, status) => {
          if (err) {
            logger.error(`Failed to resume ${device.name}: ${err}`);
          } else {
            logger.info(`▶️  Resumed ${device.name} from ${resumePosition.toFixed(2)}s`);
          }
          resolve();
        });
      }));
    }
  });
  
  await Promise.all(resumePromises);
  
  // Restart sync monitoring
  startSyncMonitoring();
  
  io.emit('playback_update', {
    isPlaying: true,
    currentTrack: SYNC_ENGINE.master.currentTrack,
    position: resumePosition,
    devices: Array.from(SYNC_ENGINE.devices.entries()).map(([id, device]) => ({
      id: id,
      name: device.name,
      isConnected: device.isConnected
    }))
  });
  
  logger.success('▶️  Precision resume complete');
}

// Device late-join functionality
async function addDeviceToActivePlayback(deviceId) {
  const device = SYNC_ENGINE.devices.get(deviceId);
  if (!device || !SYNC_ENGINE.master.currentTrack || !SYNC_ENGINE.master.isPlaying) {
    return;
  }
  
  const currentPosition = getCurrentPosition();
  const track = SYNC_ENGINE.master.currentTrack;
  
  logger.info(`🔄 Adding ${device.name} to active playback at ${currentPosition.toFixed(2)}s`);
  
  const mediaUrl = `http://${SERVER_IP}:${PORT}/stream/track/${encodeURIComponent(track.filename)}`;
  const metadata = {
    title: track.name,
    artist: track.artist || 'Unknown Artist'
  };
  
  await castMediaToDevice(deviceId, mediaUrl, metadata, currentPosition);
  
  // Broadcast updated device list
  io.emit('playback_update', {
    isPlaying: true,
    currentTrack: track,
    position: currentPosition,
    devices: Array.from(SYNC_ENGINE.devices.entries()).map(([id, dev]) => ({
      id: id,
      name: dev.name,
      isConnected: dev.isConnected
    }))
  });
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
  logger.info(`🔌 iOS app connected: ${socket.id} from ${clientIP}`);
  
  // Send initial data including music library
  socket.emit('initial_data', {
    files: musicLibrary,
    queue: SYNC_ENGINE.master.queue || [],
    currentTrackIndex: SYNC_ENGINE.master.queue?.indexOf(SYNC_ENGINE.master.currentTrack) || -1,
    isPlaying: SYNC_ENGINE.master.isPlaying || false,
    currentTrack: SYNC_ENGINE.master.currentTrack || null,
  });
  
  // Send current sync state immediately
  const syncData = getMasterSyncData();
  socket.emit('sync_status', {
    ...syncData,
    devices: Array.from(SYNC_ENGINE.devices.entries()).map(([id, device]) => ({
      id: id,
      name: device.name,
      isConnected: device.isConnected,
      latency: SYNC_ENGINE.deviceLatency.get(id) || 0
    }))
  });
  
  // Queue management events
  socket.on('add_to_queue', async (trackFilename) => {
    logger.info(`📝 Adding to queue: ${trackFilename}`);
    const track = musicLibrary.find(t => t.filename === trackFilename);
    if (track) {
      if (!SYNC_ENGINE.master.queue) {
        SYNC_ENGINE.master.queue = [];
      }
      
      const wasEmpty = SYNC_ENGINE.master.queue.length === 0;
      SYNC_ENGINE.master.queue.push(track);
      
      // Broadcast queue update to all clients
      io.emit('queue_updated', SYNC_ENGINE.master.queue);
      logger.success(`✅ Added "${track.name}" to queue (${SYNC_ENGINE.master.queue.length} tracks)`);
      
      // Auto-play if queue was empty (first song added)
      logger.info(`🔍 Checking auto-play: wasEmpty=${wasEmpty}, connectedDevices=${SYNC_ENGINE.devices.size}`);
      if (wasEmpty && SYNC_ENGINE.devices.size > 0) {
        logger.info(`🎵 Auto-playing first track: ${track.name}`);
        await playTrackWithPrecisionSync(track, 0);
      } else if (wasEmpty) {
        logger.warn(`⚠️ No cast devices connected for auto-play. Connect to LOFT TV or STUDIO TV first.`);
      }
    } else {
      logger.warn(`❌ Track not found: ${trackFilename}`);
    }
  });

  socket.on('play', async () => {
    logger.info(`▶️ Play requested`);
    if (SYNC_ENGINE.master.queue && SYNC_ENGINE.master.queue.length > 0) {
      if (!SYNC_ENGINE.master.currentTrack) {
        // Start playing first track
        await playTrackWithPrecisionSync(SYNC_ENGINE.master.queue[0], 0);
      } else {
        // Resume current track
        await resumeAllDevicesWithSync();
      }
    } else {
      logger.warn(`❌ No tracks in queue to play`);
    }
  });

  socket.on('pause', async () => {
    logger.info(`⏸️ Pause requested`);
    await pauseAllDevicesWithSync();
  });

  socket.on('next', async () => {
    logger.info(`⏭️ Next track requested`);
    if (SYNC_ENGINE.master.queue && SYNC_ENGINE.master.queue.length > 0) {
      const currentIndex = SYNC_ENGINE.master.queue.indexOf(SYNC_ENGINE.master.currentTrack);
      const nextIndex = currentIndex + 1;
      if (nextIndex < SYNC_ENGINE.master.queue.length) {
        await playTrackWithPrecisionSync(SYNC_ENGINE.master.queue[nextIndex], 0);
      } else {
        logger.warn(`❌ No next track available`);
      }
    }
  });

  socket.on('previous', async () => {
    logger.info(`⏮️ Previous track requested`);
    if (SYNC_ENGINE.master.queue && SYNC_ENGINE.master.queue.length > 0) {
      const currentIndex = SYNC_ENGINE.master.queue.indexOf(SYNC_ENGINE.master.currentTrack);
      const prevIndex = currentIndex - 1;
      if (prevIndex >= 0) {
        await playTrackWithPrecisionSync(SYNC_ENGINE.master.queue[prevIndex], 0);
      } else {
        logger.warn(`❌ No previous track available`);
      }
    }
  });

  socket.on('play_pause', async () => {
    logger.info(`⏯️ Toggle play/pause requested`);
    if (SYNC_ENGINE.master.isPlaying) {
      await pauseAllDevicesWithSync();
    } else if (SYNC_ENGINE.master.queue && SYNC_ENGINE.master.queue.length > 0) {
      if (!SYNC_ENGINE.master.currentTrack) {
        await playTrackWithPrecisionSync(SYNC_ENGINE.master.queue[0], 0);
      } else {
        await resumeAllDevicesWithSync();
      }
    }
  });

  socket.on('next_track', async () => {
    logger.info(`⏭️ Next track requested`);
    if (SYNC_ENGINE.master.queue && SYNC_ENGINE.master.queue.length > 0) {
      const currentIndex = SYNC_ENGINE.master.queue.indexOf(SYNC_ENGINE.master.currentTrack);
      const nextIndex = currentIndex + 1;
      if (nextIndex < SYNC_ENGINE.master.queue.length) {
        await playTrackWithPrecisionSync(SYNC_ENGINE.master.queue[nextIndex], 0);
      } else {
        logger.warn(`❌ No next track available`);
      }
    }
  });

  socket.on('previous_track', async () => {
    logger.info(`⏮️ Previous track requested`);
    if (SYNC_ENGINE.master.queue && SYNC_ENGINE.master.queue.length > 0) {
      const currentIndex = SYNC_ENGINE.master.queue.indexOf(SYNC_ENGINE.master.currentTrack);
      const prevIndex = currentIndex - 1;
      if (prevIndex >= 0) {
        await playTrackWithPrecisionSync(SYNC_ENGINE.master.queue[prevIndex], 0);
      } else {
        logger.warn(`❌ No previous track available`);
      }
    }
  });

  socket.on('skip_to_track', async (index) => {
    logger.info(`⏭️ Skip to track ${index} requested`);
    if (SYNC_ENGINE.master.queue && SYNC_ENGINE.master.queue[index]) {
      await playTrackWithPrecisionSync(SYNC_ENGINE.master.queue[index], 0);
    } else {
      logger.warn(`❌ Track at index ${index} not found`);
    }
  });

  socket.on('seek', async (position) => {
    logger.info(`⏩ Seek to ${position}s requested`);
    if (SYNC_ENGINE.master.currentTrack) {
      await playTrackWithPrecisionSync(SYNC_ENGINE.master.currentTrack, position);
    }
  });

  socket.on('refresh_library', () => {
    logger.info(`🔄 Library refresh requested`);
    initializeMusicLibrary();
    socket.emit('initial_data', {
      files: musicLibrary,
      queue: SYNC_ENGINE.master.queue || [],
      currentTrackIndex: SYNC_ENGINE.master.queue?.indexOf(SYNC_ENGINE.master.currentTrack) || -1,
      isPlaying: SYNC_ENGINE.master.isPlaying || false,
      currentTrack: SYNC_ENGINE.master.currentTrack || null,
    });
  });

  socket.on('disconnect', () => {
    logger.info(`🔌 iOS app disconnected: ${socket.id}`);
  });
});

// REST API Endpoints
app.use(express.json());

// Music library
app.get('/api/library', (req, res) => {
  res.json(musicLibrary);
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

// Cast device connection with late-join support
app.post('/api/cast/connect', async (req, res) => {
  try {
    const { deviceIP, deviceName, deviceType } = req.body;
    
    const result = await connectToCastDevice(deviceIP, deviceName);
    
    logger.success(`📺 Cast device connected: ${deviceName} (${deviceIP})`);
    
    // If there's active playback, add this device to it
    if (SYNC_ENGINE.master.isPlaying && SYNC_ENGINE.master.currentTrack) {
      await addDeviceToActivePlayback(result.deviceId);
    }
    
    // Auto-play if there are songs in queue but nothing is playing
    if (SYNC_ENGINE.master.queue && SYNC_ENGINE.master.queue.length > 0 && !SYNC_ENGINE.master.isPlaying) {
      logger.info(`🎵 Auto-playing queued track on new device: ${SYNC_ENGINE.master.queue[0].name}`);
      await playTrackWithPrecisionSync(SYNC_ENGINE.master.queue[0], 0);
    }
    
    // Broadcast device connection to all clients
    io.emit('device_connected', {
      deviceId: result.deviceId,
      deviceName: deviceName,
      deviceIP: deviceIP,
      devices: Array.from(SYNC_ENGINE.devices.entries()).map(([id, device]) => ({
        id: id,
        name: device.name,
        isConnected: device.isConnected,
        latency: SYNC_ENGINE.deviceLatency.get(id) || 0
      }))
    });
    
    res.json({ success: true, deviceId: result.deviceId });
  } catch (error) {
    logger.error(`Failed to connect to cast device: ${error}`);
    res.status(500).json({ error: error.message });
  }
});

// Cast device disconnection
app.post('/api/cast/disconnect', async (req, res) => {
  try {
    const { deviceIP } = req.body;
    
    // Find and disconnect the device
    const deviceEntry = Array.from(SYNC_ENGINE.devices.entries()).find(([id, device]) => device.ip === deviceIP);
    
    if (deviceEntry) {
      const [deviceId, device] = deviceEntry;
      
      // Close the cast client connection
      if (device.client) {
        device.client.close();
      }
      
      // Remove from devices map
      SYNC_ENGINE.devices.delete(deviceId);
      
      logger.success(`📺 Cast device disconnected: ${device.name} (${deviceIP})`);
      
      // Broadcast device disconnection to all clients
      io.emit('device_disconnected', {
        deviceId: deviceId,
        deviceName: device.name,
        deviceIP: deviceIP,
        devices: Array.from(SYNC_ENGINE.devices.entries()).map(([id, device]) => ({
          id: id,
          name: device.name,
          isConnected: device.isConnected,
          latency: SYNC_ENGINE.deviceLatency.get(id) || 0
        }))
      });
      
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Device not found or not connected' });
    }
  } catch (error) {
    logger.error(`Failed to disconnect cast device: ${error}`);
    res.status(500).json({ error: error.message });
  }
});

// Precision multi-room casting
app.post('/api/cast/media', async (req, res) => {
  try {
    const { trackFilename, metadata } = req.body;
    
    const track = musicLibrary.find(t => t.filename === trackFilename);
    if (!track) {
      return res.status(404).json({ error: 'Track not found' });
    }
    
    await playTrackWithPrecisionSync(track, 0);
    
    res.json({ success: true });
  } catch (error) {
    logger.error(`Failed to cast media: ${error}`);
    res.status(500).json({ error: error.message });
  }
});

// Precision playback controls
app.post('/api/play', async (req, res) => {
  try {
    if (SYNC_ENGINE.master.currentTrack && !SYNC_ENGINE.master.isPlaying) {
      await resumeAllDevicesWithSync();
    } else if (SYNC_ENGINE.master.queue.length > 0) {
      await playTrackWithPrecisionSync(SYNC_ENGINE.master.queue[0], 0);
    } else {
      return res.status(400).json({ error: 'No track available to play' });
    }
    
    res.json({ success: true, isPlaying: true });
  } catch (error) {
    logger.error(`Play error: ${error}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/pause', async (req, res) => {
  try {
    await pauseAllDevicesWithSync();
    res.json({ success: true, isPlaying: false });
  } catch (error) {
    logger.error(`Pause error: ${error}`);
    res.status(500).json({ error: error.message });
  }
});

// Audio streaming endpoint
app.get('/stream/track/:filename', (req, res) => {
  const filename = decodeURIComponent(req.params.filename);
  const filePath = path.join(MUSIC_DIR, filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Track not found' });
  }
  
  logger.info(`🎵 Streaming ${filename} to cast device`);
  
  res.set({
    'Content-Type': 'audio/mpeg',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  
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
  
  req.on('close', () => {
    ffmpeg.kill('SIGTERM');
  });
});

// File upload with proper error handling
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(MUSIC_DIR)) {
      fs.mkdirSync(MUSIC_DIR, { recursive: true });
    }
    cb(null, MUSIC_DIR);
  },
  filename: (req, file, cb) => {
    // Ensure clean filename
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9._\-\s]/g, '');
    cb(null, cleanName);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /\.(mp3|wav|flac|m4a)$/i;
    if (allowedTypes.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  }
});

app.post('/api/upload', (req, res) => {
  logger.info(`📤 Upload request received from ${req.ip}`);
  logger.info(`📤 Content-Type: ${req.headers['content-type']}`);
  logger.info(`📤 Content-Length: ${req.headers['content-length']}`);
  
  upload.single('musicFile')(req, res, (err) => {
    if (err) {
      logger.error(`❌ Multer error: ${err.message}`);
      return res.status(400).json({ error: err.message });
    }
    
    try {
      logger.info(`📤 After multer processing - req.file exists: ${!!req.file}`);
      logger.info(`📤 Request body keys: ${Object.keys(req.body)}`);
      
      if (!req.file) {
        logger.warn(`❌ Upload failed: No file provided`);
        logger.warn(`📤 Request files object: ${JSON.stringify(req.files)}`);
        logger.warn(`📤 Request body: ${JSON.stringify(req.body)}`);
        return res.status(400).json({ error: 'No valid audio file uploaded' });
      }
    
    logger.success(`📁 File uploaded: ${req.file.originalname} (${req.file.size} bytes)`);
    
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
});

// Error handler for multer
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large (max 100MB)' });
    }
  }
  
  logger.error(`Server error: ${error.message}`);
  res.status(500).json({ error: error.message });
});

// Serve static files
// Streaming API Endpoints
app.post('/api/streaming/apple-music/search', async (req, res) => {
  try {
    const { query, limit = 25 } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query parameter required' });
    }

    logger.info(`🍎 Apple Music search: "${query}"`);
    const tracks = await streamingIntegration.searchAppleMusic(query, limit);
    
    logger.info(`✅ Found ${tracks.length} Apple Music tracks`);
    res.json(tracks);
  } catch (error) {
    logger.error(`Apple Music search error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/streaming/soundcloud/search', async (req, res) => {
  try {
    const { query, limit = 25 } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query parameter required' });
    }

    logger.info(`☁️ SoundCloud search: "${query}"`);
    const tracks = await streamingIntegration.searchSoundCloud(query, limit);
    
    logger.info(`✅ Found ${tracks.length} SoundCloud tracks`);
    res.json(tracks);
  } catch (error) {
    logger.error(`SoundCloud search error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/streaming/status', (req, res) => {
  try {
    const status = streamingIntegration.getStatus();
    res.json({
      services: status,
      timestamp: Date.now(),
      server: 'Multi-Room Music v1.0.0'
    });
  } catch (error) {
    logger.error(`Streaming status error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/streaming/:service/:trackId/stream', async (req, res) => {
  try {
    const { service, trackId } = req.params;
    
    if (!['apple-music', 'soundcloud'].includes(service)) {
      return res.status(400).json({ error: 'Invalid streaming service' });
    }

    logger.info(`🎵 Getting streaming URL for ${service}:${trackId}`);
    const streamingUrl = await streamingIntegration.getStreamingUrl(trackId, service);
    
    if (!streamingUrl) {
      return res.status(404).json({ error: 'Streaming URL not available' });
    }

    // For Apple Music and SoundCloud, we proxy the stream
    if (streamingUrl.startsWith('http')) {
      const fetch = require('node-fetch');
      const streamResponse = await fetch(streamingUrl);
      
      if (!streamResponse.ok) {
        return res.status(streamResponse.status).json({ error: 'Stream unavailable' });
      }

      res.set({
        'Content-Type': 'audio/mpeg',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600'
      });

      streamResponse.body.pipe(res);
    } else {
      res.json({ streamUrl: streamingUrl });
    }
  } catch (error) {
    logger.error(`Streaming URL error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

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
    logger.success(`🎵 Precision Sync Music Server running on port ${PORT}`);
    logger.info(`Configuration: {
  musicDir: '${MUSIC_DIR}',
  fileCount: ${musicLibrary.length},
  serverIP: '${SERVER_IP}',
  syncMode: 'Precision Multi-Room Sync'
}`);
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('🛑 Shutting down server...');
  
  // Stop sync monitoring
  if (SYNC_ENGINE.syncMonitor) {
    clearInterval(SYNC_ENGINE.syncMonitor);
  }
  
  // Disconnect all cast devices
  SYNC_ENGINE.devices.forEach((device, deviceId) => {
    if (device.client) {
      device.client.close();
    }
  });
  
  server.close(() => {
    logger.info('✅ Server shut down complete');
    process.exit(0);
  });
});

startServer();