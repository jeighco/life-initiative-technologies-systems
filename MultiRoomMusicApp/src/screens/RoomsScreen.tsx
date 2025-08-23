import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  Switch,
} from 'react-native';
import { useRooms } from '../context/RoomsContext';

const RoomsScreen: React.FC = () => {
  const {
    rooms,
    snapcastClients,
    snapcastGroups,
    snapcastConnected,
    latencyConfig,
    activeZones,
    setRoomVolume,
    muteRoom,
    createRoom,
    deleteRoom,
    renameRoom,
    setClientVolume,
    muteClient,
    updateLatencyDelay,
    toggleActiveZone,
    refreshSnapcastStatus,
    reconnectSnapcast,
  } = useRooms();

  const [showCreateRoomModal, setShowCreateRoomModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [showLatencyModal, setShowLatencyModal] = useState(false);

  const VolumeSlider: React.FC<{ 
    value: number; 
    onValueChange: (value: number) => void;
    disabled?: boolean;
  }> = ({ value, onValueChange, disabled = false }) => {
    return (
      <View style={styles.volumeSlider}>
        <Text style={styles.volumeLabel}>🔇</Text>
        <View style={styles.sliderContainer}>
          <View style={[styles.sliderTrack, disabled && styles.sliderDisabled]}>
            <View 
              style={[
                styles.sliderFill, 
                { width: `${value}%` },
                disabled && styles.sliderDisabled
              ]} 
            />
            <TouchableOpacity
              style={[
                styles.sliderThumb,
                { left: `${Math.max(0, Math.min(100, value))}%` },
                disabled && styles.sliderDisabled
              ]}
              onPressIn={(event) => {
                if (!disabled) {
                  // Simple volume adjustment - in real app you'd implement proper slider
                  const newValue = Math.min(100, Math.max(0, value + (value < 50 ? 10 : -10)));
                  onValueChange(newValue);
                }
              }}
              disabled={disabled}
            />
          </View>
        </View>
        <Text style={styles.volumeLabel}>🔊</Text>
        <Text style={styles.volumeValue}>{value}%</Text>
      </View>
    );
  };

  const renderSnapcastStatus = () => (
    <View style={styles.statusCard}>
      <View style={styles.statusHeader}>
        <Text style={styles.cardTitle}>🔊 Snapcast Status</Text>
        <View style={styles.statusButtons}>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={refreshSnapcastStatus}
          >
            <Text style={styles.buttonText}>🔄 Refresh</Text>
          </TouchableOpacity>
          {!snapcastConnected && (
            <TouchableOpacity
              style={styles.reconnectButton}
              onPress={reconnectSnapcast}
            >
              <Text style={styles.buttonText}>🔗 Reconnect</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <View style={styles.statusIndicator}>
        <View style={[
          styles.statusDot,
          { backgroundColor: snapcastConnected ? '#10B981' : '#EF4444' }
        ]} />
        <Text style={[
          styles.statusText,
          { color: snapcastConnected ? '#10B981' : '#EF4444' }
        ]}>
          {snapcastConnected ? 'Connected' : 'Disconnected'}
        </Text>
      </View>
      <Text style={styles.statsText}>
        {snapcastGroups.length} groups • {snapcastClients.length} clients
      </Text>
    </View>
  );

  const renderRoom = (room: any) => (
    <View key={room.id} style={styles.roomCard}>
      <View style={styles.roomHeader}>
        <View style={styles.roomTitleContainer}>
          <Text style={styles.roomTitle}>{room.name}</Text>
          <Text style={styles.roomSubtitle}>
            {room.clients.length} device{room.clients.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={styles.roomActions}>
          <TouchableOpacity
            style={[styles.muteButton, room.muted && styles.muteButtonActive]}
            onPress={() => muteRoom(room.id, !room.muted)}
          >
            <Text style={styles.muteButtonText}>
              {room.muted ? '🔇' : '🔊'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => showRoomMenu(room)}
          >
            <Text style={styles.menuButtonText}>⋮</Text>
          </TouchableOpacity>
        </View>
      </View>

      <VolumeSlider
        value={room.volume}
        onValueChange={(value) => setRoomVolume(room.id, value)}
        disabled={!room.isActive}
      />

      <View style={styles.clientsList}>
        {room.clients.map((client: any) => (
          <View key={client.id} style={styles.clientItem}>
            <View style={styles.clientInfo}>
              <Text style={styles.clientName}>{client.config.name}</Text>
              <Text style={styles.clientDetails}>
                {client.host.ip} • {client.connected ? 'Connected' : 'Disconnected'}
              </Text>
            </View>
            <View style={[
              styles.clientStatus,
              { backgroundColor: client.connected ? '#10B981' : '#6B7280' }
            ]} />
          </View>
        ))}
      </View>
    </View>
  );

  const renderLatencyControls = () => (
    <View style={styles.statusCard}>
      <View style={styles.statusHeader}>
        <Text style={styles.cardTitle}>⏱️ Latency Compensation</Text>
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => setShowLatencyModal(true)}
        >
          <Text style={styles.buttonText}>⚙️ Settings</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.zonesList}>
        <View style={styles.zoneItem}>
          <View style={styles.zoneInfo}>
            <Text style={styles.zoneName}>🔊 Snapcast</Text>
            <Text style={styles.zoneDelay}>{latencyConfig.snapcast}ms delay</Text>
          </View>
          <Switch
            value={activeZones.snapcast}
            onValueChange={() => toggleActiveZone('snapcast')}
            trackColor={{ false: '#374151', true: '#3B82F6' }}
            thumbColor={activeZones.snapcast ? '#FFFFFF' : '#9CA3AF'}
          />
        </View>

        <View style={styles.zoneItem}>
          <View style={styles.zoneInfo}>
            <Text style={styles.zoneName}>📺 Chromecast</Text>
            <Text style={styles.zoneDelay}>{latencyConfig.chromecast}ms delay</Text>
          </View>
          <Switch
            value={activeZones.chromecast}
            onValueChange={() => toggleActiveZone('chromecast')}
            trackColor={{ false: '#374151', true: '#3B82F6' }}
            thumbColor={activeZones.chromecast ? '#FFFFFF' : '#9CA3AF'}
          />
        </View>

        <View style={styles.zoneItem}>
          <View style={styles.zoneInfo}>
            <Text style={styles.zoneName}>🔵 Bluetooth</Text>
            <Text style={styles.zoneDelay}>{latencyConfig.bluetooth}ms delay</Text>
          </View>
          <Switch
            value={activeZones.bluetooth}
            onValueChange={() => toggleActiveZone('bluetooth')}
            trackColor={{ false: '#374151', true: '#3B82F6' }}
            thumbColor={activeZones.bluetooth ? '#FFFFFF' : '#9CA3AF'}
          />
        </View>
      </View>
    </View>
  );

  const showRoomMenu = (room: any) => {
    Alert.alert(
      `Room: ${room.name}`,
      'Choose an action',
      [
        { text: 'Rename', onPress: () => renameRoomPrompt(room) },
        { text: 'Delete', onPress: () => confirmDeleteRoom(room), style: 'destructive' },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const renameRoomPrompt = (room: any) => {
    Alert.prompt(
      'Rename Room',
      'Enter new room name:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Rename',
          onPress: (newName) => {
            if (newName && newName.trim()) {
              renameRoom(room.id, newName.trim());
            }
          },
        },
      ],
      'plain-text',
      room.name
    );
  };

  const confirmDeleteRoom = (room: any) => {
    Alert.alert(
      'Delete Room',
      `Are you sure you want to delete "${room.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', onPress: () => deleteRoom(room.id), style: 'destructive' },
      ]
    );
  };

  const renderCreateRoomModal = () => (
    <Modal
      visible={showCreateRoomModal}
      transparent
      animationType="fade"
      onRequestClose={() => setShowCreateRoomModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Create New Room</Text>
          
          <TextInput
            style={styles.textInput}
            placeholder="Room name"
            placeholderTextColor="#9CA3AF"
            value={newRoomName}
            onChangeText={setNewRoomName}
          />

          <Text style={styles.sectionTitle}>Select Devices:</Text>
          <ScrollView style={styles.clientSelection}>
            {snapcastClients.map((client) => (
              <TouchableOpacity
                key={client.id}
                style={[
                  styles.clientSelectItem,
                  selectedClients.includes(client.id) && styles.clientSelectItemActive
                ]}
                onPress={() => {
                  if (selectedClients.includes(client.id)) {
                    setSelectedClients(prev => prev.filter(id => id !== client.id));
                  } else {
                    setSelectedClients(prev => [...prev, client.id]);
                  }
                }}
              >
                <Text style={styles.clientSelectName}>{client.config.name}</Text>
                <Text style={styles.clientSelectCheck}>
                  {selectedClients.includes(client.id) ? '✅' : '⬜'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                setShowCreateRoomModal(false);
                setNewRoomName('');
                setSelectedClients([]);
              }}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.createButton,
                (!newRoomName.trim() || selectedClients.length === 0) && styles.createButtonDisabled
              ]}
              onPress={() => {
                if (newRoomName.trim() && selectedClients.length > 0) {
                  createRoom(newRoomName.trim(), selectedClients);
                  setShowCreateRoomModal(false);
                  setNewRoomName('');
                  setSelectedClients([]);
                }
              }}
              disabled={!newRoomName.trim() || selectedClients.length === 0}
            >
              <Text style={styles.createButtonText}>Create Room</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {renderSnapcastStatus()}
        {renderLatencyControls()}
        
        <View style={styles.roomsHeader}>
          <Text style={styles.sectionTitle}>🏘️ Rooms ({rooms.length})</Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowCreateRoomModal(true)}
          >
            <Text style={styles.addButtonText}>+ Add Room</Text>
          </TouchableOpacity>
        </View>

        {rooms.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No rooms configured</Text>
            <Text style={styles.emptySubtext}>
              Create rooms to group your Snapcast devices
            </Text>
          </View>
        ) : (
          rooms.map(renderRoom)
        )}
      </ScrollView>

      {renderCreateRoomModal()}
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
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  statusButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  refreshButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  reconnectButton: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  settingsButton: {
    backgroundColor: '#6B7280',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
  },
  statsText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  roomsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  addButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  roomCard: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  roomHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  roomTitleContainer: {
    flex: 1,
  },
  roomTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  roomSubtitle: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  roomActions: {
    flexDirection: 'row',
    gap: 8,
  },
  muteButton: {
    backgroundColor: '#374151',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  muteButtonActive: {
    backgroundColor: '#EF4444',
  },
  muteButtonText: {
    fontSize: 20,
  },
  menuButton: {
    backgroundColor: '#374151',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuButtonText: {
    fontSize: 20,
    color: '#FFFFFF',
  },
  volumeSlider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  volumeLabel: {
    fontSize: 16,
    marginHorizontal: 8,
  },
  sliderContainer: {
    flex: 1,
    marginHorizontal: 8,
  },
  sliderTrack: {
    height: 6,
    backgroundColor: '#374151',
    borderRadius: 3,
    position: 'relative',
  },
  sliderFill: {
    height: 6,
    backgroundColor: '#3B82F6',
    borderRadius: 3,
  },
  sliderThumb: {
    position: 'absolute',
    top: -6,
    width: 18,
    height: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 9,
    marginLeft: -9,
  },
  sliderDisabled: {
    opacity: 0.5,
  },
  volumeValue: {
    color: '#FFFFFF',
    fontSize: 14,
    minWidth: 35,
    textAlign: 'right',
  },
  clientsList: {
    gap: 8,
  },
  clientItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#374151',
    padding: 12,
    borderRadius: 8,
  },
  clientInfo: {
    flex: 1,
  },
  clientName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  clientDetails: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  clientStatus: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  zonesList: {
    gap: 12,
  },
  zoneItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#374151',
    padding: 12,
    borderRadius: 8,
  },
  zoneInfo: {
    flex: 1,
  },
  zoneName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  zoneDelay: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 18,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 24,
    width: '90%',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
    textAlign: 'center',
  },
  textInput: {
    backgroundColor: '#374151',
    color: '#FFFFFF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    fontSize: 16,
  },
  clientSelection: {
    maxHeight: 200,
    marginBottom: 16,
  },
  clientSelectItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#374151',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  clientSelectItemActive: {
    backgroundColor: '#3B82F6',
  },
  clientSelectName: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  clientSelectCheck: {
    fontSize: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#6B7280',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  createButton: {
    flex: 1,
    backgroundColor: '#10B981',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  createButtonDisabled: {
    backgroundColor: '#6B7280',
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default RoomsScreen;