import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Room, SnapcastClient, SnapcastGroup, LatencyConfig, ActiveZones } from '../types';
import { useSocket } from './SocketContext';

interface RoomsContextValue {
  rooms: Room[];
  snapcastClients: SnapcastClient[];
  snapcastGroups: SnapcastGroup[];
  snapcastConnected: boolean;
  latencyConfig: LatencyConfig;
  activeZones: ActiveZones;
  
  // Room controls
  setRoomVolume: (roomId: string, volume: number) => void;
  muteRoom: (roomId: string, muted: boolean) => void;
  createRoom: (name: string, clientIds: string[]) => void;
  deleteRoom: (roomId: string) => void;
  renameRoom: (roomId: string, newName: string) => void;
  moveClientToRoom: (clientId: string, roomId: string) => void;
  
  // Group controls
  setGroupVolume: (groupId: string, volume: number) => void;
  muteGroup: (groupId: string, muted: boolean) => void;
  createGroup: (name: string, clientIds: string[]) => void;
  deleteGroup: (groupId: string) => void;
  
  // Client controls
  setClientVolume: (clientId: string, volume: number) => void;
  muteClient: (clientId: string, muted: boolean) => void;
  renameClient: (clientId: string, name: string) => void;
  
  // Latency controls
  updateLatencyDelay: (zone: keyof LatencyConfig, delay: number) => void;
  toggleActiveZone: (zone: keyof ActiveZones) => void;
  
  // Snapcast controls
  refreshSnapcastStatus: () => void;
  reconnectSnapcast: () => void;
}

const RoomsContext = createContext<RoomsContextValue | undefined>(undefined);

export const RoomsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { socket, emit, connectionState } = useSocket();
  
  const [rooms, setRooms] = useState<Room[]>([]);
  const [snapcastClients, setSnapcastClients] = useState<SnapcastClient[]>([]);
  const [snapcastGroups, setSnapcastGroups] = useState<SnapcastGroup[]>([]);
  const [snapcastConnected, setSnapcastConnected] = useState(false);
  
  const [latencyConfig, setLatencyConfig] = useState<LatencyConfig>({
    snapcast: 0,
    chromecast: 50,
    bluetooth: 250,
  });
  
  const [activeZones, setActiveZones] = useState<ActiveZones>({
    snapcast: true,
    chromecast: false,
    bluetooth: false,
  });

  // Generate rooms from Snapcast groups and clients
  const generateRooms = useCallback((clients: SnapcastClient[], groups: SnapcastGroup[]) => {
    const newRooms: Room[] = [];
    
    groups.forEach(group => {
      const groupClients = clients.filter(client => client.groupId === group.id);
      const averageVolume = groupClients.length > 0 
        ? Math.round(groupClients.reduce((sum, client) => sum + client.config.volume.percent, 0) / groupClients.length)
        : 0;
      
      newRooms.push({
        id: group.id,
        name: group.name || `Room ${group.id}`,
        clients: groupClients,
        groupId: group.id,
        isActive: groupClients.some(client => client.connected),
        volume: averageVolume,
        muted: group.muted,
      });
    });
    
    // Add individual clients not in any group as separate rooms
    const ungroupedClients = clients.filter(client => 
      !groups.some(group => group.id === client.groupId)
    );
    
    ungroupedClients.forEach(client => {
      newRooms.push({
        id: `client_${client.id}`,
        name: client.config.name || client.host.name,
        clients: [client],
        isActive: client.connected,
        volume: client.config.volume.percent,
        muted: client.config.volume.muted,
      });
    });
    
    setRooms(newRooms);
  }, []);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    socket.on('snapcast_connected', (connected: boolean) => {
      setSnapcastConnected(connected);
    });

    socket.on('snapcast_status', (data) => {
      setSnapcastClients(data.clients || []);
      setSnapcastGroups(data.groups || []);
      generateRooms(data.clients || [], data.groups || []);
    });

    socket.on('latencyUpdate', (data) => {
      setLatencyConfig(data.delays);
      setActiveZones(data.activeZones);
    });

    socket.on('client_volume_changed', (data) => {
      setSnapcastClients(prev => 
        prev.map(client => 
          client.id === data.clientId 
            ? { ...client, config: { ...client.config, volume: data.volume } }
            : client
        )
      );
    });

    socket.on('group_mute_changed', (data) => {
      setSnapcastGroups(prev =>
        prev.map(group =>
          group.id === data.groupId
            ? { ...group, muted: data.muted }
            : group
        )
      );
    });

    return () => {
      socket.off('snapcast_connected');
      socket.off('snapcast_status');
      socket.off('latencyUpdate');
      socket.off('client_volume_changed');
      socket.off('group_mute_changed');
    };
  }, [socket, generateRooms]);

  // Room controls
  const setRoomVolume = useCallback((roomId: string, volume: number) => {
    const room = rooms.find(r => r.id === roomId);
    if (room?.groupId) {
      emit('set_group_volume', { groupId: room.groupId, volume });
    } else {
      // Individual client
      const clientId = room?.clients[0]?.id;
      if (clientId) {
        emit('set_client_volume', { clientId, volume });
      }
    }
  }, [rooms, emit]);

  const muteRoom = useCallback((roomId: string, muted: boolean) => {
    const room = rooms.find(r => r.id === roomId);
    if (room?.groupId) {
      emit('set_group_mute', { groupId: room.groupId, muted });
    } else {
      // Individual client
      const clientId = room?.clients[0]?.id;
      if (clientId) {
        emit('set_client_mute', { clientId, muted });
      }
    }
  }, [rooms, emit]);

  const createRoom = useCallback((name: string, clientIds: string[]) => {
    emit('create_snapcast_group', { name, clientIds });
  }, [emit]);

  const deleteRoom = useCallback((roomId: string) => {
    const room = rooms.find(r => r.id === roomId);
    if (room?.groupId) {
      emit('delete_snapcast_group', { groupId: room.groupId });
    }
  }, [rooms, emit]);

  const renameRoom = useCallback((roomId: string, newName: string) => {
    const room = rooms.find(r => r.id === roomId);
    if (room?.groupId) {
      emit('rename_snapcast_group', { groupId: room.groupId, name: newName });
    }
  }, [rooms, emit]);

  const moveClientToRoom = useCallback((clientId: string, roomId: string) => {
    const room = rooms.find(r => r.id === roomId);
    if (room?.groupId) {
      emit('move_client_to_group', { clientId, groupId: room.groupId });
    }
  }, [rooms, emit]);

  // Group controls
  const setGroupVolume = useCallback((groupId: string, volume: number) => {
    emit('set_group_volume', { groupId, volume });
  }, [emit]);

  const muteGroup = useCallback((groupId: string, muted: boolean) => {
    emit('set_group_mute', { groupId, muted });
  }, [emit]);

  const createGroup = useCallback((name: string, clientIds: string[]) => {
    emit('create_snapcast_group', { name, clientIds });
  }, [emit]);

  const deleteGroup = useCallback((groupId: string) => {
    emit('delete_snapcast_group', { groupId });
  }, [emit]);

  // Client controls
  const setClientVolume = useCallback((clientId: string, volume: number) => {
    emit('set_client_volume', { clientId, volume });
  }, [emit]);

  const muteClient = useCallback((clientId: string, muted: boolean) => {
    emit('set_client_mute', { clientId, muted });
  }, [emit]);

  const renameClient = useCallback((clientId: string, name: string) => {
    emit('rename_client', { clientId, name });
  }, [emit]);

  // Latency controls
  const updateLatencyDelay = useCallback(async (zone: keyof LatencyConfig, delay: number) => {
    try {
      const response = await fetch(`${connectionState.serverAddress}/api/latency/delays`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [zone]: delay }),
      });

      if (response.ok) {
        setLatencyConfig(prev => ({ ...prev, [zone]: delay }));
      }
    } catch (error) {
      console.error('Failed to update latency delay:', error);
    }
  }, [connectionState.serverAddress]);

  const toggleActiveZone = useCallback(async (zone: keyof ActiveZones) => {
    const newValue = !activeZones[zone];
    try {
      const response = await fetch(`${connectionState.serverAddress}/api/latency/zones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [zone]: newValue }),
      });

      if (response.ok) {
        setActiveZones(prev => ({ ...prev, [zone]: newValue }));
      }
    } catch (error) {
      console.error('Failed to toggle active zone:', error);
    }
  }, [activeZones, connectionState.serverAddress]);

  // Snapcast controls
  const refreshSnapcastStatus = useCallback(() => {
    emit('refresh_snapcast_status');
  }, [emit]);

  const reconnectSnapcast = useCallback(() => {
    emit('reconnect_snapcast');
  }, [emit]);

  const contextValue: RoomsContextValue = {
    rooms,
    snapcastClients,
    snapcastGroups,
    snapcastConnected,
    latencyConfig,
    activeZones,
    
    // Room controls
    setRoomVolume,
    muteRoom,
    createRoom,
    deleteRoom,
    renameRoom,
    moveClientToRoom,
    
    // Group controls
    setGroupVolume,
    muteGroup,
    createGroup,
    deleteGroup,
    
    // Client controls
    setClientVolume,
    muteClient,
    renameClient,
    
    // Latency controls
    updateLatencyDelay,
    toggleActiveZone,
    
    // Snapcast controls
    refreshSnapcastStatus,
    reconnectSnapcast,
  };

  return (
    <RoomsContext.Provider value={contextValue}>
      {children}
    </RoomsContext.Provider>
  );
};

export const useRooms = (): RoomsContextValue => {
  const context = useContext(RoomsContext);
  if (!context) {
    throw new Error('useRooms must be used within a RoomsProvider');
  }
  return context;
};