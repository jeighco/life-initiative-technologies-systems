/**
 * TrackPlayer Service Configuration for iOS
 * Configures background audio playback and controls
 */

import TrackPlayer, { Event } from 'react-native-track-player';

const TrackPlayerService = async (): Promise<void> => {
  TrackPlayer.addEventListener(Event.RemotePause, () => {
    console.log('🎵 Remote pause');
    TrackPlayer.pause();
  });

  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    console.log('🎵 Remote play');
    TrackPlayer.play();
  });

  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    console.log('🎵 Remote stop');
    TrackPlayer.stop();
  });

  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    console.log('🎵 Remote next');
    // This would be handled by the main app
    // We'll emit a custom event that the app can listen to
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    console.log('🎵 Remote previous');
    // This would be handled by the main app
    // We'll emit a custom event that the app can listen to
  });

  TrackPlayer.addEventListener(Event.RemoteSeek, (data) => {
    console.log('🎵 Remote seek to:', data.position);
    TrackPlayer.seekTo(data.position);
  });

  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
    console.log('🎵 Playback queue ended');
    TrackPlayer.stop();
  });

  TrackPlayer.addEventListener(Event.PlaybackError, (error) => {
    console.error('🎵 Playback error:', error);
  });
};

export default TrackPlayerService;