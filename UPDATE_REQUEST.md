# Update Request: Add Bluetooth latency compensation for sync

## Requested Changes
Add adjustable latency compensation to sync Bluetooth speakers with network devices.

Need these features:
- Configurable delay settings for different device types (Snapcast, Chromecast, Bluetooth)
- API endpoints to adjust delays in real-time  
- React UI controls for latency adjustment with sliders
- Default Bluetooth compensation of ~250ms
- Ability to fine-tune delays by device type
- Device zone selection (enable/disable device types)
- Test sync functionality

This will allow mixed setups with Bluetooth speakers to stay in sync with network streaming devices.

Files to update:
- server.js (add latency compensation logic and API endpoints)
- src/App.js (add latency control UI panel)
- package.json (add any new dependencies if needed)

## Status
⏳ Ready for code update
