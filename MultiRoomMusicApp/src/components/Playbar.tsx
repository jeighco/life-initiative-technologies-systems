import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useMusic } from '../context/MusicContext';
import { useCast } from '../context/CastContext';
import { useNavigation } from '@react-navigation/native';

const { width } = Dimensions.get('window');

const Playbar: React.FC = () => {
  const navigation = useNavigation();
  const { 
    playbackState, 
    togglePlayPause, 
    nextTrack, 
    previousTrack 
  } = useMusic();
  const { castStatus, castCurrentTrack } = useCast();

  const { currentTrack, isPlaying, queue, currentTrackIndex, position, duration } = playbackState;

  if (queue.length === 0) {
    return null;
  }

  // Show first track in queue if no current track is set
  const displayTrack = currentTrack || (queue.length > 0 ? queue[0] : null);
  
  if (!displayTrack) {
    return null;
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercentage = duration > 0 ? (position / duration) * 100 : 0;

  const handlePlaybarPress = () => {
    // Navigate to a full-screen player or queue screen
    navigation.navigate('Queue' as never);
  };

  return (
    <View style={styles.container}>
      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBackground}>
          <View 
            style={[
              styles.progressFill, 
              { width: `${progressPercentage}%` }
            ]} 
          />
        </View>
      </View>

      {/* Main Playbar Content */}
      <TouchableOpacity style={styles.playbarContent} onPress={handlePlaybarPress}>
        <View style={styles.trackInfo}>
          <Text style={styles.trackTitle} numberOfLines={1}>
            {displayTrack.name}
          </Text>
          {displayTrack.artist && (
            <Text style={styles.trackArtist} numberOfLines={1}>
              {displayTrack.artist}
            </Text>
          )}
        </View>

        <View style={styles.controls}>
          <TouchableOpacity
            style={[
              styles.controlButton,
              currentTrackIndex <= 0 && styles.controlDisabled
            ]}
            onPress={previousTrack}
            disabled={currentTrackIndex <= 0}
          >
            <Text style={styles.controlIcon}>⏮️</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.playButton}
            onPress={togglePlayPause}
          >
            <Text style={styles.playIcon}>
              {isPlaying ? '⏸️' : '▶️'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.controlButton,
              currentTrackIndex >= queue.length - 1 && styles.controlDisabled
            ]}
            onPress={nextTrack}
            disabled={currentTrackIndex >= queue.length - 1}
          >
            <Text style={styles.controlIcon}>⏭️</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.castButton,
              { backgroundColor: castStatus.isConnected ? '#10B981' : '#374151' }
            ]}
            onPress={castCurrentTrack}
          >
            <Text style={styles.castIcon}>📺</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.timeInfo}>
          <Text style={styles.timeText}>
            {formatTime(position)} / {formatTime(duration)}
          </Text>
          <Text style={styles.queueInfo}>
            {currentTrackIndex + 1} of {queue.length}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1F2937',
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  progressContainer: {
    height: 3,
  },
  progressBackground: {
    flex: 1,
    backgroundColor: '#374151',
    position: 'relative',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3B82F6',
  },
  playbarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 80,
  },
  trackInfo: {
    flex: 1,
    marginRight: 12,
  },
  trackTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  trackArtist: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  controlButton: {
    padding: 8,
    marginHorizontal: 4,
  },
  controlDisabled: {
    opacity: 0.3,
  },
  controlIcon: {
    fontSize: 20,
  },
  playButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  playIcon: {
    fontSize: 18,
  },
  timeInfo: {
    alignItems: 'flex-end',
    minWidth: 60,
  },
  timeText: {
    color: '#9CA3AF',
    fontSize: 12,
    marginBottom: 2,
  },
  queueInfo: {
    color: '#6B7280',
    fontSize: 10,
  },
  castButton: {
    borderRadius: 16,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  castIcon: {
    fontSize: 16,
  },
});

export default Playbar;