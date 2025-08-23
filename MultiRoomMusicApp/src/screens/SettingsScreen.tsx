import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useRooms } from '../context/RoomsContext';

const SettingsScreen: React.FC = () => {
  const { authState, logout, removeStreamingAuth } = useAuth();
  const { connectionState, deviceInfo, connect, disconnect } = useSocket();
  const { latencyConfig, activeZones, toggleActiveZone } = useRooms();

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout? This will disconnect all streaming services.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', onPress: logout, style: 'destructive' },
      ]
    );
  };

  const handleDisconnectService = (service: 'spotify' | 'apple' | 'soundcloud') => {
    Alert.alert(
      `Disconnect ${service}`,
      `Are you sure you want to disconnect from ${service}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disconnect', onPress: () => removeStreamingAuth(service), style: 'destructive' },
      ]
    );
  };

  const renderConnectionSection = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>🔗 Connection</Text>
      
      <View style={styles.settingItem}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingName}>Server Status</Text>
          <Text style={styles.settingValue}>
            {connectionState.status === 'connected' ? 'Connected' : 'Disconnected'}
          </Text>
        </View>
        <View style={[
          styles.statusIndicator,
          { backgroundColor: connectionState.status === 'connected' ? '#10B981' : '#EF4444' }
        ]} />
      </View>

      <View style={styles.settingItem}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingName}>Server Address</Text>
          <Text style={styles.settingValue}>{connectionState.serverAddress}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[
          styles.actionButton,
          connectionState.status === 'connected' ? styles.disconnectButton : styles.connectButton
        ]}
        onPress={connectionState.status === 'connected' ? disconnect : connect}
      >
        <Text style={styles.actionButtonText}>
          {connectionState.status === 'connected' ? 'Disconnect' : 'Reconnect'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderDeviceSection = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>📱 Device Information</Text>
      
      <View style={styles.settingItem}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingName}>Device Name</Text>
          <Text style={styles.settingValue}>{deviceInfo.name}</Text>
        </View>
      </View>

      <View style={styles.settingItem}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingName}>Device Type</Text>
          <Text style={styles.settingValue}>{deviceInfo.type}</Text>
        </View>
      </View>

      <View style={styles.settingItem}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingName}>IP Address</Text>
          <Text style={styles.settingValue}>{deviceInfo.ipAddress}</Text>
        </View>
      </View>

      <View style={styles.settingItem}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingName}>WiFi Connected</Text>
          <Text style={styles.settingValue}>
            {deviceInfo.isConnectedViaWifi ? 'Yes' : 'No'}
          </Text>
        </View>
        <Text style={styles.settingIcon}>
          {deviceInfo.isConnectedViaWifi ? '📶' : '📶❌'}
        </Text>
      </View>

      {deviceInfo.isConnectedViaBluetooth && (
        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingName}>Bluetooth Audio</Text>
            <Text style={styles.settingValue}>Active</Text>
          </View>
          <Text style={styles.settingIcon}>🔵</Text>
        </View>
      )}
    </View>
  );

  const renderAudioZonesSection = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>🔊 Audio Zones</Text>
      
      <View style={styles.settingItem}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingName}>Snapcast</Text>
          <Text style={styles.settingValue}>
            {latencyConfig.snapcast}ms delay
          </Text>
        </View>
        <Switch
          value={activeZones.snapcast}
          onValueChange={() => toggleActiveZone('snapcast')}
          trackColor={{ false: '#374151', true: '#3B82F6' }}
          thumbColor={activeZones.snapcast ? '#FFFFFF' : '#9CA3AF'}
        />
      </View>

      <View style={styles.settingItem}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingName}>Chromecast</Text>
          <Text style={styles.settingValue}>
            {latencyConfig.chromecast}ms delay
          </Text>
        </View>
        <Switch
          value={activeZones.chromecast}
          onValueChange={() => toggleActiveZone('chromecast')}
          trackColor={{ false: '#374151', true: '#3B82F6' }}
          thumbColor={activeZones.chromecast ? '#FFFFFF' : '#9CA3AF'}
        />
      </View>

      <View style={styles.settingItem}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingName}>Bluetooth</Text>
          <Text style={styles.settingValue}>
            {latencyConfig.bluetooth}ms delay
          </Text>
        </View>
        <Switch
          value={activeZones.bluetooth}
          onValueChange={() => toggleActiveZone('bluetooth')}
          trackColor={{ false: '#374151', true: '#3B82F6' }}
          thumbColor={activeZones.bluetooth ? '#FFFFFF' : '#9CA3AF'}
        />
      </View>
    </View>
  );

  const renderStreamingSection = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>🎵 Streaming Services</Text>
      
      {authState.streamingServices.spotify && (
        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingName}>🎵 Spotify</Text>
            <Text style={styles.settingValue}>Connected</Text>
          </View>
          <TouchableOpacity
            style={styles.disconnectServiceButton}
            onPress={() => handleDisconnectService('spotify')}
          >
            <Text style={styles.disconnectServiceButtonText}>Disconnect</Text>
          </TouchableOpacity>
        </View>
      )}

      {authState.streamingServices.apple && (
        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingName}>🍎 Apple Music</Text>
            <Text style={styles.settingValue}>Connected</Text>
          </View>
          <TouchableOpacity
            style={styles.disconnectServiceButton}
            onPress={() => handleDisconnectService('apple')}
          >
            <Text style={styles.disconnectServiceButtonText}>Disconnect</Text>
          </TouchableOpacity>
        </View>
      )}

      {authState.streamingServices.soundcloud && (
        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingName}>☁️ SoundCloud</Text>
            <Text style={styles.settingValue}>Connected</Text>
          </View>
          <TouchableOpacity
            style={styles.disconnectServiceButton}
            onPress={() => handleDisconnectService('soundcloud')}
          >
            <Text style={styles.disconnectServiceButtonText}>Disconnect</Text>
          </TouchableOpacity>
        </View>
      )}

      {!authState.streamingServices.spotify && !authState.streamingServices.apple && !authState.streamingServices.soundcloud && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No streaming services connected</Text>
          <Text style={styles.emptySubtext}>
            Go to the Streaming tab to connect services
          </Text>
        </View>
      )}
    </View>
  );

  const renderAccountSection = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>👤 Account</Text>
      
      {authState.user && (
        <>
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingName}>Name</Text>
              <Text style={styles.settingValue}>{authState.user.name}</Text>
            </View>
          </View>

          {authState.user.email && (
            <View style={styles.settingItem}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingName}>Email</Text>
                <Text style={styles.settingValue}>{authState.user.email}</Text>
              </View>
            </View>
          )}
        </>
      )}

      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
      >
        <Text style={styles.logoutButtonText}>🚪 Logout</Text>
      </TouchableOpacity>
    </View>
  );

  const renderAboutSection = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>ℹ️ About</Text>
      
      <View style={styles.settingItem}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingName}>App Version</Text>
          <Text style={styles.settingValue}>1.0.0</Text>
        </View>
      </View>

      <View style={styles.settingItem}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingName}>Multi-Room Music</Text>
          <Text style={styles.settingValue}>Snapcast Integration</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.supportButton}
        onPress={() => Alert.alert('Support', 'Support contact information will be provided')}
      >
        <Text style={styles.supportButtonText}>📧 Contact Support</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {renderConnectionSection()}
      {renderDeviceSection()}
      {renderAudioZonesSection()}
      {renderStreamingSection()}
      {renderAccountSection()}
      {renderAboutSection()}
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
  section: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  settingInfo: {
    flex: 1,
  },
  settingName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  settingValue: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  settingIcon: {
    fontSize: 16,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    marginTop: 8,
    alignItems: 'center',
  },
  connectButton: {
    backgroundColor: '#10B981',
  },
  disconnectButton: {
    backgroundColor: '#EF4444',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  disconnectServiceButton: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  disconnectServiceButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  logoutButton: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 6,
    marginTop: 8,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  supportButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 6,
    marginTop: 8,
    alignItems: 'center',
  },
  supportButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 16,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
});

export default SettingsScreen;