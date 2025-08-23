import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useCast } from '../context/CastContext';
import { useMusic } from '../context/MusicContext';

const CastScreen: React.FC = () => {
  const { 
    devices, 
    castStatus, 
    isDiscovering,
    connectToDevice, 
    disconnect,
    castCurrentTrack,
    play,
    pause,
    stop,
    setVolume,
    toggleMute,
  } = useCast();
  
  const { playbackState } = useMusic();

  const handleDeviceConnect = async (deviceId: string, deviceName: string) => {
    try {
      const success = await connectToDevice(deviceId);
      if (success) {
        Alert.alert(
          'Connected',
          `Successfully connected to ${deviceName}`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Connection Failed',
          `Failed to connect to ${deviceName}`,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      Alert.alert(
        'Error',
        `Error connecting to ${deviceName}: ${error}`,
        [{ text: 'OK' }]
      );
    }
  };

  const handleDisconnect = async () => {
    Alert.alert(
      'Disconnect',
      'Disconnect from the current cast device?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Disconnect', 
          style: 'destructive',
          onPress: disconnect
        }
      ]
    );
  };

  const handleCastCurrentTrack = async () => {
    if (!playbackState.currentTrack) {
      Alert.alert('No Track', 'No track is currently selected to cast');
      return;
    }

    try {
      const success = await castCurrentTrack();
      if (success) {
        Alert.alert('Casting', `Now casting: ${playbackState.currentTrack.name}`);
      } else {
        Alert.alert('Cast Failed', 'Failed to start casting');
      }
    } catch (error) {
      Alert.alert('Error', `Casting error: ${error}`);
    }
  };

  const renderDeviceItem = (device: any) => (
    <TouchableOpacity
      key={device.id}
      style={[
        styles.deviceItem,
        device.isConnected && styles.connectedDevice
      ]}
      onPress={() => {
        if (device.isConnected) {
          handleDisconnect();
        } else {
          handleDeviceConnect(device.id, device.name);
        }
      }}
    >
      <View style={styles.deviceInfo}>
        <Text style={styles.deviceName}>{device.name}</Text>
        {device.model && (
          <Text style={styles.deviceModel}>{device.model}</Text>
        )}
        <Text style={[
          styles.deviceStatus,
          { color: device.isConnected ? '#10B981' : '#9CA3AF' }
        ]}>
          {device.isConnected ? 'Connected' : 'Available'}
        </Text>
      </View>
      <View style={[
        styles.deviceStatusIndicator,
        { backgroundColor: device.isConnected ? '#10B981' : '#6B7280' }
      ]} />
    </TouchableOpacity>
  );

  const renderConnectionStatus = () => (
    <View style={styles.statusCard}>
      <Text style={styles.cardTitle}>📺 Cast Status</Text>
      
      {castStatus.isConnected ? (
        <>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Device:</Text>
            <Text style={styles.statusValue}>{castStatus.deviceName}</Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>State:</Text>
            <Text style={[
              styles.statusValue,
              { color: castStatus.playerState === 'playing' ? '#10B981' : '#9CA3AF' }
            ]}>
              {castStatus.playerState.charAt(0).toUpperCase() + castStatus.playerState.slice(1)}
            </Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Volume:</Text>
            <Text style={styles.statusValue}>
              {Math.round(castStatus.volume * 100)}% {castStatus.muted ? '🔇' : '🔊'}
            </Text>
          </View>
          
          <View style={styles.controlButtons}>
            <TouchableOpacity style={styles.controlButton} onPress={play}>
              <Text style={styles.controlButtonText}>▶️ Play</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.controlButton} onPress={pause}>
              <Text style={styles.controlButtonText}>⏸️ Pause</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.controlButton} onPress={stop}>
              <Text style={styles.controlButtonText}>⏹️ Stop</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <Text style={styles.notConnectedText}>
          Not connected to any cast device
        </Text>
      )}
    </View>
  );

  const renderCastControls = () => (
    <View style={styles.statusCard}>
      <Text style={styles.cardTitle}>🎵 Cast Controls</Text>
      
      {playbackState.currentTrack ? (
        <>
          <Text style={styles.currentTrackTitle}>
            {playbackState.currentTrack.name}
          </Text>
          {playbackState.currentTrack.artist && (
            <Text style={styles.currentTrackArtist}>
              {playbackState.currentTrack.artist}
            </Text>
          )}
          
          <TouchableOpacity
            style={[
              styles.castTrackButton,
              { opacity: castStatus.isConnected ? 1 : 0.5 }
            ]}
            onPress={handleCastCurrentTrack}
            disabled={!castStatus.isConnected}
          >
            <Text style={styles.castTrackButtonText}>
              📺 Cast This Track
            </Text>
          </TouchableOpacity>
        </>
      ) : (
        <Text style={styles.noTrackText}>
          No track selected to cast
        </Text>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {renderConnectionStatus()}
        {renderCastControls()}
        
        <View style={styles.statusCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>
              📺 Available Devices ({devices.length})
            </Text>
            <View style={[
              styles.discoveryIndicator,
              { backgroundColor: isDiscovering ? '#10B981' : '#6B7280' }
            ]} />
          </View>
          
          {devices.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📺</Text>
              <Text style={styles.emptyTitle}>
                {isDiscovering ? 'Searching for devices...' : 'No devices found'}
              </Text>
              <Text style={styles.emptySubtitle}>
                Make sure your Android TV or Chromecast is on the same WiFi network
              </Text>
            </View>
          ) : (
            devices.map(renderDeviceItem)
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  scrollView: {
    flex: 1,
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  discoveryIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusLabel: {
    fontSize: 16,
    color: '#9CA3AF',
  },
  statusValue: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  notConnectedText: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingVertical: 20,
  },
  controlButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
  },
  controlButton: {
    backgroundColor: '#374151',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  controlButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  currentTrackTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  currentTrackArtist: {
    fontSize: 16,
    color: '#9CA3AF',
    marginBottom: 16,
  },
  castTrackButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  castTrackButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  noTrackText: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingVertical: 20,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#374151',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  connectedDevice: {
    backgroundColor: '#1E3A8A',
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  deviceModel: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 2,
  },
  deviceStatus: {
    fontSize: 12,
    fontWeight: '500',
  },
  deviceStatusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default CastScreen;