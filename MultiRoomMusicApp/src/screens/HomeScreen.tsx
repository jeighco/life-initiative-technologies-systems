import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useSocket } from '../context/SocketContext';
import { useMusic } from '../context/MusicContext';
import { useRooms } from '../context/RoomsContext';
import { useAuth } from '../context/AuthContext';

const { width } = Dimensions.get('window');

const HomeScreen: React.FC = () => {
  const { connectionState, deviceInfo } = useSocket();
  const { playbackState, togglePlayPause, nextTrack, previousTrack } = useMusic();
  const { rooms, snapcastConnected } = useRooms();
  const { authState } = useAuth();

  const getConnectionStatusIcon = () => {
    switch (connectionState.status) {
      case 'connected':
        return deviceInfo.isConnectedViaWifi ? '📶' : '📶';
      case 'connecting':
        return '🔄';
      case 'disconnected':
        return '📶❌';
      case 'error':
        return '⚠️';
      default:
        return '📶❌';
    }
  };

  const renderConnectionStatus = () => (
    <View style={styles.statusCard}>
      <Text style={styles.cardTitle}>🔗 Connection Status</Text>
      <View style={styles.statusRow}>
        <Text style={[
          styles.statusText,
          { color: connectionState.status === 'connected' ? '#10B981' : '#EF4444' }
        ]}>
          {getConnectionStatusIcon()} {connectionState.status === 'connected' 
            ? 'Connected to Server' 
            : 'Disconnected from Server'}
        </Text>
      </View>
      <View style={styles.statusRow}>
        <Text style={[
          styles.statusText,
          { color: snapcastConnected ? '#10B981' : '#EF4444' }
        ]}>
          {snapcastConnected ? '🔊' : '🔇'} {snapcastConnected 
            ? 'Snapcast Connected' 
            : 'Snapcast Disconnected'}
        </Text>
      </View>
      <Text style={styles.deviceInfo}>
        📱 {deviceInfo.name} • {deviceInfo.type}
      </Text>
      {deviceInfo.isConnectedViaBluetooth && (
        <Text style={styles.bluetoothInfo}>🔵 Bluetooth Audio Active</Text>
      )}
    </View>
  );

  const renderCurrentTrack = () => (
    <View style={styles.statusCard}>
      <Text style={styles.cardTitle}>🎵 Now Playing</Text>
      {playbackState.currentTrack ? (
        <>
          <Text style={styles.trackTitle} numberOfLines={2}>
            {playbackState.currentTrack.name}
          </Text>
          {playbackState.currentTrack.artist && (
            <Text style={styles.trackArtist}>{playbackState.currentTrack.artist}</Text>
          )}
          <View style={styles.playbackControls}>
            <TouchableOpacity
              style={[styles.controlButton, playbackState.currentTrackIndex <= 0 && styles.buttonDisabled]}
              onPress={previousTrack}
              disabled={playbackState.currentTrackIndex <= 0}
            >
              <Text style={styles.controlIcon}>⏮️</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.playButton}
              onPress={togglePlayPause}
            >
              <Text style={styles.playIcon}>
                {playbackState.isPlaying ? '⏸️' : '▶️'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.controlButton,
                playbackState.currentTrackIndex >= playbackState.queue.length - 1 && styles.buttonDisabled
              ]}
              onPress={nextTrack}
              disabled={playbackState.currentTrackIndex >= playbackState.queue.length - 1}
            >
              <Text style={styles.controlIcon}>⏭️</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.queueInfo}>
            Track {playbackState.currentTrackIndex + 1} of {playbackState.queue.length}
          </Text>
        </>
      ) : playbackState.queue.length > 0 ? (
        <View style={styles.noTrackContainer}>
          <Text style={styles.noTrackText}>Ready to play</Text>
          <Text style={styles.noTrackSubtext}>
            {playbackState.queue.length} track{playbackState.queue.length !== 1 ? 's' : ''} in queue
          </Text>
          <TouchableOpacity
            style={styles.startPlayingButton}
            onPress={() => {
              if (playbackState.queue.length > 0) {
                togglePlayPause();
              }
            }}
          >
            <Text style={styles.startPlayingIcon}>▶️</Text>
            <Text style={styles.startPlayingText}>Start Playing</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.noTrackContainer}>
          <Text style={styles.noTrackText}>No track selected</Text>
          <Text style={styles.noTrackSubtext}>
            Add music to your queue from the Library or Streaming tabs
          </Text>
        </View>
      )}
    </View>
  );

  const renderActiveRooms = () => (
    <View style={styles.statusCard}>
      <Text style={styles.cardTitle}>🏘️ Active Rooms ({rooms.filter(r => r.isActive).length})</Text>
      {rooms.filter(r => r.isActive).length === 0 ? (
        <Text style={styles.emptyText}>No active rooms detected</Text>
      ) : (
        rooms.filter(r => r.isActive).map((room) => (
          <View key={room.id} style={styles.roomItem}>
            <View style={styles.roomInfo}>
              <Text style={styles.roomName}>{room.name}</Text>
              <Text style={styles.roomDetails}>
                {room.clients.length} device{room.clients.length !== 1 ? 's' : ''} • 
                Volume: {room.volume}% {room.muted ? '🔇' : '🔊'}
              </Text>
            </View>
            <View style={[
              styles.roomStatus,
              { backgroundColor: room.isActive ? '#10B981' : '#6B7280' }
            ]} />
          </View>
        ))
      )}
    </View>
  );

  const renderQueue = () => (
    <View style={styles.statusCard}>
      <Text style={styles.cardTitle}>📝 Queue ({playbackState.queue.length} tracks)</Text>
      {playbackState.queue.length === 0 ? (
        <View style={styles.noTrackContainer}>
          <Text style={styles.emptyText}>Queue is empty</Text>
          <Text style={styles.noTrackSubtext}>
            Add songs from the Library tab to start playing music
          </Text>
        </View>
      ) : (
        <View style={styles.queueContainer}>
          {playbackState.queue.slice(0, 5).map((track, index) => (
            <View 
              key={`${track.id}-${index}`} 
              style={[
                styles.queueItem,
                index === playbackState.currentTrackIndex && styles.currentQueueItem
              ]}
            >
              <View style={styles.queueTrackInfo}>
                <Text style={[
                  styles.queueTrackTitle,
                  index === playbackState.currentTrackIndex && styles.currentTrackText
                ]} numberOfLines={1}>
                  {index === playbackState.currentTrackIndex && '▶️ '}{track.name}
                </Text>
                {track.artist && (
                  <Text style={styles.queueTrackArtist} numberOfLines={1}>
                    {track.artist}
                  </Text>
                )}
              </View>
              <Text style={styles.queueTrackIndex}>{index + 1}</Text>
            </View>
          ))}
          {playbackState.queue.length > 5 && (
            <Text style={styles.moreTracksText}>
              + {playbackState.queue.length - 5} more tracks
            </Text>
          )}
        </View>
      )}
    </View>
  );

  const renderStreamingServices = () => (
    <View style={styles.statusCard}>
      <Text style={styles.cardTitle}>🎵 Streaming Services</Text>
      <View style={styles.servicesContainer}>
        <View style={[
          styles.serviceItem,
          { backgroundColor: authState.streamingServices.spotify ? '#1DB954' : '#374151' }
        ]}>
          <Text style={styles.serviceIcon}>🎵</Text>
          <Text style={styles.serviceName}>Spotify</Text>
          <Text style={styles.serviceStatus}>
            {authState.streamingServices.spotify ? 'Connected' : 'Not Connected'}
          </Text>
        </View>
        
        <View style={[
          styles.serviceItem,
          { backgroundColor: authState.streamingServices.apple ? '#FA57C1' : '#374151' }
        ]}>
          <Text style={styles.serviceIcon}>🍎</Text>
          <Text style={styles.serviceName}>Apple Music</Text>
          <Text style={styles.serviceStatus}>
            {authState.streamingServices.apple ? 'Connected' : 'Not Connected'}
          </Text>
        </View>
        
        <View style={[
          styles.serviceItem,
          { backgroundColor: authState.streamingServices.soundcloud ? '#FF5500' : '#374151' }
        ]}>
          <Text style={styles.serviceIcon}>☁️</Text>
          <Text style={styles.serviceName}>SoundCloud</Text>
          <Text style={styles.serviceStatus}>
            {authState.streamingServices.soundcloud ? 'Connected' : 'Not Connected'}
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {renderConnectionStatus()}
      {renderCurrentTrack()}
      {renderQueue()}
      {renderActiveRooms()}
      {renderStreamingServices()}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  content: {
    padding: 16,
  },
  statusCard: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  statusRow: {
    marginBottom: 8,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
  },
  deviceInfo: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
  },
  bluetoothInfo: {
    fontSize: 12,
    color: '#3B82F6',
    marginTop: 4,
  },
  trackTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  trackArtist: {
    fontSize: 16,
    color: '#9CA3AF',
    marginBottom: 16,
  },
  playbackControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  controlButton: {
    backgroundColor: '#374151',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  playButton: {
    backgroundColor: '#3B82F6',
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 16,
  },
  buttonDisabled: {
    backgroundColor: '#6B7280',
  },
  controlIcon: {
    fontSize: 20,
  },
  playIcon: {
    fontSize: 24,
  },
  queueInfo: {
    color: '#9CA3AF',
    textAlign: 'center',
    fontSize: 14,
  },
  noTrackContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  noTrackText: {
    fontSize: 18,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  noTrackSubtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  emptyText: {
    color: '#9CA3AF',
    textAlign: 'center',
    padding: 16,
    fontSize: 16,
  },
  roomItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#374151',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  roomInfo: {
    flex: 1,
  },
  roomName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  roomDetails: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  roomStatus: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  servicesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  serviceItem: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  serviceIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  serviceName: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  serviceStatus: {
    color: '#FFFFFF',
    fontSize: 10,
    opacity: 0.8,
  },
  queueContainer: {
    marginTop: 8,
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 4,
    backgroundColor: '#374151',
    borderRadius: 6,
  },
  currentQueueItem: {
    backgroundColor: '#1F2937',
    borderLeftWidth: 3,
    borderLeftColor: '#3B82F6',
  },
  queueTrackInfo: {
    flex: 1,
    marginRight: 12,
  },
  queueTrackTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 2,
  },
  currentTrackText: {
    color: '#3B82F6',
    fontWeight: '600',
  },
  queueTrackArtist: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  queueTrackIndex: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '600',
    minWidth: 20,
    textAlign: 'center',
  },
  moreTracksText: {
    color: '#9CA3AF',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  startPlayingButton: {
    backgroundColor: '#3B82F6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 16,
  },
  startPlayingIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  startPlayingText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default HomeScreen;