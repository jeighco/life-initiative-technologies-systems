import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useMusic } from '../context/MusicContext';

const QueueScreen: React.FC = () => {
  const { 
    playbackState, 
    removeFromQueue, 
    clearQueue, 
    skipToTrack,
    moveQueueItem 
  } = useMusic();

  const handleRemoveTrack = (index: number) => {
    const track = playbackState.queue[index];
    Alert.alert(
      'Remove Track',
      `Remove "${track.name}" from queue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Remove', 
          style: 'destructive',
          onPress: () => removeFromQueue(index)
        }
      ]
    );
  };

  const handleClearQueue = () => {
    Alert.alert(
      'Clear Queue',
      'Remove all tracks from the queue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Clear All', 
          style: 'destructive',
          onPress: clearQueue
        }
      ]
    );
  };

  const handleMoveUp = (index: number) => {
    if (index > 0) {
      moveQueueItem(index, index - 1);
    }
  };

  const handleMoveDown = (index: number) => {
    if (index < playbackState.queue.length - 1) {
      moveQueueItem(index, index + 1);
    }
  };

  const renderQueueItem = (track: any, index: number) => (
    <View key={`${track.id}-${index}`} style={[
      styles.queueItem,
      index === playbackState.currentTrackIndex && styles.currentTrack
    ]}>
      <TouchableOpacity
        style={styles.trackInfo}
        onPress={() => skipToTrack(index)}
      >
        <View style={styles.trackDetails}>
          <Text style={[
            styles.trackTitle,
            index === playbackState.currentTrackIndex && styles.currentTrackText
          ]} numberOfLines={1}>
            {index === playbackState.currentTrackIndex && '▶️ '}{track.name}
          </Text>
          {track.artist && (
            <Text style={styles.trackArtist} numberOfLines={1}>
              {track.artist}
            </Text>
          )}
        </View>
        <Text style={styles.trackIndex}>{index + 1}</Text>
      </TouchableOpacity>

      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.controlButton, index === 0 && styles.controlDisabled]}
          onPress={() => handleMoveUp(index)}
          disabled={index === 0}
        >
          <Text style={styles.controlIcon}>⬆️</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[
            styles.controlButton, 
            index === playbackState.queue.length - 1 && styles.controlDisabled
          ]}
          onPress={() => handleMoveDown(index)}
          disabled={index === playbackState.queue.length - 1}
        >
          <Text style={styles.controlIcon}>⬇️</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => handleRemoveTrack(index)}
        >
          <Text style={styles.removeIcon}>🗑️</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Queue ({playbackState.queue.length} tracks)</Text>
        {playbackState.queue.length > 0 && (
          <TouchableOpacity style={styles.clearButton} onPress={handleClearQueue}>
            <Text style={styles.clearButtonText}>Clear All</Text>
          </TouchableOpacity>
        )}
      </View>

      {playbackState.queue.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📝</Text>
          <Text style={styles.emptyTitle}>Queue is empty</Text>
          <Text style={styles.emptySubtitle}>
            Add songs from the Library or Streaming tabs to start building your playlist
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          {playbackState.queue.map((track, index) => renderQueueItem(track, index))}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  clearButton: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  clearButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  queueItem: {
    backgroundColor: '#1F2937',
    borderRadius: 8,
    marginBottom: 8,
    overflow: 'hidden',
  },
  currentTrack: {
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
    backgroundColor: '#1E3A8A',
  },
  trackInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  trackDetails: {
    flex: 1,
    marginRight: 12,
  },
  trackTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  currentTrackText: {
    color: '#60A5FA',
    fontWeight: '600',
  },
  trackArtist: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  trackIndex: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '600',
    minWidth: 24,
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#374151',
  },
  controlButton: {
    padding: 8,
    borderRadius: 6,
  },
  controlDisabled: {
    opacity: 0.3,
  },
  controlIcon: {
    fontSize: 16,
  },
  removeButton: {
    padding: 8,
    backgroundColor: '#EF4444',
    borderRadius: 6,
  },
  removeIcon: {
    fontSize: 16,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 24,
  },
});

export default QueueScreen;