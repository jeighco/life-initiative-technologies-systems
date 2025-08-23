# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Server Commands
- `npm start` - Start the Node.js music server on port 3000
- `node server.js` - Direct server startup (same as npm start)

### Client Commands (in /client directory)
- `npm start` - Start React development server on port 3000
- `npm run build` - Build React app for production
- `npm test` - Run React tests with Jest
- `npm run eject` - Eject from Create React App (one-way operation)

## Architecture Overview

This is a multi-room music streaming system with synchronized playback across different audio devices:

### Core Components
1. **Node.js Server** (`server.js`) - Express.js server with Socket.IO for real-time communication
2. **React Client** (`client/src/App.js`) - Web-based music player interface
3. **Music Streaming** - Single HTTP stream with Socket.IO coordination
4. **Multi-room Sync** - Pure Socket.IO synchronization with device-specific latency compensation

### Audio Streaming Architecture
- **Pure Socket.IO Sync**: Native timing coordination without external dependencies
- **Single HTTP Stream**: Unified MP3 stream at `/stream/current` for all devices
- **Master Timeline**: Server maintains authoritative playback position and sync commands
- **Device-Specific Latency**: Automatic compensation for Chromecast (85ms), Bluetooth (250ms), Mobile (50ms), Web (20ms)

### Key Technologies
- **Backend**: Express.js, Socket.IO, FFmpeg, Multer (file uploads)
- **Frontend**: React, Socket.IO client, Chromecast SDK, Lucide icons
- **Audio Processing**: FFmpeg for transcoding and streaming
- **Real-time**: Socket.IO for bidirectional communication

### Server Configuration
- **Port**: 3000 (both server and client dev server)
- **Music Directory**: `./music/` (contains .mp3, .wav, .flac, .m4a files)
- **FFmpeg Path**: `/opt/homebrew/bin/ffmpeg` (macOS Homebrew installation)
- **Sync Tolerance**: 50ms (acceptable sync drift between devices)

### Client Configuration
- **Server IP**: Hardcoded to `192.168.12.125` in `client/src/App.js:4`
- **Transport**: Socket.IO with polling transport (more stable than WebSockets)
- **Chromecast**: Google Cast SDK integration with DEFAULT_MEDIA_RECEIVER_APP_ID

## Development Notes

### Running the System
1. Start the Node.js server: `npm start` (from root directory)
2. Start the React client: `cd client && npm start` (from client directory)
3. Place music files in the `music/` directory
4. Connect devices via React Native app or web interface

### File Upload
- Supports .mp3, .wav, .flac, .m4a formats
- Files uploaded via web interface are stored in `music/` directory
- Server automatically refreshes music library after upload

### Queue Management
- Add songs from library to queue
- Play/pause, next/previous controls
- Skip to specific tracks in queue
- Clear entire queue

### Multi-room Features
- Latency compensation controls in React UI
- Active zone management (Snapcast, Chromecast, Bluetooth)
- API endpoints at `/api/latency` for real-time adjustment

### Error Handling
- Connection status monitoring with auto-retry
- Error boundary in React app
- FFmpeg process monitoring and automatic restart
- Graceful fallback when Cast SDK fails to load

### Important Files
- `server.js` - Main server logic and streaming
- `client/src/App.js` - Complete React application
- `package.json` - Server dependencies and scripts
- `client/package.json` - React app dependencies and scripts
- `music/` - Audio file storage (gitignored)

### Network Dependencies
- Requires local network access for multi-room functionality
- Chromecast requires internet for Google Cast SDK
- Server serves both API and static files for the web interface