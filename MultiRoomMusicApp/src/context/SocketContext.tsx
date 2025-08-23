import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import DeviceInfo from 'react-native-device-info';
import NetInfo from '@react-native-community/netinfo';
import { ConnectionState, DeviceInfo as DeviceInfoType } from '../types';

interface SocketContextValue {
  socket: Socket | null;
  connectionState: ConnectionState;
  deviceInfo: DeviceInfoType;
  connect: () => void;
  disconnect: () => void;
  emit: (event: string, data?: any) => void;
}

const SocketContext = createContext<SocketContextValue | undefined>(undefined);

const SERVER_IP = '192.168.12.125';
const SERVER_PORT = 3000;

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    status: 'disconnected',
    serverAddress: `http://${SERVER_IP}:${SERVER_PORT}`,
  });
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfoType>({
    name: '',
    type: '',
    ipAddress: '',
    isConnectedViaWifi: false,
    isConnectedViaBluetooth: false,
  });

  const detectDevice = useCallback(async () => {
    try {
      const deviceName = await DeviceInfo.getDeviceName();
      const deviceType = await DeviceInfo.getDeviceType();
      const ipAddress = await DeviceInfo.getIpAddress();
      
      setDeviceInfo(prev => ({
        ...prev,
        name: deviceName,
        type: deviceType,
        ipAddress,
      }));
    } catch (error) {
      console.error('Failed to get device info:', error);
    }
  }, []);

  const detectNetworkType = useCallback(async () => {
    try {
      const netInfo = await NetInfo.fetch();
      setDeviceInfo(prev => ({
        ...prev,
        isConnectedViaWifi: netInfo.type === 'wifi' && netInfo.isConnected === true,
        isConnectedViaBluetooth: netInfo.type === 'bluetooth' && netInfo.isConnected === true,
      }));
    } catch (error) {
      console.error('Failed to detect network type:', error);
    }
  }, []);

  const connect = useCallback(() => {
    if (socket?.connected) {
      return;
    }

    setConnectionState(prev => ({ ...prev, status: 'connecting', error: undefined }));

    try {
      const newSocket = io(connectionState.serverAddress, {
        timeout: 20000,
        transports: ['polling', 'websocket'],
        forceNew: true,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 10000,
      });

      newSocket.on('connect', () => {
        console.log('✅ Connected to server');
        setConnectionState(prev => ({ 
          ...prev, 
          status: 'connected', 
          error: undefined,
          lastConnected: Date.now()
        }));
        setSocket(newSocket);
      });

      newSocket.on('disconnect', (reason) => {
        console.log('❌ Disconnected from server:', reason);
        setConnectionState(prev => ({ ...prev, status: 'disconnected' }));
      });

      newSocket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        setConnectionState(prev => ({
          ...prev,
          status: 'error',
          error: {
            code: 'CONNECTION_ERROR',
            message: `Unable to connect to music server at ${connectionState.serverAddress}. Check if server is running on port ${SERVER_PORT}.`,
          },
        }));
      });

      newSocket.connect();
    } catch (error) {
      console.error('Failed to create socket:', error);
      setConnectionState(prev => ({
        ...prev,
        status: 'error',
        error: {
          code: 'SOCKET_CREATION_ERROR',
          message: 'Failed to initialize connection',
        },
      }));
    }
  }, [connectionState.serverAddress, socket]);

  const disconnect = useCallback(() => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
      setConnectionState(prev => ({ ...prev, status: 'disconnected' }));
    }
  }, [socket]);

  const emit = useCallback((event: string, data?: any) => {
    if (socket?.connected) {
      socket.emit(event, data);
    } else {
      console.warn('Cannot emit event - socket not connected');
    }
  }, [socket]);

  useEffect(() => {
    detectDevice();
    detectNetworkType();

    const unsubscribe = NetInfo.addEventListener(detectNetworkType);
    
    return unsubscribe;
  }, [detectDevice, detectNetworkType]);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, []);

  const contextValue: SocketContextValue = {
    socket,
    connectionState,
    deviceInfo,
    connect,
    disconnect,
    emit,
  };

  return (
    <SocketContext.Provider value={contextValue}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = (): SocketContextValue => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};