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
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Configuration
const PORT = process.env.PORT || 3000;
const MUSIC_DIR = path.join(__dirname, 'music');
const SNAPCAST_FIFO = '/tmp/snapfifo';
const FFMPEG_PATH = '/opt/homebrew/bin/ffmpeg';

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
app.use(express.static('public'));

// Load music files
const loadMusicFiles = () => {
  try {
    if (!fs.existsSync(MUSIC_DIR)) {
      fs.mkdirSync(MUSIC_DIR, { recursive: true });
    }
    
    const files = fs.readdirSync(MUSIC_DIR)
      .filter(file => ['.mp3', '.wav', '.flac', '.m4a'].includes(path.extname(file).toLowerCase()))
      .map(file => ({
        id: file,
        name: path.parse(file).name,
        path: path.join(MUSIC_DIR, file)
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
const startAudioStream = (filePath) => {
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

      logger.info(`🎵 Starting audio stream: ${path.basename(filePath)}`);

      // Create FFmpeg process for Snapcast (FIFO)
      audioStreamProcess = spawn(FFMPEG_PATH, [
        '-i', filePath,
        '-f', 's16le',
        '-ar', '48000',
        '-ac', '2',
        '-bufsize', '128k',  // Increased buffer for smoother playback
        '-af', 'aresample=async=1',  // Audio resampling for sync
        '-y',
        SNAPCAST_FIFO
      ], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // Create separate FFmpeg process for HTTP streaming (Chromecast)
      httpAudioProcess = spawn(FFMPEG_PATH, [
        '-i', filePath,
        '-f', 'mp3',
        '-acodec', 'mp3',
        '-ab', '192k',
        '-ar', '44100',
        '-ac', '2',
        '-'
      ], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // Handle Snapcast audio stream events
      audioStreamProcess.on('spawn', () => {
        logger.success(`✅ Audio stream started: ${path.basename(filePath)}`);
        resolve();
      });

      audioStreamProcess.on('error', (error) => {
        logger.error('❌ Audio stream error:', error.message);
        startSilenceStream();
        reject(error);
      });

      audioStreamProcess.on('exit', (code, signal) => {
        logger.info(`🎵 Audio stream ended: ${path.basename(filePath)} (code: ${code})`);
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
          io.emit('update_state', {
            files: musicFiles,
            queue,
            currentTrackIndex,
            isPlaying
          });
          
          // Restart silence stream when all music ends
          setTimeout(startSilenceStream, 500);
        }
        resolve();
      });

      // Handle HTTP streaming for Chromecast
      httpAudioProcess.on('spawn', () => {
        logger.success(`📡 HTTP audio stream started: ${path.basename(filePath)}`);
      });

      httpAudioProcess.stdout.on('data', (chunk) => {
        // Send audio data to all connected HTTP clients
        httpStreamClients.forEach((client, index) => {
          if (client.destroyed) {
            httpStreamClients.splice(index, 1);
          } else {
            try {
              client.write(chunk);
            } catch (error) {
              logger.warn('HTTP client write error:', error.message);
              client.destroy();
              httpStreamClients.splice(index, 1);
            }
          }
        });
      });

      httpAudioProcess.on('error', (error) => {
        logger.error('HTTP audio stream error:', error.message);
      });

      httpAudioProcess.on('exit', (code, signal) => {
        logger.info(`📡 HTTP audio stream ended: ${path.basename(filePath)}`);
        httpAudioProcess = null;
        
        // Close all HTTP streaming clients
        httpStreamClients.forEach(client => {
          if (!client.destroyed) {
            client.end();
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
    if (!client.destroyed) {
      client.end();
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
    await startAudioStream(track.path);
    isPlaying = true;
    logger.success(`▶️  Now playing: ${track.name}`);
    
    // Broadcast state update
    io.emit('update_state', {
      files: musicFiles,
      queue,
      currentTrackIndex,
      isPlaying,
      currentTrack: track
    });

  } catch (error) {
    logger.error('Failed to start playback:', error);
    isPlaying = false;
    
    io.emit('stream_error', {
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
  
  io.emit('update_state', {
    files: musicFiles,
    queue,
    currentTrackIndex,
    isPlaying
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
  res.json(health);
});

app.get('/files', (req, res) => {
  res.json(musicFiles);
});

app.get('/queue', (req, res) => {
  res.json({
    queue,
    currentTrackIndex,
    isPlaying
  });
});

// HTTP Audio Streaming Endpoint for Chromecast
app.get('/stream/current', (req, res) => {
  logger.info('📡 New HTTP audio stream client connected');
  
  res.set({
    'Content-Type': 'audio/mpeg',
    'Transfer-Encoding': 'chunked',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Range'
  });

  // Add client to streaming list
  httpStreamClients.push(res);
  
  // Remove client when connection closes
  req.on('close', () => {
    const index = httpStreamClients.indexOf(res);
    if (index > -1) {
      httpStreamClients.splice(index, 1);
      logger.info('📡 HTTP audio stream client disconnected');
    }
  });

  req.on('error', () => {
    const index = httpStreamClients.indexOf(res);
    if (index > -1) {
      httpStreamClients.splice(index, 1);
    }
  });
});

app.post('/upload', upload.single('music'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    logger.info(`📁 File uploaded: ${req.file.filename}`);
    loadMusicFiles(); // Refresh the file list
    
    io.emit('update_state', {
      files: musicFiles,
      queue,
      currentTrackIndex,
      isPlaying
    });
    
    res.json({ 
      message: 'File uploaded successfully',
      file: req.file.filename 
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
  socket.emit('initial_data', {
    files: musicFiles,
    queue,
    currentTrackIndex,
    isPlaying
  });

  // Add to queue
  socket.on('add_to_queue', (fileId) => {
    try {
      const file = musicFiles.find(f => f.id === fileId);
      if (file) {
        queue.push(file);
        logger.info(`➕ Added to queue: ${file.name}`);
        
        io.emit('update_state', {
          files: musicFiles,
          queue,
          currentTrackIndex,
          isPlaying
        });
      }
    } catch (error) {
      logger.error('Error adding to queue:', error);
      socket.emit('stream_error', { message: 'Failed to add to queue' });
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
        
        io.emit('update_state', {
          files: musicFiles,
          queue,
          currentTrackIndex,
          isPlaying
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
      
      io.emit('update_state', {
        files: musicFiles,
        queue,
        currentTrackIndex,
        isPlaying
      });
    } catch (error) {
      logger.error('Error clearing queue:', error);
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
  }, 2000);
});

module.exports = app;
