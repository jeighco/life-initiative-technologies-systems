# Update Request: Fix sync issues and add Chromecast audio

## Requested Changes
Update server.js to fix sync issues and add Chromecast audio support.

Need these improvements:
- Larger buffers (128k instead of 64k) for better sync
- Audio resampling (-af aresample=async=1) to prevent sync drift  
- HTTP streaming endpoints for Chromecast audio
- Dual audio output (Snapcast + Chromecast simultaneously)
- Auto-queue progression when songs end

Files to update:
- server.js (complete enhanced version with all fixes)

## Status
⏳ Ready for code update
