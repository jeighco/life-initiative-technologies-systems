const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { spawn } = require('child_process');
const WebSocket = require('ws');

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
const SNAPCAST_FIFO = '/tmp/snapfifo';
const FFMPEG_PATH = '/opt/homebrew/bin/ffmpeg';

// Snapcast server configuration
const SNAPCAST_HOST = 'localhost';
const SNAPCAST_PORT = 1705;

// Enhanced Latency Compensation and Intelligent Sync System
const AUDIO_DELAYS = {
  snapcast: 0,      // Reference timing (no delay)
  chromecast: 50,   // Chromecast network delay (auto-adjustable)
  bluetooth: 250    // Bluetooth latency compensation (auto-adjustable)
};

// Active zones configuration
let activeZones = {
  snapcast: true,
  chromecast: false,
  bluetooth: false
};

// Intelligent Sync System
const syncSystem = {
  // Sync quality tracking
  syncQuality: {
    snapcast: { accuracy: 100, jitter: 0, lastUpdate: Date.now() },
    chromecast: { accuracy: 85, jitter: 15, lastUpdate: Date.now() },
    bluetooth: { accuracy: 70, jitter: 25, lastUpdate: Date.now() }
  },
  
  // Auto-detected latencies based on device responses
  detectedLatencies: {
    snapcast: { min: 0, max: 5, average: 2, samples: [] },
    chromecast: { min: 30, max: 120, average: 75, samples: [] },
    bluetooth: { min: 150, max: 400, average: 275, samples: [] }
  },
  
  // Network conditions
  networkConditions: {
    avgRtt: 0,           // Average round-trip time
    packetLoss: 0,       // Packet loss percentage
    bandwidth: 'unknown', // Available bandwidth
    stability: 'good'    // Connection stability rating
  },
  
  // Sync events for monitoring
  syncEvents: [],
  
  // Configuration
  maxSamples: 50,
  syncToleranceMs: 10,  // Acceptable sync variance
  calibrationInterval: 30000, // Auto-calibration every 30 seconds
  
  // Learning system for device-specific optimizations
  deviceProfiles: {
    'STUDIO TV': { 
      avgLatency: 65, 
      reliability: 0.9, 
      preferredBufferSize: '256k',
      syncHistory: []
    },
    'LOFT TV': { 
      avgLatency: 58, 
      reliability: 0.85, 
      preferredBufferSize: '192k',
      syncHistory: []
    },
    'default': { 
      avgLatency: 60, 
      reliability: 0.8, 
      preferredBufferSize: '128k',
      syncHistory: []
    }
  }
};

// Real-time sync monitoring
let syncMonitoringActive = false;
let syncCalibrationTimer = null;

// Connected Cast devices tracking for sync system
let connectedCastDevices = {};

// State management
let musicFiles = [];
let queue = [];
let currentTrackIndex = -1;
let isPlaying = false;
let audioStreamProcess = null;
let httpAudioProcess = null;
let silenceStreamProcess = null;
let isTransitioning = false;
let httpStreamClients = []; // Track HTTP streaming clients

// Snapcast state management
let snapcastWs = null;
let snapcastStatus = null;
let snapcastClients = [];
let snapcastGroups = [];
let snapcastConnected = false;
let snapcastReconnectTimer = null;

// Unicode sanitization utility
const sanitizeUnicode = (str) => {
  if (typeof str !== 'string') return str;
  
  try {
    // Replace invalid Unicode sequences and unpaired surrogates
    return str
      .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '') // Remove unpaired high surrogates
      .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '') // Remove unpaired low surrogates
      .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, '') // Remove control characters
      .replace(/\uFEFF/g, '') // Remove BOM
      .normalize('NFC'); // Normalize to canonical form
  } catch (error) {
    // If normalization fails, fall back to basic cleanup
    return str.replace(/[\uD800-\uDFFF]/g, '').replace(/[\u0000-\u001F\u007F]/g, '');
  }
};

// Recursively sanitize all strings in an object
const sanitizeObject = (obj) => {
  if (typeof obj === 'string') {
    return sanitizeUnicode(obj);
  } else if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  } else if (obj !== null && typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[sanitizeUnicode(key)] = sanitizeObject(value);
    }
    return sanitized;
  }
  return obj;
};

// Intelligent Sync Management Functions
const measureDeviceLatency = async (deviceType, deviceName = 'default') => {
  const startTime = Date.now();
  
  try {
    let latency = 0;
    
    if (deviceType === 'chromecast') {
      // Ping test to Chromecast device IP if available
      const device = Object.values(connectedCastDevices).find(d => d.name === deviceName);
      if (device && device.ip) {
        latency = await pingDevice(device.ip);
      } else {
        latency = 65; // Fallback average
      }
    } else if (deviceType === 'snapcast') {
      // Snapcast latency is minimal (direct connection)
      latency = 2;
    } else if (deviceType === 'bluetooth') {
      // Bluetooth has inherent latency
      latency = Math.random() * 50 + 200; // 200-250ms typical range
    }
    
    // Record measurement
    recordLatencyMeasurement(deviceType, latency, deviceName);
    
    return Math.round(latency);
  } catch (error) {
    logger.warn(`Latency measurement failed for ${deviceType}:`, error.message);
    return AUDIO_DELAYS[deviceType] || 50;
  }
};

const pingDevice = async (ip) => {
  return new Promise((resolve) => {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    
    fetch(`http://${ip}:8008/setup/eureka_info`, { 
      signal: controller.signal,
      method: 'GET'
    })
    .then(() => {
      clearTimeout(timeout);
      resolve(Date.now() - start);
    })
    .catch(() => {
      clearTimeout(timeout);
      resolve(75); // Default if ping fails
    });
  });
};

const recordLatencyMeasurement = (deviceType, latency, deviceName = 'default') => {
  const detected = syncSystem.detectedLatencies[deviceType];
  if (!detected) return;
  
  // Add to samples
  detected.samples.push(latency);
  if (detected.samples.length > syncSystem.maxSamples) {
    detected.samples.shift();
  }
  
  // Update statistics
  detected.min = Math.min(detected.min, latency);
  detected.max = Math.max(detected.max, latency);
  detected.average = detected.samples.reduce((a, b) => a + b, 0) / detected.samples.length;
  
  // Update device profile
  const profile = syncSystem.deviceProfiles[deviceName] || syncSystem.deviceProfiles['default'];
  profile.avgLatency = detected.average;
  profile.syncHistory.push({
    timestamp: Date.now(),
    latency: latency,
    measurement: 'ping'
  });
  
  // Keep only recent history
  if (profile.syncHistory.length > 100) {
    profile.syncHistory = profile.syncHistory.slice(-50);
  }
  
  logger.info(`📊 Latency updated for ${deviceType} (${deviceName}): ${Math.round(latency)}ms (avg: ${Math.round(detected.average)}ms)`);
};

const calculateOptimalDelay = (deviceType, deviceName = 'default') => {
  const profile = syncSystem.deviceProfiles[deviceName] || syncSystem.deviceProfiles['default'];
  const detected = syncSystem.detectedLatencies[deviceType];
  const quality = syncSystem.syncQuality[deviceType];
  
  if (!detected || !quality) {
    return AUDIO_DELAYS[deviceType] || 50;
  }
  
  // Base delay on detected average latency
  let optimalDelay = detected.average;
  
  // Adjust based on network conditions
  if (syncSystem.networkConditions.stability === 'poor') {
    optimalDelay += 20; // Add buffer for unstable connections
  } else if (syncSystem.networkConditions.stability === 'excellent') {
    optimalDelay = Math.max(optimalDelay - 10, 0); // Reduce for stable connections
  }
  
  // Adjust based on jitter
  if (quality.jitter > 20) {
    optimalDelay += Math.min(quality.jitter / 2, 30);
  }
  
  // Device-specific adjustments
  if (deviceType === 'chromecast') {
    // Account for Chromecast buffering
    optimalDelay += 15;
  } else if (deviceType === 'bluetooth') {
    // Bluetooth needs extra buffer
    optimalDelay += 25;
  }
  
  return Math.round(Math.max(optimalDelay, 0));
};

const updateSyncQuality = (zone, latency) => {
  const quality = syncSystem.syncQuality[zone];
  if (!quality) return;
  
  const currentTime = Date.now();
  const timeSinceLastUpdate = currentTime - quality.lastUpdate;
  
  // Calculate jitter (variation in latency)
  if (quality.lastLatency !== undefined) {
    const jitter = Math.abs(latency - quality.lastLatency);
    quality.jitter = Math.round((quality.jitter * 0.8) + (jitter * 0.2)); // Exponential smoothing
  }
  
  // Calculate accuracy based on consistency
  const targetLatency = AUDIO_DELAYS[zone] || 50;
  const deviation = Math.abs(latency - targetLatency);
  const newAccuracy = Math.max(0, Math.min(100, 100 - (deviation * 2)));
  
  quality.accuracy = Math.round((quality.accuracy * 0.9) + (newAccuracy * 0.1));
  quality.lastUpdate = currentTime;
  quality.lastLatency = latency;
  
  // Record sync event
  recordSyncEvent('quality_update', zone, {
    latency: latency,
    accuracy: quality.accuracy,
    jitter: quality.jitter
  });
  
  // Auto-adjust delays if quality is poor
  if (quality.accuracy < 60 || quality.jitter > 50) {
    const newDelay = calculateOptimalDelay(zone);
    if (Math.abs(newDelay - AUDIO_DELAYS[zone]) > 5) {
      AUDIO_DELAYS[zone] = newDelay;
      logger.info(`🔧 Auto-adjusted ${zone} delay: ${newDelay}ms (accuracy: ${quality.accuracy}%, jitter: ${quality.jitter}ms)`);
      
      // Notify clients of automatic adjustment
      io.emit('latencyUpdate', sanitizeObject({ 
        delays: AUDIO_DELAYS, 
        activeZones,
        autoAdjusted: zone,
        reason: quality.accuracy < 60 ? 'poor_accuracy' : 'high_jitter'
      }));
    }
  }
};

const autoCalibrateSyncSystem = async () => {
  if (!syncMonitoringActive) return;
  
  logger.info('🎯 Starting automatic sync calibration...');
  
  try {
    // Measure latencies for active zones
    const measurements = {};
    
    for (const [zone, isActive] of Object.entries(activeZones)) {
      if (isActive && zone !== 'snapcast') {
        measurements[zone] = await measureDeviceLatency(zone);
      }
    }
    
    // Update delays based on measurements
    let updated = false;
    for (const [zone, measuredLatency] of Object.entries(measurements)) {
      const optimalDelay = calculateOptimalDelay(zone);
      const currentDelay = AUDIO_DELAYS[zone];
      
      if (Math.abs(optimalDelay - currentDelay) > syncSystem.syncToleranceMs) {
        AUDIO_DELAYS[zone] = optimalDelay;
        updated = true;
        logger.info(`🎯 Auto-adjusted ${zone} delay: ${currentDelay}ms → ${optimalDelay}ms`);
      }
    }
    
    // Broadcast updates if changes were made
    if (updated) {
      io.emit('latencyUpdate', sanitizeObject({ 
        delays: AUDIO_DELAYS, 
        activeZones,
        syncQuality: syncSystem.syncQuality,
        autoCalibrated: true
      }));
      
      logger.info('🎯 Sync calibration complete - delays optimized');
    }
    
    // Update network conditions assessment
    assessNetworkConditions();
    
  } catch (error) {
    logger.error('Sync calibration error:', error);
  }
};

const assessNetworkConditions = () => {
  // Simple network assessment based on device responses
  const allSamples = Object.values(syncSystem.detectedLatencies)
    .flatMap(d => d.samples)
    .filter(s => s > 0);
  
  if (allSamples.length > 0) {
    const avgLatency = allSamples.reduce((a, b) => a + b, 0) / allSamples.length;
    const variance = allSamples.reduce((sum, val) => sum + Math.pow(val - avgLatency, 2), 0) / allSamples.length;
    const stdDev = Math.sqrt(variance);
    
    syncSystem.networkConditions.avgRtt = Math.round(avgLatency);
    
    // Assess stability based on variance
    if (stdDev < 10) {
      syncSystem.networkConditions.stability = 'excellent';
    } else if (stdDev < 25) {
      syncSystem.networkConditions.stability = 'good';
    } else if (stdDev < 50) {
      syncSystem.networkConditions.stability = 'fair';
    } else {
      syncSystem.networkConditions.stability = 'poor';
    }
    
    logger.info(`📊 Network assessment: ${avgLatency}ms avg, ${Math.round(stdDev)}ms jitter, ${syncSystem.networkConditions.stability} stability`);
  }
};

const startSyncMonitoring = () => {
  if (syncMonitoringActive) return;
  
  syncMonitoringActive = true;
  logger.info('🎯 Starting intelligent sync monitoring');
  
  // Initial calibration
  setTimeout(() => autoCalibrateSyncSystem(), 5000);
  
  // Periodic calibration
  syncCalibrationTimer = setInterval(() => {
    autoCalibrateSyncSystem();
  }, syncSystem.calibrationInterval);
  
  // Monitor sync events
  setInterval(() => {
    updateSyncQualityMetrics();
  }, 10000); // Every 10 seconds
};

const stopSyncMonitoring = () => {
  if (!syncMonitoringActive) return;
  
  syncMonitoringActive = false;
  logger.info('🎯 Stopping sync monitoring');
  
  if (syncCalibrationTimer) {
    clearInterval(syncCalibrationTimer);
    syncCalibrationTimer = null;
  }
};

const updateSyncQualityMetrics = () => {
  // Update quality metrics based on active zones
  Object.keys(activeZones).forEach(zone => {
    if (activeZones[zone] && syncSystem.syncQuality[zone]) {
      const quality = syncSystem.syncQuality[zone];
      const detected = syncSystem.detectedLatencies[zone];
      
      if (detected && detected.samples.length > 0) {
        // Calculate jitter from recent samples
        const recentSamples = detected.samples.slice(-10);
        const avgRecent = recentSamples.reduce((a, b) => a + b, 0) / recentSamples.length;
        const jitter = recentSamples.reduce((sum, val) => sum + Math.abs(val - avgRecent), 0) / recentSamples.length;
        
        quality.jitter = Math.round(jitter);
        quality.accuracy = Math.max(100 - jitter * 2, 50); // Convert jitter to accuracy score
        quality.lastUpdate = Date.now();
      }
    }
  });
};

// Intelligent Sync Helper Functions
const getIntelligentBufferSize = () => {
  const stability = syncSystem.networkConditions.stability;
  const activeZoneCount = Object.values(activeZones).filter(Boolean).length;
  
  // Base buffer size on network conditions and active zones
  if (stability === 'poor' || activeZoneCount > 2) {
    return '512k'; // Large buffer for unstable networks or many zones
  } else if (stability === 'fair') {
    return '256k'; // Medium buffer for fair conditions
  } else if (stability === 'excellent' && activeZoneCount === 1) {
    return '64k';  // Small buffer for optimal conditions
  } else {
    return '128k'; // Default balanced buffer
  }
};

const getAudioFilterChain = () => {
  const filters = ['aresample=async=1'];
  
  // Add intelligent delay compensation for multi-zone sync
  const activeZoneDelays = Object.entries(activeZones)
    .filter(([zone, active]) => active && zone !== 'snapcast')
    .map(([zone]) => AUDIO_DELAYS[zone] || 0);
  
  if (activeZoneDelays.length > 0) {
    const maxDelay = Math.max(...activeZoneDelays);
    if (maxDelay > 0) {
      // Add slight pre-compensation to account for processing delays
      const precompDelay = Math.min(maxDelay * 0.1, 5);
      filters.push(`adelay=${Math.round(precompDelay)}|${Math.round(precompDelay)}`);
    }
  }
  
  // Add volume normalization if network is unstable
  if (syncSystem.networkConditions.stability === 'poor') {
    filters.push('dynaudnorm=p=0.9:s=5');
  }
  
  return filters.join(',');
};

const recordSyncEvent = (eventType, zone, data = {}) => {
  const event = {
    timestamp: Date.now(),
    type: eventType,
    zone: zone,
    data: data
  };
  
  syncSystem.syncEvents.push(event);
  
  // Keep only recent events
  if (syncSystem.syncEvents.length > 1000) {
    syncSystem.syncEvents = syncSystem.syncEvents.slice(-500);
  }
  
  // Update device-specific metrics
  if (zone && syncSystem.deviceProfiles[zone]) {
    const profile = syncSystem.deviceProfiles[zone];
    profile.syncHistory.push({
      timestamp: Date.now(),
      event: eventType,
      data: data
    });
  }
};

// Safe JSON.stringify wrapper that sanitizes Unicode
const safeJsonStringify = (obj, replacer, space) => {
  try {
    const sanitized = sanitizeObject(obj);
    return JSON.stringify(sanitized, replacer, space);
  } catch (error) {
    logger.error('JSON stringify error, attempting fallback:', error.message);
    // Fallback: convert to string and sanitize
    const fallback = sanitizeUnicode(String(obj));
    return JSON.stringify({ error: 'Invalid data', fallback }, replacer, space);
  }
};

// Enhanced logging
const logger = {
  info: (message, ...args) => console.log(`[${new Date().toISOString()}] ℹ️  ${message}`, ...args),
  success: (message, ...args) => console.log(`[${new Date().toISOString()}] ✅ ${message}`, ...args),
  warn: (message, ...args) => console.log(`[${new Date().toISOString()}] ⚠️  ${message}`, ...args),
  error: (message, ...args) => console.error(`[${new Date().toISOString()}] ❌ ${message}`, ...args)
};

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, MUSIC_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});
const upload = multer({ storage });

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'client/build')));

// Safe response wrapper
const safeJsonResponse = (res, data, status = 200) => {
  try {
    const sanitizedData = sanitizeObject(data);
    res.status(status).json(sanitizedData);
  } catch (error) {
    logger.error('Response JSON error:', error.message);
    res.status(500).json({ error: 'Invalid response data' });
  }
};

// Safe Socket.IO emission wrapper
const safeEmit = (socket, event, data) => {
  try {
    const sanitizedData = sanitizeObject(data);
    socket.emit(event, sanitizedData);
  } catch (error) {
    logger.error(`Socket emission error for event '${event}':`, error.message);
    socket.emit('error', { message: 'Invalid data transmission' });
  }
};

// Load music files
const loadMusicFiles = () => {
  try {
    if (!fs.existsSync(MUSIC_DIR)) {
      fs.mkdirSync(MUSIC_DIR, { recursive: true });
    }
    
    const files = fs.readdirSync(MUSIC_DIR)
      .filter(file => ['.mp3', '.wav', '.flac', '.m4a'].includes(path.extname(file).toLowerCase()))
      .map(file => ({
        id: sanitizeUnicode(file),
        name: sanitizeUnicode(path.parse(file).name),
        path: path.join(MUSIC_DIR, file),
        filename: file // Keep original filename for file operations
      }));
    
    musicFiles = files;
    logger.info(`Found ${files.length} music files`);
    return files;
  } catch (error) {
    logger.error('Error loading music files:', error);
    return [];
  }
};

// Enhanced silence stream management
const startSilenceStream = () => {
  if (silenceStreamProcess && !silenceStreamProcess.killed) {
    return; // Already running
  }

  logger.info('🔇 Starting continuous silence stream to keep FIFO active');

  try {
    // Use sub-audible 20Hz tone at 0.1% volume
    silenceStreamProcess = spawn(FFMPEG_PATH, [
      '-f', 'lavfi',
      '-i', 'sine=frequency=20:sample_rate=48000:duration=0',
      '-af', 'volume=0.001',  // Make it extremely quiet (0.1% volume)
      '-f', 's16le',
      '-ar', '48000',
      '-ac', '2',
      '-y',  // Auto-overwrite without prompting
      SNAPCAST_FIFO
    ], {
      stdio: ['ignore', 'pipe', 'pipe']  // Pipe both stdout and stderr for debugging
    });

    // Handle process events
    silenceStreamProcess.on('spawn', () => {
      logger.success('✅ Silence stream process spawned successfully');
      
      // Check if process is actually running after a short delay
      setTimeout(() => {
        if (silenceStreamProcess && !silenceStreamProcess.killed) {
          logger.info('🔍 Silence stream still running after 2 seconds');
        } else {
          logger.error('❌ Silence stream died within 2 seconds');
        }
      }, 2000);
    });

    silenceStreamProcess.on('error', (error) => {
      logger.error('❌ Silence stream spawn error:', error.message);
      silenceStreamProcess = null;
      // Restart after 3 seconds
      setTimeout(startSilenceStream, 3000);
    });

    silenceStreamProcess.on('exit', (code, signal) => {
      if (code !== null) {
        logger.warn(`⚠️  Silence stream exited with code ${code}`);
      }
      if (signal) {
        logger.warn(`⚠️  Silence stream killed with signal ${signal}`);
      }
      silenceStreamProcess = null;
      
      // Only restart if it wasn't intentionally killed AND no music is playing
      if (signal !== 'SIGTERM' && signal !== 'SIGKILL' && !audioStreamProcess) {
        logger.info('🔄 Restarting silence stream in 3 seconds...');
        setTimeout(startSilenceStream, 3000);
      } else if (audioStreamProcess) {
        logger.info('🎵 Music is playing - silence stream will not restart');
      }
    });

    // Monitor stdout for FFmpeg output
    if (silenceStreamProcess.stdout) {
      silenceStreamProcess.stdout.on('data', (data) => {
        // Only log if there are actual errors, not normal output
        const output = data.toString();
        if (output.includes('Error') || output.includes('Failed')) {
          logger.info('FFmpeg stdout:', output.trim());
        }
      });
    }

    // Monitor stderr for FFmpeg errors and normal output
    if (silenceStreamProcess.stderr) {
      silenceStreamProcess.stderr.on('data', (data) => {
        const output = data.toString().trim();
        
        // Log specific errors
        if (output.includes('Error') || output.includes('Failed') || output.includes('Broken pipe')) {
          logger.error('❌ FFmpeg silence error:', output);
        }
      });
    }

    logger.success('🎵 Silence stream started - Snapcast should stay active');

  } catch (error) {
    logger.error('❌ Failed to start silence stream:', error.message);
    silenceStreamProcess = null;
    setTimeout(startSilenceStream, 5000);
  }
};

// Enhanced stopSilenceStream function
const stopSilenceStream = () => {
  if (silenceStreamProcess && !silenceStreamProcess.killed) {
    logger.info('🛑 Stopping silence stream');
    
    try {
      // Try graceful termination first
      silenceStreamProcess.kill('SIGTERM');
      
      // Force kill after 2 seconds if still running
      setTimeout(() => {
        if (silenceStreamProcess && !silenceStreamProcess.killed) {
          logger.warn('🔨 Force killing silence stream');
          silenceStreamProcess.kill('SIGKILL');
        }
      }, 2000);
      
    } catch (error) {
      logger.error('Error stopping silence stream:', error.message);
    }
    
    silenceStreamProcess = null;
  }
};

// Enhanced audio stream management with HTTP streaming
const startAudioStream = (audioSource, track = null) => {
  return new Promise((resolve, reject) => {
    // Stop silence stream when starting music
    stopSilenceStream();
    
    // Small delay to ensure silence stream stops cleanly
    setTimeout(() => {
      // Stop any existing audio streams
      if (audioStreamProcess && !audioStreamProcess.killed) {
        audioStreamProcess.kill('SIGTERM');
      }
      if (httpAudioProcess && !httpAudioProcess.killed) {
        httpAudioProcess.kill('SIGTERM');
      }

      const isUrl = audioSource.startsWith('http://') || audioSource.startsWith('https://');
      const displayName = track?.name || (isUrl ? 'Stream' : path.basename(audioSource));
      
      logger.info(`🎵 Starting audio stream: ${displayName} (${isUrl ? 'URL' : 'file'})`);

      // FFmpeg arguments with intelligent sync adjustments
      const ffmpegArgs = [];
      
      // Get intelligent buffer size based on network conditions
      const bufferSize = getIntelligentBufferSize();
      
      if (isUrl) {
        // For URL streams, add additional options for network streaming
        ffmpegArgs.push(
          '-reconnect', '1',
          '-reconnect_streamed', '1', 
          '-reconnect_delay_max', '2',
          '-i', audioSource,
          '-f', 's16le',
          '-ar', '48000',
          '-ac', '2',
          '-bufsize', bufferSize,
          '-af', getAudioFilterChain(),
          '-y',
          SNAPCAST_FIFO
        );
      } else {
        // For local files
        ffmpegArgs.push(
          '-i', audioSource,
          '-f', 's16le',
          '-ar', '48000',
          '-ac', '2',
          '-bufsize', bufferSize,
          '-af', getAudioFilterChain(),
          '-y',
          SNAPCAST_FIFO
        );
      }

      // Create FFmpeg process for Snapcast (FIFO)
      audioStreamProcess = spawn(FFMPEG_PATH, ffmpegArgs, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // Create separate FFmpeg process for HTTP streaming (Chromecast)  
      const httpArgs = [];
      if (isUrl) {
        httpArgs.push(
          '-reconnect', '1',
          '-reconnect_streamed', '1',
          '-reconnect_delay_max', '2',
          '-i', audioSource,
          '-f', 'mp3',
          '-acodec', 'mp3',
          '-ab', '192k',
          '-ar', '44100',
          '-ac', '2',
          '-'
        );
      } else {
        httpArgs.push(
          '-i', audioSource,
          '-f', 'mp3',
          '-acodec', 'mp3',
          '-ab', '192k',
          '-ar', '44100',
          '-ac', '2',
          '-'
        );
      }
      
      httpAudioProcess = spawn(FFMPEG_PATH, httpArgs, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // Handle Snapcast audio stream events
      audioStreamProcess.on('spawn', () => {
        logger.success(`✅ Audio stream started: ${displayName}`);
        
        // Start sync quality monitoring for active playback
        if (syncMonitoringActive) {
          recordSyncEvent('playback_started', 'all', { 
            track: track.name,
            activeZones: Object.keys(activeZones).filter(z => activeZones[z])
          });
          
          // Measure current sync quality for all active zones
          setTimeout(() => {
            Object.keys(activeZones).forEach(async (zone) => {
              if (activeZones[zone]) {
                try {
                  const latency = await measureDeviceLatency(zone);
                  updateSyncQuality(zone, latency);
                } catch (error) {
                  logger.warn(`Sync quality check failed for ${zone}:`, error.message);
                }
              }
            });
          }, 1000); // Give audio stream time to establish
        }
        
        resolve();
      });

      audioStreamProcess.on('error', (error) => {
        logger.error('❌ Audio stream error:', error.message);
        startSilenceStream();
        reject(error);
      });

      audioStreamProcess.on('exit', (code, signal) => {
        logger.info(`🎵 Audio stream ended: ${displayName} (code: ${code})`);
        audioStreamProcess = null;
        
        // Stop HTTP streaming when main audio ends
        if (httpAudioProcess && !httpAudioProcess.killed) {
          httpAudioProcess.kill('SIGTERM');
        }
        
        // Check if we should auto-play next track
        if (currentTrackIndex < queue.length - 1) {
          logger.info('⏭️  Auto-playing next track...');
          setTimeout(async () => {
            currentTrackIndex++;
            await playCurrentTrack();
          }, 300); // 300ms delay for smooth transitions
        } else {
          logger.info('🏁 End of queue reached');
          isPlaying = false;
          currentTrackIndex = -1;
          
          // Broadcast final state
          safeEmit(io, 'update_state', {
            files: musicFiles,
            queue,
            currentTrackIndex,
            isPlaying,
            currentTrack: currentTrackIndex >= 0 && currentTrackIndex < queue.length ? queue[currentTrackIndex] : null
          });
          
          // Restart silence stream when all music ends
          setTimeout(startSilenceStream, 500);
        }
        resolve();
      });

      // Handle HTTP streaming for Chromecast
      httpAudioProcess.on('spawn', () => {
        logger.success(`📡 HTTP audio stream started: ${displayName}`);
      });

      httpAudioProcess.stdout.on('data', (chunk) => {
        // Send audio data to all connected HTTP clients
        httpStreamClients.forEach((client, index) => {
          const res = client.response || client; // Handle both old and new format
          
          if (res.destroyed || res.finished) {
            httpStreamClients.splice(index, 1);
          } else {
            try {
              res.write(chunk);
              if (client.lastActivity !== undefined) {
                client.lastActivity = Date.now();
              }
            } catch (error) {
              logger.warn(`HTTP client write error for ${client.deviceId || 'unknown'}:`, error.message);
              try {
                res.destroy();
              } catch (destroyError) {
                // Ignore destroy errors
              }
              httpStreamClients.splice(index, 1);
            }
          }
        });
      });

      httpAudioProcess.on('error', (error) => {
        logger.error('HTTP audio stream error:', error.message);
      });

      httpAudioProcess.on('exit', (code, signal) => {
        logger.info(`📡 HTTP audio stream ended: ${displayName}`);
        httpAudioProcess = null;
        
        // Close all HTTP streaming clients
        httpStreamClients.forEach(client => {
          const res = client.response || client; // Handle both old and new format
          if (!res.destroyed && !res.finished) {
            try {
              res.end();
            } catch (error) {
              // Ignore end errors
            }
          }
        });
        httpStreamClients = [];
      });

      // Monitor stderr for actual errors
      if (audioStreamProcess.stderr) {
        audioStreamProcess.stderr.on('data', (data) => {
          const errorText = data.toString();
          if (errorText.includes('Error') || errorText.includes('Failed')) {
            logger.error('FFmpeg audio error:', errorText.trim());
          }
        });
      }

    }, 200); // 200ms delay for clean transition
  });
};

const stopAudioStream = () => {
  if (audioStreamProcess && !audioStreamProcess.killed) {
    logger.info('🛑 Stopping audio stream');
    audioStreamProcess.kill('SIGTERM');
    audioStreamProcess = null;
  }
  
  if (httpAudioProcess && !httpAudioProcess.killed) {
    logger.info('🛑 Stopping HTTP audio stream');
    httpAudioProcess.kill('SIGTERM');
    httpAudioProcess = null;
  }
  
  // Close HTTP clients
  httpStreamClients.forEach(client => {
    const res = client.response || client; // Handle both old and new format
    if (!res.destroyed && !res.finished) {
      try {
        res.end();
      } catch (error) {
        // Ignore end errors
      }
    }
  });
  httpStreamClients = [];
  
  // Restart silence stream when stopping music
  setTimeout(startSilenceStream, 500);
};

// Enhanced playback control
const playCurrentTrack = async () => {
  if (currentTrackIndex < 0 || currentTrackIndex >= queue.length || isTransitioning) {
    return;
  }

  isTransitioning = true;
  const track = queue[currentTrackIndex];
  
  try {
    // Determine if this is a local file or streaming URL
    const audioSource = track.streamUrl || track.previewUrl || track.path;
    await startAudioStream(audioSource, track);
    isPlaying = true;
    logger.success(`▶️  Now playing: ${track.name}`);
    
    // Broadcast state update
    safeEmit(io, 'update_state', {
      files: musicFiles,
      queue,
      currentTrackIndex,
      isPlaying,
      currentTrack: track
    });

  } catch (error) {
    logger.error('Failed to start playbook:', error);
    isPlaying = false;
    
    safeEmit(io, 'stream_error', {
      message: `Failed to play: ${track.name}`,
      track: track
    });
  } finally {
    isTransitioning = false;
  }
};

const stopPlayback = () => {
  if (isTransitioning) return;
  
  isTransitioning = true;
  stopAudioStream();
  isPlaying = false;
  
  logger.info('⏹️  Playback stopped');
  
  safeEmit(io, 'update_state', {
    files: musicFiles,
    queue,
    currentTrackIndex,
    isPlaying,
    currentTrack: currentTrackIndex >= 0 && currentTrackIndex < queue.length ? queue[currentTrackIndex] : null
  });
  
  setTimeout(() => {
    isTransitioning = false;
  }, 500);
};

const playNext = async () => {
  if (currentTrackIndex < queue.length - 1) {
    currentTrackIndex++;
    await playCurrentTrack();
  } else {
    stopPlayback();
    logger.info('🏁 End of queue reached');
  }
};

// Snapcast WebSocket API Integration
const connectToSnapcast = () => {
  if (snapcastWs && snapcastWs.readyState === WebSocket.OPEN) {
    return; // Already connected
  }

  try {
    logger.info(`🔌 Connecting to Snapcast server at ${SNAPCAST_HOST}:${SNAPCAST_PORT}`);
    snapcastWs = new WebSocket(`ws://${SNAPCAST_HOST}:${SNAPCAST_PORT}/jsonrpc`);

    snapcastWs.on('open', () => {
      logger.success('✅ Connected to Snapcast server');
      snapcastConnected = true;
      
      // Clear any reconnect timer
      if (snapcastReconnectTimer) {
        clearTimeout(snapcastReconnectTimer);
        snapcastReconnectTimer = null;
      }
      
      // Request initial status
      requestSnapcastStatus();
      
      // Broadcast connection status
      io.emit('snapcast_connected', true);
    });

    snapcastWs.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleSnapcastMessage(message);
      } catch (error) {
        logger.error('Failed to parse Snapcast message:', error);
      }
    });

    snapcastWs.on('close', () => {
      logger.warn('⚠️  Disconnected from Snapcast server');
      snapcastConnected = false;
      snapcastWs = null;
      
      // Broadcast disconnection
      io.emit('snapcast_connected', false);
      
      // Attempt reconnection
      if (!snapcastReconnectTimer) {
        snapcastReconnectTimer = setTimeout(() => {
          logger.info('🔄 Attempting to reconnect to Snapcast server...');
          connectToSnapcast();
        }, 5000);
      }
    });

    snapcastWs.on('error', (error) => {
      logger.error('Snapcast WebSocket error:', error.message);
      snapcastConnected = false;
      
      if (!snapcastReconnectTimer) {
        snapcastReconnectTimer = setTimeout(() => {
          connectToSnapcast();
        }, 5000);
      }
    });

  } catch (error) {
    logger.error('Failed to connect to Snapcast server:', error);
    snapcastConnected = false;
    
    if (!snapcastReconnectTimer) {
      snapcastReconnectTimer = setTimeout(() => {
        connectToSnapcast();
      }, 5000);
    }
  }
};

const sendSnapcastRequest = (method, params = {}) => {
  return new Promise((resolve, reject) => {
    if (!snapcastWs || snapcastWs.readyState !== WebSocket.OPEN) {
      reject(new Error('Not connected to Snapcast server'));
      return;
    }

    const id = Date.now();
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    const timeout = setTimeout(() => {
      reject(new Error('Request timeout'));
    }, 10000);

    const handleResponse = (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.id === id) {
          clearTimeout(timeout);
          snapcastWs.removeListener('message', handleResponse);
          
          if (message.error) {
            reject(new Error(message.error.message || 'Snapcast API error'));
          } else {
            resolve(message.result);
          }
        }
      } catch (error) {
        // Ignore parse errors for other messages
      }
    };

    snapcastWs.on('message', handleResponse);
    snapcastWs.send(safeJsonStringify(request));
  });
};

const handleSnapcastMessage = (message) => {
  if (message.method) {
    // Handle notifications
    switch (message.method) {
      case 'Client.OnVolumeChanged':
      case 'Client.OnConnect':
      case 'Client.OnDisconnect':
      case 'Client.OnNameChanged':
      case 'Group.OnMute':
      case 'Group.OnStreamChanged':
      case 'Stream.OnUpdate':
        logger.info('📢 Snapcast notification:', message.method);
        // Re-request status to get updated state
        setTimeout(requestSnapcastStatus, 100);
        break;
      default:
        logger.info('📢 Snapcast notification:', message.method);
    }
  } else if (message.result && message.method !== undefined) {
    // Handle response messages (processed by sendSnapcastRequest)
  }
};

const requestSnapcastStatus = async () => {
  try {
    const status = await sendSnapcastRequest('Server.GetStatus');
    snapcastStatus = status;
    snapcastClients = status.server.groups.flatMap(group => 
      group.clients.map(client => ({
        ...client,
        groupId: group.id,
        groupName: group.name,
        groupMuted: group.muted
      }))
    );
    snapcastGroups = status.server.groups;
    
    // Broadcast updated status
    io.emit('snapcast_status', {
      status: snapcastStatus,
      clients: snapcastClients,
      groups: snapcastGroups
    });
    
    logger.info(`📊 Snapcast status updated: ${snapcastClients.length} clients, ${snapcastGroups.length} groups`);
  } catch (error) {
    logger.error('Failed to get Snapcast status:', error.message);
  }
};

// Snapcast client control functions
const setClientVolume = async (clientId, volume, muted = null) => {
  try {
    const params = { id: clientId, volume: { percent: volume } };
    if (muted !== null) {
      params.volume.muted = muted;
    }
    
    await sendSnapcastRequest('Client.SetVolume', params);
    logger.info(`🔊 Set client ${clientId} volume to ${volume}%${muted !== null ? ` (muted: ${muted})` : ''}`);
    
    // Request updated status
    setTimeout(requestSnapcastStatus, 100);
  } catch (error) {
    logger.error(`Failed to set client volume: ${error.message}`);
    throw error;
  }
};

const setClientName = async (clientId, name) => {
  try {
    await sendSnapcastRequest('Client.SetName', { id: clientId, name });
    logger.info(`📝 Set client ${clientId} name to "${name}"`);
    setTimeout(requestSnapcastStatus, 100);
  } catch (error) {
    logger.error(`Failed to set client name: ${error.message}`);
    throw error;
  }
};

const setGroupMute = async (groupId, muted) => {
  try {
    await sendSnapcastRequest('Group.SetMute', { id: groupId, mute: muted });
    logger.info(`🔇 Set group ${groupId} mute to ${muted}`);
    setTimeout(requestSnapcastStatus, 100);
  } catch (error) {
    logger.error(`Failed to set group mute: ${error.message}`);
    throw error;
  }
};

const moveClientToGroup = async (clientId, groupId) => {
  try {
    await sendSnapcastRequest('Group.SetClients', { id: groupId, clients: [clientId] });
    logger.info(`👥 Moved client ${clientId} to group ${groupId}`);
    setTimeout(requestSnapcastStatus, 100);
  } catch (error) {
    logger.error(`Failed to move client to group: ${error.message}`);
    throw error;
  }
};

// REST API endpoints
app.get('/health', (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    snapcastFifo: fs.existsSync(SNAPCAST_FIFO),
    musicDir: fs.existsSync(MUSIC_DIR),
    fileCount: musicFiles.length,
    silenceStreamActive: silenceStreamProcess && !silenceStreamProcess.killed,
    audioStreamActive: audioStreamProcess && !audioStreamProcess.killed,
    httpStreamActive: httpAudioProcess && !httpAudioProcess.killed,
    httpClients: httpStreamClients.length,
    currentState: {
      isPlaying,
      currentTrackIndex,
      queueLength: queue.length,
      isTransitioning
    }
  };
  safeJsonResponse(res, health);
});

app.get('/files', (req, res) => {
  safeJsonResponse(res, musicFiles);
});

app.get('/queue', (req, res) => {
  safeJsonResponse(res, {
    queue,
    currentTrackIndex,
    isPlaying
  });
});

// Direct Cast Streaming - bypasses Snapcast completely
const directCastStreams = new Map(); // deviceIP -> stream process

const startDirectCastStream = (deviceIP, filePath) => {
  if (!filePath) {
    logger.warn(`No file to stream for direct cast to ${deviceIP}`);
    return;
  }

  // Stop any existing direct stream for this device
  if (directCastStreams.has(deviceIP)) {
    const existingProcess = directCastStreams.get(deviceIP);
    if (existingProcess && !existingProcess.killed) {
      existingProcess.kill('SIGTERM');
    }
    directCastStreams.delete(deviceIP);
  }

  logger.info(`🎵 Starting DIRECT stream for ${deviceIP}: ${path.basename(filePath)}`);

  // Create dedicated FFmpeg process for this cast device
  const directCastProcess = spawn(FFMPEG_PATH, [
    '-i', filePath,
    '-f', 'mp3',
    '-acodec', 'mp3',
    '-ab', '192k',
    '-ar', '44100',
    '-ac', '2',
    '-avoid_negative_ts', 'make_zero',
    '-'
  ], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  directCastStreams.set(deviceIP, directCastProcess);

  directCastProcess.on('spawn', () => {
    logger.success(`✅ Direct cast stream started for ${deviceIP}`);
  });

  directCastProcess.on('error', (error) => {
    logger.error(`❌ Direct cast stream error for ${deviceIP}:`, error.message);
    directCastStreams.delete(deviceIP);
  });

  directCastProcess.on('exit', (code) => {
    logger.info(`📡 Direct cast stream ended for ${deviceIP} (code: ${code})`);
    directCastStreams.delete(deviceIP);
  });
};

// Direct Cast Stream Endpoint - device-specific streams
app.get('/cast/:deviceIP/stream', (req, res) => {
  const deviceIP = req.params.deviceIP;
  logger.info(`📡 Direct cast stream request from ${deviceIP}`);

  let directProcess = directCastStreams.get(deviceIP);
  
  if (!directProcess || directProcess.killed) {
    // Try to start a direct stream if we have a current track
    const currentTrack = currentTrackIndex >= 0 && currentTrackIndex < queue.length ? queue[currentTrackIndex] : null;
    if (currentTrack) {
      const filePath = path.join(MUSIC_DIR, currentTrack.filename);
      startDirectCastStream(deviceIP, filePath);
      directProcess = directCastStreams.get(deviceIP);
      
      if (directProcess) {
        logger.info(`✅ Started new direct stream for ${deviceIP}: ${currentTrack.name}`);
      } else {
        logger.warn(`❌ Failed to start direct stream for ${deviceIP}`);
        return res.status(404).json({ error: 'No active direct stream and could not start one' });
      }
    } else {
      logger.warn(`❌ No active direct stream for ${deviceIP} and no current track`);
      return res.status(404).json({ error: 'No active direct stream' });
    }
  }

  // Set headers for direct audio streaming
  res.set({
    'Content-Type': 'audio/mpeg',
    'Transfer-Encoding': 'chunked',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Range'
  });

  // Pipe the audio stream directly to this device
  directProcess.stdout.pipe(res);

  // Handle client disconnection
  req.on('close', () => {
    logger.info(`📡 Direct cast client ${deviceIP} disconnected`);
  });

  res.on('error', (error) => {
    logger.warn(`Direct cast stream error for ${deviceIP}:`, error.message);
  });
});

// Enhanced HTTP Audio Streaming with device-specific endpoints
app.get('/stream/current', (req, res) => {
  handleHttpStream(req, res, 'default');
});

// Device-specific streaming endpoints for better Chromecast management
app.get('/stream/device/:deviceId', (req, res) => {
  const deviceId = sanitizeUnicode(req.params.deviceId);
  logger.info(`📡 Device-specific stream requested for: ${deviceId}`);
  handleHttpStream(req, res, deviceId);
});

const handleHttpStream = (req, res, deviceId = 'default') => {
  const userAgent = req.get('User-Agent') || '';
  const isChromeCast = userAgent.includes('CrKey') || userAgent.includes('Chromecast');
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
  
  logger.info(`📡 New HTTP stream: ${deviceId} from ${clientIP} (${isChromeCast ? 'Chromecast' : 'Browser'})`);

  // Enhanced headers for better Chromecast compatibility
  const headers = {
    'Content-Type': 'audio/mpeg',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Range, Content-Range, Content-Length',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Accept-Ranges': 'bytes'
  };

  // Additional headers for Chromecast
  if (isChromeCast) {
    headers['X-Content-Type-Options'] = 'nosniff';
    headers['Transfer-Encoding'] = 'chunked';
  }

  res.set(headers);

  // Create client info object
  const clientInfo = {
    response: res,
    deviceId: deviceId,
    isChromeCast: isChromeCast,
    clientIP: clientIP,
    userAgent: userAgent.substring(0, 100), // Truncate for logging
    connectedAt: new Date().toISOString(),
    lastActivity: Date.now()
  };

  // Add this client to the list
  httpStreamClients.push(clientInfo);
  logger.info(`📡 Active stream clients: ${httpStreamClients.length}`);

  // Remove client when connection closes
  req.on('close', () => {
    const index = httpStreamClients.findIndex(client => client.response === res);
    if (index > -1) {
      const client = httpStreamClients[index];
      httpStreamClients.splice(index, 1);
      logger.info(`📡 Stream disconnected: ${client.deviceId} from ${client.clientIP} (${client.isChromeCast ? 'Chromecast' : 'Browser'})`);
      logger.info(`📡 Remaining clients: ${httpStreamClients.length}`);
    }
  });

  req.on('error', (error) => {
    logger.warn(`HTTP stream error for ${deviceId}:`, error.message);
    const index = httpStreamClients.findIndex(client => client.response === res);
    if (index > -1) {
      httpStreamClients.splice(index, 1);
    }
  });

  // Send a small initial chunk to establish connection for Chromecast
  if (isChromeCast) {
    try {
      res.write(Buffer.alloc(512, 0)); // Send 512 bytes of silence
      clientInfo.lastActivity = Date.now();
    } catch (error) {
      logger.warn(`Failed to send initial chunk to ${deviceId}:`, error.message);
    }
  }
};

app.post('/upload', upload.single('music'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    logger.info(`📁 File uploaded: ${sanitizeUnicode(req.file.filename)}`);
    loadMusicFiles(); // Refresh the file list
    
    safeEmit(io, 'update_state', {
      files: musicFiles,
      queue,
      currentTrackIndex,
      isPlaying
    });
    
    safeJsonResponse(res, { 
      message: 'File uploaded successfully',
      file: sanitizeUnicode(req.file.filename)
    });
  } catch (error) {
    logger.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info(`🔌 Client connected: ${socket.id} from ${socket.handshake.address}`);

  // Send initial data
  safeEmit(socket, 'initial_data', {
    files: musicFiles,
    queue,
    currentTrackIndex,
    isPlaying,
    currentTrack: currentTrackIndex >= 0 && currentTrackIndex < queue.length ? queue[currentTrackIndex] : null
  });

  // Add to queue
  socket.on('add_to_queue', async (fileId) => {
    try {
      const file = musicFiles.find(f => f.id === fileId);
      if (file) {
        const wasEmpty = queue.length === 0;
        queue.push(file);
        logger.info(`➕ Added to queue: ${file.name}`);
        
        // Auto-start playback if this was the first track added
        if (wasEmpty && !isPlaying) {
          currentTrackIndex = 0;
          await playCurrentTrack();
          logger.info(`🎵 Auto-starting playback: ${file.name}`);
        } else {
          safeEmit(io, 'update_state', {
            files: musicFiles,
            queue,
            currentTrackIndex,
            isPlaying,
            currentTrack: currentTrackIndex >= 0 && currentTrackIndex < queue.length ? queue[currentTrackIndex] : null
          });
        }
      }
    } catch (error) {
      logger.error('Error adding to queue:', error);
      socket.emit('stream_error', { message: 'Failed to add to queue' });
    }
  });

  // Add streaming track to queue
  socket.on('add_streaming_to_queue', async (streamingTrack) => {
    try {
      if (streamingTrack && streamingTrack.uri) {
        const wasEmpty = queue.length === 0;
        queue.push(streamingTrack);
        logger.info(`➕ Added streaming track to queue: ${streamingTrack.name} (${streamingTrack.service})`);
        
        // Auto-start playback if queue was empty
        if (wasEmpty && !isPlaying) {
          currentTrackIndex = 0;
          setTimeout(() => playCurrentTrack(), 500);
        }
        
        safeEmit(io, 'update_state', {
          files: musicFiles,
          queue,
          currentTrackIndex,
          isPlaying,
          currentTrack: currentTrackIndex >= 0 && currentTrackIndex < queue.length ? queue[currentTrackIndex] : null
        });
      }
    } catch (error) {
      logger.error('Error adding streaming track to queue:', error);
      socket.emit('stream_error', { message: 'Failed to add streaming track to queue' });
    }
  });

  // Remove from queue
  socket.on('remove_from_queue', (index) => {
    try {
      if (index >= 0 && index < queue.length) {
        const removed = queue.splice(index, 1)[0];
        logger.info(`➖ Removed from queue: ${removed.name}`);
        
        // Adjust current index if necessary
        if (index < currentTrackIndex) {
          currentTrackIndex--;
        } else if (index === currentTrackIndex && isPlaying) {
          // If we removed the currently playing track, stop and play next
          stopPlayback();
          if (currentTrackIndex < queue.length) {
            setTimeout(() => playCurrentTrack(), 1000);
          }
        }
        
        safeEmit(io, 'update_state', {
          files: musicFiles,
          queue,
          currentTrackIndex,
          isPlaying,
          currentTrack: currentTrackIndex >= 0 && currentTrackIndex < queue.length ? queue[currentTrackIndex] : null
        });
      }
    } catch (error) {
      logger.error('Error removing from queue:', error);
      socket.emit('stream_error', { message: 'Failed to remove from queue' });
    }
  });

  // Clear queue
  socket.on('clear_queue', () => {
    try {
      stopPlayback();
      queue = [];
      currentTrackIndex = -1;
      logger.info('🗑️  Queue cleared');
      
      safeEmit(io, 'update_state', {
        files: musicFiles,
        queue,
        currentTrackIndex,
        isPlaying,
        currentTrack: currentTrackIndex >= 0 && currentTrackIndex < queue.length ? queue[currentTrackIndex] : null
      });
    } catch (error) {
      logger.error('Error clearing queue:', error);
    }
  });

  // Move queue item
  socket.on('move_queue_item', ({ fromIndex, toIndex }) => {
    try {
      if (fromIndex >= 0 && fromIndex < queue.length && 
          toIndex >= 0 && toIndex < queue.length && 
          fromIndex !== toIndex) {
        
        const movedTrack = queue.splice(fromIndex, 1)[0];
        queue.splice(toIndex, 0, movedTrack);
        
        // Adjust current track index if necessary
        if (currentTrackIndex === fromIndex) {
          currentTrackIndex = toIndex;
        } else if (fromIndex < currentTrackIndex && toIndex >= currentTrackIndex) {
          currentTrackIndex--;
        } else if (fromIndex > currentTrackIndex && toIndex <= currentTrackIndex) {
          currentTrackIndex++;
        }
        
        logger.info(`🔀 Moved track from ${fromIndex} to ${toIndex}`);
        
        safeEmit(io, 'update_state', {
          files: musicFiles,
          queue,
          currentTrackIndex,
          isPlaying,
          currentTrack: currentTrackIndex >= 0 && currentTrackIndex < queue.length ? queue[currentTrackIndex] : null
        });
      }
    } catch (error) {
      logger.error('Error moving queue item:', error);
    }
  });

  // Play
  socket.on('play', async () => {
    try {
      if (!isPlaying && queue.length > 0) {
        if (currentTrackIndex < 0) {
          currentTrackIndex = 0;
        }
        await playCurrentTrack();
      }
    } catch (error) {
      logger.error('Error in play:', error);
      socket.emit('stream_error', { message: 'Play failed' });
    }
  });

  // Pause
  socket.on('pause', async () => {
    try {
      if (isPlaying) {
        stopPlayback();
      }
    } catch (error) {
      logger.error('Error in pause:', error);
      socket.emit('stream_error', { message: 'Pause failed' });
    }
  });

  // Play/pause
  socket.on('play_pause', async () => {
    try {
      if (isPlaying) {
        stopPlayback();
      } else {
        if (queue.length > 0) {
          if (currentTrackIndex < 0) {
            currentTrackIndex = 0;
          }
          await playCurrentTrack();
        }
      }
    } catch (error) {
      logger.error('Error in play/pause:', error);
      socket.emit('stream_error', { message: 'Playback control failed' });
    }
  });

  // Next track
  socket.on('next_track', async () => {
    try {
      await playNext();
    } catch (error) {
      logger.error('Error playing next track:', error);
      socket.emit('stream_error', { message: 'Failed to play next track' });
    }
  });

  // Previous track
  socket.on('previous_track', async () => {
    try {
      if (currentTrackIndex > 0) {
        currentTrackIndex--;
        await playCurrentTrack();
      }
    } catch (error) {
      logger.error('Error playing previous track:', error);
      socket.emit('stream_error', { message: 'Failed to play previous track' });
    }
  });

  // Skip to track
  socket.on('skip_to_track', async (index) => {
    try {
      if (index >= 0 && index < queue.length) {
        currentTrackIndex = index;
        await playCurrentTrack();
      }
    } catch (error) {
      logger.error('Error skipping to track:', error);
      socket.emit('stream_error', { message: 'Failed to skip to track' });
    }
  });

  socket.on('disconnect', (reason) => {
    logger.info(`🔌 Client disconnected: ${socket.id}, reason: ${reason}`);
  });

  socket.on('error', (error) => {
    logger.error(`Socket error from ${socket.id}:`, error);
  });
});

// Process cleanup handlers
process.on('SIGINT', () => {
  logger.info('🛑 Shutting down server...');
  stopSilenceStream();
  stopAudioStream();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('🛑 Server terminated');
  stopSilenceStream();
  stopAudioStream();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  stopSilenceStream();
  stopAudioStream();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start server

// Cast device management
let connectedCastDevice = null;

app.post('/api/cast/connect', (req, res) => {
  try {
    const { deviceIP, devicePort, deviceName, deviceType } = req.body;
    
    connectedCastDevice = {
      ip: deviceIP,
      port: devicePort,
      name: deviceName,
      type: deviceType,
      connectedAt: new Date().toISOString()
    };
    
    logger.info(`📺 Cast device connected: ${deviceName} (${deviceIP}:${devicePort})`);
    
    // Enable chromecast zone automatically
    activeZones.chromecast = true;
    logger.info('🔧 Auto-enabled Chromecast zone for casting');
    
    // Start latency tracking for this device
    if (syncMonitoringActive) {
      measureDeviceLatency('chromecast', deviceName)
        .then(latency => {
          logger.info(`🔄 Measured latency for ${deviceName}: ${latency}ms`);
        })
        .catch(err => logger.warn('Latency measurement failed:', err.message));
    }
    
    res.json({ 
      success: true, 
      device: connectedCastDevice,
      message: `Connected to ${deviceName}` 
    });
  } catch (error) {
    logger.error('Error connecting cast device:', error);
    res.status(500).json({ error: 'Failed to connect cast device' });
  }
});

app.post('/api/cast/disconnect', (req, res) => {
  try {
    if (connectedCastDevice) {
      logger.info(`📺 Cast device disconnected: ${connectedCastDevice.name}`);
      connectedCastDevice = null;
      
      // Disable chromecast zone
      activeZones.chromecast = false;
      logger.info('🔧 Disabled Chromecast zone');
    }
    
    res.json({ success: true, message: 'Cast device disconnected' });
  } catch (error) {
    logger.error('Error disconnecting cast device:', error);
    res.status(500).json({ error: 'Failed to disconnect cast device' });
  }
});

app.post('/api/cast/media', async (req, res) => {
  try {
    const { deviceIP, streamUrl, metadata } = req.body;
    
    if (!connectedCastDevice || connectedCastDevice.ip !== deviceIP) {
      return res.status(400).json({ error: 'No cast device connected with that IP' });
    }
    
    logger.info(`🎵 Starting DIRECT cast: ${metadata.title} to ${connectedCastDevice.name}`);
    
    // Create a dedicated direct stream for this cast device
    const directStreamUrl = `http://192.168.12.125:3000/cast/${deviceIP}/stream`;
    logger.info(`📡 Creating direct stream at: ${directStreamUrl}`);
    
    // Start direct audio streaming for this cast device
    const currentTrack = currentTrackIndex >= 0 && currentTrackIndex < queue.length ? queue[currentTrackIndex] : null;
    if (currentTrack) {
      const filePath = path.join(MUSIC_DIR, currentTrack.filename);
      startDirectCastStream(deviceIP, filePath);
    }
    
    // Try multiple casting methods
    let castSuccess = false;
    
    try {
      // Method 1: Google Cast API v2
      const castPayload = {
        type: 'LOAD',
        media: {
          contentId: directStreamUrl,
          contentType: 'audio/mpeg',
          streamType: 'LIVE',
          metadata: {
            metadataType: 3,
            title: metadata.title,
            artist: metadata.artist,
            albumName: metadata.album
          }
        },
        autoplay: true
      };

      const castResponse = await fetch(`http://${deviceIP}:8008/v2/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: safeJsonStringify(castPayload)
      });

      if (castResponse.ok) {
        logger.success(`✅ Cast API v2 success to ${connectedCastDevice.name}`);
        castSuccess = true;
      } else {
        // Method 2: Try Cast receiver URL
        const receiverResponse = await fetch(`http://${deviceIP}:8008/apps/CC1AD845`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: safeJsonStringify({ media: directStreamUrl })
        });

        if (receiverResponse.ok) {
          logger.success(`✅ Cast receiver success to ${connectedCastDevice.name}`);
          castSuccess = true;
        }
      }
    } catch (castError) {
      logger.warn(`⚠️ Automatic casting failed: ${castError.message}`);
    }
    
    res.json({ 
      success: true, 
      message: `Direct casting ${metadata.title} to ${connectedCastDevice.name}`,
      directStreamUrl: directStreamUrl,
      streamUrl: streamUrl,
      castSuccess: castSuccess,
      instructions: [
        `🎵 Direct stream created at: ${directStreamUrl}`,
        `📱 Your ${connectedCastDevice.name} should start playing automatically`,
        `🌐 If not, open browser on TV and go to: ${directStreamUrl}`,
        `📺 Or use the cast button in your TV's browser`
      ]
    });
  } catch (error) {
    logger.error('Error casting media:', error);
    res.status(500).json({ error: 'Failed to cast media' });
  }
});

app.get('/api/cast/status', (req, res) => {
  try {
    res.json({
      isConnected: !!connectedCastDevice,
      device: connectedCastDevice,
      activeZones: activeZones
    });
  } catch (error) {
    logger.error('Error getting cast status:', error);
    res.status(500).json({ error: 'Failed to get cast status' });
  }
});

// Discovery cache to prevent excessive scanning
let lastDiscovery = 0;
let lastDevices = [];

// Cast device discovery endpoint
app.get('/api/cast/discover', async (req, res) => {
  try {
    // Limit discovery frequency - don't run more than once per minute
    const now = Date.now();
    if (lastDiscovery && (now - lastDiscovery) < 60000) { // 1 minute cooldown
      logger.info('🔍 Using cached discovery results');
      res.json({
        devices: lastDevices,
        subnets: ['192.168.1', '192.168.0', '192.168.12', '10.0.0', '172.16.0'],
        totalChecks: 0,
        devicesFound: lastDevices.length,
        cached: true
      });
      return;
    }
    
    logger.info('🔍 Starting server-side device discovery...');
    
    const devices = [];
    
    // Check multiple common subnets
    const subnets = [
      '192.168.1',   // Most common home router subnet
      '192.168.0',   // Second most common
      '192.168.12',  // Our current server subnet
      '10.0.0',      // Apple/modern routers
      '172.16.0',    // Some enterprise setups
    ];
    
    // Device check configurations
    const deviceChecks = [
      { port: 8008, type: 'chromecast' },
      { port: 8009, type: 'chromecast' },
      { port: 6466, type: 'android-tv' },
      { port: 9000, type: 'android-tv' },
    ];
    
    // Comprehensive IP range - covers all common device assignments
    const ipRange = [];
    
    // Add all IPs from 2 to 254 (excluding 1 which is usually the router)
    for (let i = 2; i <= 254; i++) {
      ipRange.push(i);
    }
    
    const checkPromises = [];
    
    for (const subnet of subnets) {
      for (const ipSuffix of ipRange) {
        const ip = `${subnet}.${ipSuffix}`;
        
        for (const check of deviceChecks) {
          checkPromises.push(
            checkCastDevice(ip, check.port, check.type)
          );
        }
      }
    }
    
    logger.info(`🔍 Checking ${checkPromises.length} potential devices across ${subnets.length} subnets...`);
    
    const results = await Promise.allSettled(checkPromises);
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        // Avoid duplicates
        const existingDevice = devices.find(d => d.ip === result.value.ip);
        if (!existingDevice) {
          devices.push(result.value);
          logger.info(`✅ Found device: ${result.value.name} at ${result.value.ip}:${result.value.port}`);
        }
      }
    });
    
    logger.info(`🎯 Discovery complete. Found ${devices.length} devices`);
    
    // Cache the results
    lastDiscovery = now;
    lastDevices = devices;
    
    res.json({
      devices: devices,
      subnets: subnets,
      totalChecks: checkPromises.length,
      devicesFound: devices.length
    });
    
  } catch (error) {
    logger.error('Error discovering cast devices:', error);
    res.status(500).json({ error: 'Failed to discover cast devices' });
  }
});

// Network diagnostic endpoint to help find cast devices
app.get('/api/cast/network-info', async (req, res) => {
  try {
    const { execSync } = require('child_process');
    const os = require('os');
    
    const networkInfo = {
      serverIP: '192.168.12.125',
      networkInterfaces: {},
      arpTable: [],
      routingInfo: {}
    };
    
    // Get network interfaces
    const interfaces = os.networkInterfaces();
    Object.keys(interfaces).forEach(name => {
      networkInfo.networkInterfaces[name] = interfaces[name].filter(iface => 
        iface.family === 'IPv4' && !iface.internal
      );
    });
    
    try {
      // Get ARP table to see other devices on network
      const arpOutput = execSync('arp -a', { encoding: 'utf8', timeout: 5000 });
      networkInfo.arpTable = arpOutput.split('\n')
        .filter(line => line.trim())
        .map(line => {
          const match = line.match(/\(([^)]+)\) at ([^\\s]+)/);
          return match ? { ip: match[1], mac: match[2] } : { raw: line };
        });
    } catch (arpError) {
      networkInfo.arpError = arpError.message;
    }
    
    try {
      // Get default route
      const routeOutput = execSync('route -n get default', { encoding: 'utf8', timeout: 5000 });
      networkInfo.routingInfo.defaultRoute = routeOutput;
    } catch (routeError) {
      networkInfo.routeError = routeError.message;
    }
    
    res.json(networkInfo);
    
  } catch (error) {
    logger.error('Error getting network info:', error);
    res.status(500).json({ error: 'Failed to get network info' });
  }
});

// Quick ping scan to find live devices on current subnet
app.get('/api/cast/ping-scan', async (req, res) => {
  try {
    const { execSync } = require('child_process');
    logger.info('🔍 Starting ping scan on subnet 192.168.12.x...');
    
    const liveDevices = [];
    const subnet = '192.168.12';
    
    // Ping scan common IP addresses quickly
    const checkIPs = [
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
      25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95,
      100, 101, 102, 103, 104, 105, 110, 111, 112, 115, 120, 125,
      150, 151, 152, 200, 201, 202, 250, 251, 252, 253, 254
    ];
    
    const pingPromises = checkIPs.map(ipSuffix => {
      const ip = `${subnet}.${ipSuffix}`;
      return new Promise((resolve) => {
        try {
          // Quick ping with 1 second timeout
          execSync(`ping -c 1 -W 1000 ${ip}`, { timeout: 2000 });
          resolve({ ip, alive: true });
        } catch (error) {
          resolve({ ip, alive: false });
        }
      });
    });
    
    const results = await Promise.allSettled(pingPromises);
    
    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value.alive) {
        liveDevices.push(result.value.ip);
        logger.info(`📡 Live device found: ${result.value.ip}`);
      }
    });
    
    logger.info(`🎯 Ping scan complete. Found ${liveDevices.length} live devices`);
    
    res.json({
      subnet: subnet,
      liveDevices: liveDevices,
      scannedIPs: checkIPs.length,
      devicesFound: liveDevices.length
    });
    
  } catch (error) {
    logger.error('Error during ping scan:', error);
    res.status(500).json({ error: 'Failed to perform ping scan' });
  }
});

// Helper function to check a single cast device
async function checkCastDevice(ip, port, type) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    let endpoints = [];
    
    if (type === 'chromecast') {
      endpoints = [
        `http://${ip}:${port}/setup/eureka_info`,
        `http://${ip}:${port}/setup/device_description`
      ];
    } else if (type === 'android-tv') {
      endpoints = [
        `http://${ip}:${port}/`,
        `http://${ip}:${port}/description.xml`
      ];
    }
    
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'User-Agent': 'MultiRoomMusicServer/1.0',
          },
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          let deviceName = `${type.toUpperCase()} Device`;
          let model = type;
          
          try {
            const contentType = response.headers.get('content-type') || '';
            
            if (contentType.includes('application/json')) {
              const data = await response.json();
              if (type === 'chromecast') {
                deviceName = data.name || data.device_name || data.friendly_name || `Chromecast (${ip})`;
                model = data.model_name || data.product_name || 'Chromecast';
              }
            } else if (contentType.includes('text/xml')) {
              const xmlText = await response.text();
              const friendlyNameMatch = xmlText.match(/<friendlyName>([^<]+)<\/friendlyName>/i);
              const modelNameMatch = xmlText.match(/<modelName>([^<]+)<\/modelName>/i);
              
              if (friendlyNameMatch) {
                deviceName = friendlyNameMatch[1];
              }
              if (modelNameMatch) {
                model = modelNameMatch[1];
              }
            }
          } catch (parseError) {
            // Use fallback names
            deviceName = `${type.toUpperCase()} (${ip})`;
          }
          
          return {
            id: `${type}-${ip}-${port}`,
            name: deviceName,
            model: model,
            ip: ip,
            port: port,
            isAvailable: true,
            isConnected: false,
            type: type,
          };
        }
      } catch (endpointError) {
        // Try next endpoint
        continue;
      }
    }
    
    clearTimeout(timeoutId);
    return null;
    
  } catch (error) {
    return null;
  }
}

// Latency compensation API endpoints
app.get('/api/latency', (req, res) => {
  try {
    logger.info('📊 Latency status requested');
    res.json({
      delays: AUDIO_DELAYS,
      activeZones: activeZones
    });
  } catch (error) {
    logger.error('Error getting latency status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/latency/delays', (req, res) => {
  try {
    logger.info('📡 Received latency update request:', req.body);
    
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    const { snapcast, chromecast, bluetooth } = req.body;
    
    // Validate and update delays
    if (snapcast !== undefined) {
      const value = parseInt(snapcast);
      if (isNaN(value) || value < 0 || value > 1000) {
        return res.status(400).json({ error: 'Invalid snapcast delay value' });
      }
      AUDIO_DELAYS.snapcast = value;
    }
    
    if (chromecast !== undefined) {
      const value = parseInt(chromecast);
      if (isNaN(value) || value < 0 || value > 1000) {
        return res.status(400).json({ error: 'Invalid chromecast delay value' });
      }
      AUDIO_DELAYS.chromecast = value;
    }
    
    if (bluetooth !== undefined) {
      const value = parseInt(bluetooth);
      if (isNaN(value) || value < 0 || value > 1000) {
        return res.status(400).json({ error: 'Invalid bluetooth delay value' });
      }
      AUDIO_DELAYS.bluetooth = value;
    }

    logger.info(`🎛️ Latency delays updated: ${safeJsonStringify(AUDIO_DELAYS)}`);
    
    // Broadcast update to all connected clients
    io.emit('latencyUpdate', sanitizeObject({ delays: AUDIO_DELAYS, activeZones }));
    
    safeJsonResponse(res, { success: true, delays: AUDIO_DELAYS });
  } catch (error) {
    logger.error('Error updating latency delays:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sync monitoring API endpoints
app.get('/api/sync/status', (req, res) => {
  try {
    logger.info('📊 Sync status requested');
    
    const syncStatus = {
      syncQuality: syncSystem.syncQuality,
      detectedLatencies: syncSystem.detectedLatencies,
      networkConditions: syncSystem.networkConditions,
      deviceProfiles: syncSystem.deviceProfiles,
      activeZones: activeZones,
      connectedDevices: Object.keys(connectedCastDevices),
      lastCalibration: syncSystem.lastCalibration || null,
      syncEvents: syncSystem.syncEvents.slice(-10) // Last 10 events
    };
    
    safeJsonResponse(res, syncStatus);
  } catch (error) {
    logger.error('Error getting sync status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/sync/calibrate', async (req, res) => {
  try {
    logger.info('🔄 Manual sync calibration requested');
    
    const results = await autoCalibrateSyncSystem();
    
    safeJsonResponse(res, { 
      success: true, 
      calibrationResults: results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error during manual calibration:', error);
    res.status(500).json({ error: 'Calibration failed' });
  }
});

app.get('/api/sync/quality/:zone', (req, res) => {
  try {
    const zone = req.params.zone;
    
    if (!syncSystem.syncQuality[zone]) {
      return res.status(404).json({ error: 'Zone not found' });
    }
    
    const zoneQuality = {
      zone: zone,
      quality: syncSystem.syncQuality[zone],
      latency: syncSystem.detectedLatencies[zone] || null,
      deviceProfile: syncSystem.deviceProfiles[zone] || syncSystem.deviceProfiles.default
    };
    
    safeJsonResponse(res, zoneQuality);
  } catch (error) {
    logger.error(`Error getting sync quality for ${req.params.zone}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/latency/zones', (req, res) => {
  try {
    logger.info('📡 Received zone update request:', req.body);
    
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    const { snapcast, chromecast, bluetooth } = req.body;
    
    // Update active zones
    if (snapcast !== undefined) {
      activeZones.snapcast = Boolean(snapcast);
    }
    
    if (chromecast !== undefined) {
      activeZones.chromecast = Boolean(chromecast);
    }
    
    if (bluetooth !== undefined) {
      activeZones.bluetooth = Boolean(bluetooth);
    }

    logger.info(`🔧 Active zones updated: ${safeJsonStringify(activeZones)}`);
    
    // Broadcast update to all connected clients
    io.emit('latencyUpdate', sanitizeObject({ delays: AUDIO_DELAYS, activeZones }));
    
    safeJsonResponse(res, { success: true, activeZones });
  } catch (error) {
    logger.error('Error updating active zones:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Snapcast API endpoints
app.get('/api/snapcast/status', (req, res) => {
  res.json({
    connected: snapcastConnected,
    status: snapcastStatus,
    clients: snapcastClients,
    groups: snapcastGroups
  });
});

app.post('/api/snapcast/client/volume', async (req, res) => {
  try {
    const { clientId, volume, muted } = req.body;
    await setClientVolume(clientId, volume, muted);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/snapcast/client/name', async (req, res) => {
  try {
    const { clientId, name } = req.body;
    await setClientName(clientId, name);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/snapcast/group/mute', async (req, res) => {
  try {
    const { groupId, muted } = req.body;
    await setGroupMute(groupId, muted);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/snapcast/client/move', async (req, res) => {
  try {
    const { clientId, groupId } = req.body;
    await moveClientToGroup(clientId, groupId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/snapcast/refresh', async (req, res) => {
  try {
    await requestSnapcastStatus();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Apple Music search proxy (no auth needed for public search)
app.get('/api/apple-music/search', async (req, res) => {
  try {
    const { q: query, limit = 25 } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Query parameter required' });
    }

    logger.info(`🍎 Apple Music search: ${query}`);
    
    const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=${limit}&media=music`;
    
    const response = await fetch(searchUrl);
    if (!response.ok) {
      throw new Error(`Apple Music API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Transform iTunes API results to our format
    const tracks = data.results.map(track => ({
      id: `apple-${track.trackId}`,
      name: sanitizeUnicode(track.trackName || 'Unknown'),
      artist: sanitizeUnicode(track.artistName || 'Unknown Artist'),
      album: sanitizeUnicode(track.collectionName || 'Unknown Album'),
      duration: Math.floor((track.trackTimeMillis || 0) / 1000),
      artwork: track.artworkUrl100?.replace('100x100', '300x300'),
      previewUrl: track.previewUrl,
      uri: track.previewUrl, // Add uri property for iOS app compatibility
      service: 'apple-music',
      streamable: !!track.previewUrl,
      explicit: track.trackExplicitness === 'explicit',
      releaseDate: track.releaseDate,
      genre: sanitizeUnicode(track.primaryGenreName || ''),
      price: track.trackPrice
    }));
    
    logger.info(`🍎 Found ${tracks.length} Apple Music tracks`);
    safeJsonResponse(res, tracks);
    
  } catch (error) {
    logger.error('Apple Music search error:', error);
    res.status(500).json({ error: 'Apple Music search failed' });
  }
});

// Add Apple Music track to queue (preview only)
app.post('/api/apple-music/add-to-queue', async (req, res) => {
  try {
    const { track } = req.body;
    
    if (!track || !track.previewUrl) {
      return res.status(400).json({ error: 'Track with preview URL required' });
    }

    // Create a virtual track entry for Apple Music previews
    const virtualTrack = {
      id: track.id,
      name: sanitizeUnicode(`${track.name} (Preview)`),
      artist: sanitizeUnicode(track.artist),
      album: sanitizeUnicode(track.album),
      service: 'apple-music',
      previewUrl: track.previewUrl,
      streamUrl: track.previewUrl,
      artwork: track.artwork,
      isPreview: true,
      filename: track.id // Use track ID as filename identifier
    };

    // Add to queue
    const wasEmpty = queue.length === 0;
    queue.push(virtualTrack);
    logger.info(`➕ Added Apple Music preview to queue: ${virtualTrack.name}`);
    
    // Auto-start playbook if this was the first track added
    if (wasEmpty && !isPlaying) {
      currentTrackIndex = 0;
      await playCurrentTrack();
      logger.info(`🎵 Auto-starting Apple Music preview: ${virtualTrack.name}`);
    } else {
      safeEmit(io, 'update_state', {
        files: musicFiles,
        queue,
        currentTrackIndex,
        isPlaying,
        currentTrack: currentTrackIndex >= 0 && currentTrackIndex < queue.length ? queue[currentTrackIndex] : null
      });
    }

    safeJsonResponse(res, { success: true, message: 'Apple Music preview added to queue' });
    
  } catch (error) {
    logger.error('Error adding Apple Music track to queue:', error);
    res.status(500).json({ error: 'Failed to add track to queue' });
  }
});

// Serve React app for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

server.listen(PORT, () => {
  logger.success(`🎵 Snapcast Music Server running on port ${PORT}`);
  
  // Load music files
  loadMusicFiles();
  
  // Log configuration
  logger.info('Configuration:', {
    musicDir: MUSIC_DIR,
    snapcastFifo: SNAPCAST_FIFO,
    fileCount: musicFiles.length
  });
  
  // Start silence stream after short delay
  setTimeout(() => {
    startSilenceStream();
    
    // Initialize sync monitoring
    logger.info('🔄 Starting intelligent sync monitoring...');
    startSyncMonitoring();
  }, 2000);
  
  // Connect to Snapcast server
  setTimeout(() => {
    connectToSnapcast();
  }, 1000);
});

module.exports = app;
