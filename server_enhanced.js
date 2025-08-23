cat > server.js << 'EOF'
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { spawn } = require('child_process');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Configuration
const config = {
  musicDir: path.join(__dirname, 'music'),
  snapcastFifo: '/tmp/snapfifo',
  port: 3000,
  // Enhanced sync settings
  bufferSize: '128k',  // Increased from 64k for better sync
  audioFormat: 's16le',
  sampleRate: 48000,
  channels: 2
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

// Enhanced silence stream with sub-audible 20Hz tone
function startSilenceStream() {
  if (silenceProcess) {
    log('Silence stream already running');
    return;
  }

  log('🔇 Starting continuous silence stream to keep FIFO active');
  
  // Sub-audible 20Hz tone at 0.1% volume - inaudible but keeps stream active
  const silenceCmd = [
    '-f', 'lavfi',
    '-i', 'sine=frequency=20:sample_rate=48000',
    '-f', config.audioFormat,
    '-ar', config.sampleRate.toString(),
    '-ac', config.channels.toString(),
    '-filter:a', 'volume=0.001',  // 0.1% volume - virtually inaudible
    '-bufsize', config.bufferSize,
    '-y', config.snapcastFifo
  ];

  silenceProcess = spawn('ffmpeg', silenceCmd);

  silenceProcess.stdout.on('data', (data) => {
    // Silent - don't log normal output
  });

  silenceProcess.stderr.on('data', (data) => {
    const output = data.toString();
    if (!output.includes('size=') && !output.includes('time=')) {
      log(`Silence stream: ${output.trim()}`);
    }
  });

  silenceProcess.on('close', (code) => {
    log(`Silence stream ended with code ${code}`, 'error');
    silenceProcess = null;
    // Auto-restart silence stream
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

  log('✅ Silence stream process spawned successfully');
  log('🎵 Silence stream started - Snapcast should stay active');
}

// Stop silence stream
function stopSilenceStream() {
  if (silenceProcess) {
    log('🔇 Stopping silence stream');
    silenceProcess.kill('SIGTERM');
    silenceProcess = null;
  }
}

// Enhanced audio streaming with dual output (FIFO + HTTP)
function startAudioStream(filePath) {
  return new Promise((resolve, reject) => {
    if (currentFFmpegProcess) {
      currentFFmpegProcess.kill('SIGTERM');
      currentFFmpegProcess = null;
    }

    // Stop silence stream when starting music
    stopSilenceStream();

    log(`🎵 Starting audio stream: ${path.basename(filePath)}`);

    // Enhanced FFmpeg command with better sync settings
    const ffmpegArgs = [
      '-i', filePath,
      '-f', config.audioFormat,
      '-ar', config.sampleRate.toString(),
      '-ac', config.channels.toString(),
      '-bufsize', config.bufferSize,
      '-af', 'aresample=async=1',  // Audio resampling for better sync
      '-y', config.snapcastFifo
    ];

    currentFFmpegProcess = spawn('ffmpeg', ffmpegArgs);

    // Start HTTP streaming simultaneously for Chromecast
    startHttpStream(filePath);

    let resolved = false;

    currentFFmpegProcess.stdout.on('data', (data) => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    });

    currentFFmpegProcess.stderr.on('data', (data) => {
      const output = data.toString();
      
      // Parse duration from FFmpeg output
      const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2})/);
      if (durationMatch) {
        const hours = parseInt(durationMatch[1]);
        const minutes = parseInt(durationMatch[2]);
        const seconds = parseInt(durationMatch[3]);
        trackDuration = hours * 3600 + minutes * 60 + seconds;
        log(`Track duration: ${trackDuration} seconds`);
      }

      // Parse current time for position tracking
      const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2})/);
      if (timeMatch) {
        const hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const seconds = parseInt(timeMatch[3]);
        currentPosition = hours * 3600 + minutes * 60 + seconds;
      }

      // Only log significant events, not the constant progress updates
      if (!output.includes('size=') && !output.includes('time=') && !output.includes('bitrate=')) {
        log(`FFmpeg: ${output.trim()}`);
      }
    });

    currentFFmpegProcess.on('close', (code) => {
      log(`Audio stream ended with code ${code}`);
      currentFFmpegProcess = null;
      stopHttpStream();
      
      // Auto-advance to next track or restart silence
      if (code === 0 && queue.length > 0) {
        log('🔄 Auto-advancing to next track');
        setTimeout(() => {
          playNext();
        }, 500); // Small delay for smooth transition
      } else {
        // Restart silence stream when music ends
        isPlaying = false;
        currentTrack = null;
        currentPosition = 0;
        trackDuration = 0;
        clearInterval(positionInterval);
        
        setTimeout(() => {
          startSilenceStream();
        }, 1000);
        
        // Notify clients
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
      
      // Restart silence stream on error
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

    // Start position tracking
    startPositionTracking();
  });
}

// HTTP streaming for Chromecast
function startHttpStream(filePath) {
  if (httpStreamProcess) {
    httpStreamProcess.kill('SIGTERM');
    httpStreamProcess = null;
  }

  log('📡 Starting HTTP stream for Chromecast');

  // Stream MP3 over HTTP for Chromecast compatibility
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
    
    // Restart silence stream when queue is empty
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

  startAudioStream(currentTrack.path)
    .then(() => {
      io.emit('statusUpdate', getStatus());
    })
    .catch((error) => {
      log(`Playback error: ${error.message}`, 'error');
      // Try next track or restart silence
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
  
  // Restart silence stream when stopping
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
    queueLength: queue.length
  };
}

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

  // Track HTTP clients
  httpClients.add(res);

  // Pipe FFmpeg output to HTTP response
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

  // Send current status
  socket.emit('statusUpdate', getStatus());
  socket.emit('musicFiles', getMusicFiles());

  // Add to queue
  socket.on('addToQueue', (filename) => {
    const musicFiles = getMusicFiles();
    const file = musicFiles.find(f => f.name === filename);
    
    if (file) {
      queue.push(file);
      log(`➕ Added to queue: ${filename}`);
      io.emit('statusUpdate', getStatus());
      
      // Auto-start if not playing
      if (!isPlaying && queue.length === 1) {
        playNext();
      }
    }
  });

  // Control commands
  socket.on('play', () => {
    if (!isPlaying && queue.length > 0) {
      playNext();
    }
  });

  socket.on('pause', () => {
    // Note: Pause/resume is complex with FFmpeg - for now we stop
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
    httpStreamActive: !!httpStreamProcess
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
  // Ensure music directory exists
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

  // Start continuous silence stream to keep Snapcast active
  startSilenceStream();
}

// Start server
server.listen(config.port, () => {
  initialize();
});
EOF
