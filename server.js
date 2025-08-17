const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { spawn } = require('child_process');

const app = express();

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

const server = http.createServer(app);

// Socket.IO with CORS configuration
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Configuration with enhanced latency settings
const config = {
  musicDir: path.join(__dirname, 'music'),
  snapcastFifo: '/tmp/snapfifo',
  port: 3000,
  bufferSize: '128k',
  audioFormat: 's16le',
  sampleRate: 48000,
  channels: 2
};

// Latency compensation configuration
const AUDIO_DELAYS = {
  snapcast: 0,      // Reference timing (no delay)
  chromecast: 50,   // Chromecast network delay
  bluetooth: 250    // Bluetooth latency compensation
};

// Active zones configuration
let activeZones = {
  snapcast: true,
  chromecast: false,
  bluetooth: false
};

// State management
let queue = [];
let currentTrack = null;
let isPlaying = false;
let currentFFmpegProcess = null;
let silenceProcess = null;
let httpStreamProcess = null;
let currentPosition = 0;
let trackDuration = 0;
let positionInterval = null;
let httpClients = new Set();

// File upload configuration
const storage = multer.diskStorage({
  destination: config.musicDir,
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});
const upload = multer({ storage });

// Enhanced logging
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'music' ? '🎵' : 'ℹ️';
  console.log(`[${timestamp}] ${prefix} ${message}`);
}

// Latency compensation function
function delayAudioStream(delayMs) {
  return new Promise(resolve => {
    if (delayMs > 0) {
      log(`⏱️ Applying ${delayMs}ms delay for sync compensation`);
      setTimeout(resolve, delayMs);
    } else {
      resolve();
    }
  });
}

// Enhanced silence stream with sub-audible 20Hz tone
function startSilenceStream() {
  if (silenceProcess) {
    log('Silence stream already running');
    return;
  }

  log('🔇 Starting continuous silence stream to keep FIFO active');
  
  const silenceCmd = [
    '-f', 'lavfi',
    '-i', 'sine=frequency=20:sample_rate=48000',
    '-f', config.audioFormat,
    '-ar', config.sampleRate.toString(),
    '-ac', config.channels.toString(),
    '-filter:a', 'volume=0.001',
    '-bufsize', config.bufferSize,
    '-y', config.snapcastFifo
  ];

  silenceProcess = spawn('ffmpeg', silenceCmd);

  silenceProcess.stderr.on('data', (data) => {
    const output = data.toString();
    if (!output.includes('size=') && !output.includes('time=')) {
      log(`Silence stream: ${output.trim()}`);
    }
  });

  silenceProcess.on('close', (code) => {
    log(`Silence stream ended with code ${code}`, 'error');
    silenceProcess = null;
    setTimeout(() => {
      if (!isPlaying) {
        startSilenceStream();
      }
    }, 1000);
  });

  silenceProcess.on('error', (error) => {
    log(`Silence stream error: ${error.message}`, 'error');
    silenceProcess = null;
  });

  log('✅ Silence stream started - Snapcast should stay active');
}

// Stop silence stream
function stopSilenceStream() {
  if (silenceProcess) {
    log('🔇 Stopping silence stream');
    silenceProcess.kill('SIGTERM');
    silenceProcess = null;
  }
}

// Enhanced audio streaming with latency compensation
function startAudioStreamWithCompensation(filePath) {
  return new Promise(async (resolve, reject) => {
    try {
      // Apply latency compensation delay
      const maxDelay = Math.max(...Object.values(AUDIO_DELAYS));
      const snapcastDelay = maxDelay - AUDIO_DELAYS.snapcast;
      
      if (snapcastDelay > 0) {
        await delayAudioStream(snapcastDelay);
      }

      if (currentFFmpegProcess) {
        currentFFmpegProcess.kill('SIGTERM');
        currentFFmpegProcess = null;
      }

      stopSilenceStream();
      log(`🎵 Starting audio stream: ${path.basename(filePath)}`);

      const ffmpegArgs = [
        '-i', filePath,
        '-f', config.audioFormat,
        '-ar', config.sampleRate.toString(),
        '-ac', config.channels.toString(),
        '-bufsize', config.bufferSize,
        '-af', 'aresample=async=1',
        '-y', config.snapcastFifo
      ];

      currentFFmpegProcess = spawn('ffmpeg', ffmpegArgs);

      // Start HTTP streaming for Chromecast with delay compensation
      if (activeZones.chromecast) {
        const chromecastDelay = maxDelay - AUDIO_DELAYS.chromecast;
        setTimeout(() => {
          startHttpStream(filePath);
        }, chromecastDelay);
      }

      let resolved = false;

      currentFFmpegProcess.stdout.on('data', (data) => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      });

      currentFFmpegProcess.stderr.on('data', (data) => {
        const output = data.toString();
        
        const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2})/);
        if (durationMatch) {
          const hours = parseInt(durationMatch[1]);
          const minutes = parseInt(durationMatch[2]);
          const seconds = parseInt(durationMatch[3]);
          trackDuration = hours * 3600 + minutes * 60 + seconds;
          log(`Track duration: ${trackDuration} seconds`);
        }

        const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2})/);
        if (timeMatch) {
          const hours = parseInt(timeMatch[1]);
          const minutes = parseInt(timeMatch[2]);
          const seconds = parseInt(timeMatch[3]);
          currentPosition = hours * 3600 + minutes * 60 + seconds;
        }

        if (!output.includes('size=') && !output.includes('time=') && !output.includes('bitrate=')) {
          log(`FFmpeg: ${output.trim()}`);
        }
      });

      currentFFmpegProcess.on('close', (code) => {
        log(`Audio stream ended with code ${code}`);
        currentFFmpegProcess = null;
        stopHttpStream();
        
        if (code === 0 && queue.length > 0) {
          log('🔄 Auto-advancing to next track');
          setTimeout(() => {
            playNext();
          }, 300);
        } else {
          isPlaying = false;
          currentTrack = null;
          currentPosition = 0;
          trackDuration = 0;
          clearInterval(positionInterval);
          
          setTimeout(() => {
            startSilenceStream();
          }, 1000);
          
          io.emit('trackEnded');
          io.emit('statusUpdate', getStatus());
        }

        if (!resolved) {
          resolved = true;
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`FFmpeg exited with code ${code}`));
          }
        }
      });

      currentFFmpegProcess.on('error', (error) => {
        log(`Audio stream error: ${error.message}`, 'error');
        currentFFmpegProcess = null;
        stopHttpStream();
        
        isPlaying = false;
        currentTrack = null;
        setTimeout(() => {
          startSilenceStream();
        }, 1000);
        
        if (!resolved) {
          resolved = true;
          reject(error);
        }
      });

      startPositionTracking();
    } catch (error) {
      reject(error);
    }
  });
}

// HTTP streaming for Chromecast
function startHttpStream(filePath) {
  if (httpStreamProcess) {
    httpStreamProcess.kill('SIGTERM');
    httpStreamProcess = null;
  }

  log('📡 Starting HTTP stream for Chromecast');

  const httpArgs = [
    '-i', filePath,
    '-f', 'mp3',
    '-acodec', 'mp3',
    '-ab', '128k',
    '-ar', '44100',
    '-ac', '2',
    'pipe:1'
  ];

  httpStreamProcess = spawn('ffmpeg', httpArgs);
  
  httpStreamProcess.on('error', (error) => {
    log(`HTTP stream error: ${error.message}`, 'error');
    httpStreamProcess = null;
  });

  httpStreamProcess.on('close', (code) => {
    log(`HTTP stream ended with code ${code}`);
    httpStreamProcess = null;
  });
}

function stopHttpStream() {
  if (httpStreamProcess) {
    log('📡 Stopping HTTP stream');
    httpStreamProcess.kill('SIGTERM');
    httpStreamProcess = null;
  }
}

// Position tracking
function startPositionTracking() {
  clearInterval(positionInterval);
  positionInterval = setInterval(() => {
    if (isPlaying && currentTrack) {
      io.emit('positionUpdate', {
        position: currentPosition,
        duration: trackDuration
      });
    }
  }, 1000);
}

// Get music files
function getMusicFiles() {
  try {
    const files = fs.readdirSync(config.musicDir)
      .filter(file => /\.(mp3|wav|flac|m4a|ogg)$/i.test(file))
      .map(file => ({
        name: file,
        path: path.join(config.musicDir, file)
      }));
    
    log(`Found ${files.length} music files`);
    return files;
  } catch (error) {
    log(`Error reading music directory: ${error.message}`, 'error');
    return [];
  }
}

// Playback controls
function playNext() {
  if (queue.length === 0) {
    log('Queue is empty');
    isPlaying = false;
    currentTrack = null;
    
    setTimeout(() => {
      startSilenceStream();
    }, 1000);
    
    io.emit('statusUpdate', getStatus());
    return;
  }

  currentTrack = queue.shift();
  isPlaying = true;
  currentPosition = 0;
  trackDuration = 0;

  log(`▶️ Playing: ${currentTrack.name}`);

  startAudioStreamWithCompensation(currentTrack.path)
    .then(() => {
      io.emit('statusUpdate', getStatus());
    })
    .catch((error) => {
      log(`Playback error: ${error.message}`, 'error');
      if (queue.length > 0) {
        setTimeout(() => playNext(), 1000);
      } else {
        isPlaying = false;
        currentTrack = null;
        setTimeout(() => startSilenceStream(), 1000);
      }
      io.emit('statusUpdate', getStatus());
    });

  io.emit('statusUpdate', getStatus());
}

function stopPlayback() {
  if (currentFFmpegProcess) {
    currentFFmpegProcess.kill('SIGTERM');
    currentFFmpegProcess = null;
  }
  
  stopHttpStream();
  
  isPlaying = false;
  currentPosition = 0;
  trackDuration = 0;
  clearInterval(positionInterval);
  
  setTimeout(() => {
    startSilenceStream();
  }, 1000);

  log('⏹️ Playback stopped');
  io.emit('statusUpdate', getStatus());
}

function getStatus() {
  return {
    isPlaying,
    currentTrack,
    queue: queue.map(track => ({ name: track.name })),
    position: currentPosition,
    duration: trackDuration,
    queueLength: queue.length,
    latencySettings: AUDIO_DELAYS,
    activeZones: activeZones
  };
}

// Latency compensation API endpoints
app.get('/api/latency', (req, res) => {
  res.json({
    delays: AUDIO_DELAYS,
    activeZones: activeZones
  });
});

app.post('/api/latency/delays', (req, res) => {
  const { snapcast, chromecast, bluetooth } = req.body;
  
  if (snapcast !== undefined) AUDIO_DELAYS.snapcast = parseInt(snapcast);
  if (chromecast !== undefined) AUDIO_DELAYS.chromecast = parseInt(chromecast);
  if (bluetooth !== undefined) AUDIO_DELAYS.bluetooth = parseInt(bluetooth);
  
  log(`🎛️ Latency delays updated: ${JSON.stringify(AUDIO_DELAYS)}`);
  
  // Broadcast updated settings to all clients
  io.emit('latencyUpdate', { delays: AUDIO_DELAYS, activeZones });
  
  res.json({ success: true, delays: AUDIO_DELAYS });
});

app.post('/api/latency/zones', (req, res) => {
  const { snapcast, chromecast, bluetooth } = req.body;
  
  if (snapcast !== undefined) activeZones.snapcast = !!snapcast;
  if (chromecast !== undefined) activeZones.chromecast = !!chromecast;
  if (bluetooth !== undefined) activeZones.bluetooth = !!bluetooth;
  
  log(`🎛️ Active zones updated: ${JSON.stringify(activeZones)}`);
  
  // Broadcast updated settings to all clients
  io.emit('latencyUpdate', { delays: AUDIO_DELAYS, activeZones });
  
  res.json({ success: true, activeZones });
});

// Test sync endpoint
app.post('/api/latency/test', (req, res) => {
  log('🔊 Playing sync test tone');
  
  const testTonePath = path.join(__dirname, 'test-tone.wav');
  
  // Generate a short test tone
  const testToneCmd = [
    '-f', 'lavfi',
    '-i', 'sine=frequency=1000:duration=1',
    '-y', testTonePath
  ];
  
  const testToneProcess = spawn('ffmpeg', testToneCmd);
  
  testToneProcess.on('close', (code) => {
    if (code === 0) {
      // Play the test tone through the current audio system
      if (fs.existsSync(testTonePath)) {
        startAudioStreamWithCompensation(testTonePath)
          .then(() => {
            res.json({ success: true, message: 'Test tone played' });
            // Clean up test file
            setTimeout(() => {
              if (fs.existsSync(testTonePath)) {
                fs.unlinkSync(testTonePath);
              }
            }, 2000);
          })
          .catch((error) => {
            res.status(500).json({ error: error.message });
          });
      } else {
        res.status(500).json({ error: 'Failed to generate test tone' });
      }
    } else {
      res.status(500).json({ error: 'Failed to generate test tone' });
    }
  });
});

// HTTP streaming endpoint for Chromecast
app.get('/stream/current', (req, res) => {
  if (!currentTrack || !httpStreamProcess) {
    return res.status(404).send('No current stream');
  }

  log('📡 Chromecast requesting audio stream');

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Access-Control-Allow-Origin', '*');

  httpClients.add(res);

  if (httpStreamProcess && httpStreamProcess.stdout) {
    httpStreamProcess.stdout.pipe(res);
  }

  res.on('close', () => {
    httpClients.delete(res);
    log('📡 Chromecast disconnected from stream');
  });

  res.on('error', (error) => {
    httpClients.delete(res);
    log(`HTTP stream error: ${error.message}`, 'error');
  });
});

// Static files
app.use(express.static('public'));
app.use('/music', express.static(config.musicDir));

// Socket.IO connection handling
io.on('connection', (socket) => {
  log(`Client connected: ${socket.id}`);

  socket.emit('statusUpdate', getStatus());
  socket.emit('musicFiles', getMusicFiles());
  socket.emit('latencyUpdate', { delays: AUDIO_DELAYS, activeZones });

  socket.on('addToQueue', (filename) => {
    const musicFiles = getMusicFiles();
    const file = musicFiles.find(f => f.name === filename);
    
    if (file) {
      queue.push(file);
      log(`➕ Added to queue: ${filename}`);
      io.emit('statusUpdate', getStatus());
      
      if (!isPlaying && queue.length === 1) {
        playNext();
      }
    }
  });

  socket.on('play', () => {
    if (!isPlaying && queue.length > 0) {
      playNext();
    }
  });

  socket.on('pause', () => {
    stopPlayback();
  });

  socket.on('skip', () => {
    log('⏭️ Skipping track');
    playNext();
  });

  socket.on('stop', () => {
    stopPlayback();
  });

  socket.on('clearQueue', () => {
    queue = [];
    log('🗑️ Queue cleared');
    io.emit('statusUpdate', getStatus());
  });

  socket.on('removeFromQueue', (index) => {
    if (index >= 0 && index < queue.length) {
      const removed = queue.splice(index, 1)[0];
      log(`🗑️ Removed from queue: ${removed.name}`);
      io.emit('statusUpdate', getStatus());
    }
  });

  socket.on('disconnect', () => {
    log(`Client disconnected: ${socket.id}`);
  });
});

// File upload endpoint
app.post('/upload', upload.single('music'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  log(`📁 File uploaded: ${req.file.filename}`);
  io.emit('musicFiles', getMusicFiles());
  res.json({ message: 'File uploaded successfully' });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    isPlaying,
    currentTrack: currentTrack ? currentTrack.name : null,
    queueLength: queue.length,
    silenceActive: !!silenceProcess,
    httpStreamActive: !!httpStreamProcess,
    latencySettings: AUDIO_DELAYS,
    activeZones: activeZones
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  log('🛑 Shutting down gracefully...');
  
  if (currentFFmpegProcess) {
    currentFFmpegProcess.kill('SIGTERM');
  }
  
  if (silenceProcess) {
    silenceProcess.kill('SIGTERM');
  }
  
  if (httpStreamProcess) {
    httpStreamProcess.kill('SIGTERM');
  }
  
  clearInterval(positionInterval);
  process.exit(0);
});

// Error handling
process.on('uncaughtException', (error) => {
  log(`Uncaught exception: ${error.message}`, 'error');
  console.error(error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  log(`Unhandled rejection at ${promise}: ${reason}`, 'error');
});

// Initialize server
function initialize() {
  if (!fs.existsSync(config.musicDir)) {
    fs.mkdirSync(config.musicDir, { recursive: true });
  }

  const musicFiles = getMusicFiles();
  
  log(`🎵 Snapcast Music Server running on port ${config.port}`);
  log(`ℹ️ Configuration: ${JSON.stringify({
    musicDir: config.musicDir,
    snapcastFifo: config.snapcastFifo,
    fileCount: musicFiles.length,
    bufferSize: config.bufferSize,
    sampleRate: config.sampleRate
  })}`);

  log(`🎛️ Latency compensation enabled: ${JSON.stringify(AUDIO_DELAYS)}`);
  log(`🎛️ Active zones: ${JSON.stringify(activeZones)}`);

  startSilenceStream();
}

// Start server
server.listen(config.port, () => {
  initialize();
});
