import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import { AuthState } from '../types';

interface AuthContextValue {
  authState: AuthState;
  login: (credentials: any) => Promise<void>;
  logout: () => Promise<void>;
  updateStreamingAuth: (service: 'spotify' | 'apple' | 'soundcloud', authData: any) => Promise<void>;
  removeStreamingAuth: (service: 'spotify' | 'apple' | 'soundcloud') => Promise<void>;
  isStreamingServiceConnected: (service: 'spotify' | 'apple' | 'soundcloud') => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const AUTH_STORAGE_KEY = 'multiroom_auth';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    streamingServices: {},
  });

  // Load authentication state from storage
  const loadAuthState = useCallback(async () => {
    try {
      // Load basic auth state
      const storedAuth = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
      if (storedAuth) {
        const parsedAuth = JSON.parse(storedAuth);
        setAuthState(prev => ({ ...prev, ...parsedAuth }));
      }

      // Load streaming service tokens from Keychain
      const streamingServices: any = {};
      
      try {
        const spotifyCredentials = await Keychain.getInternetCredentials('spotify_auth');
        if (spotifyCredentials) {
          streamingServices.spotify = JSON.parse(spotifyCredentials.password);
        }
      } catch (error) {
        console.log('No Spotify credentials found');
      }

      try {
        const appleCredentials = await Keychain.getInternetCredentials('apple_auth');
        if (appleCredentials) {
          streamingServices.apple = JSON.parse(appleCredentials.password);
        }
      } catch (error) {
        console.log('No Apple Music credentials found');
      }

      try {
        const soundcloudCredentials = await Keychain.getInternetCredentials('soundcloud_auth');
        if (soundcloudCredentials) {
          streamingServices.soundcloud = JSON.parse(soundcloudCredentials.password);
        }
      } catch (error) {
        console.log('No SoundCloud credentials found');
      }

      setAuthState(prev => ({ ...prev, streamingServices }));
    } catch (error) {
      console.error('Failed to load auth state:', error);
    }
  }, []);

  // Save authentication state to storage
  const saveAuthState = useCallback(async (newAuthState: AuthState) => {
    try {
      const { streamingServices, ...basicAuth } = newAuthState;
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(basicAuth));
    } catch (error) {
      console.error('Failed to save auth state:', error);
    }
  }, []);

  // Login function
  const login = useCallback(async (credentials: any) => {
    try {
      // For now, we'll use a simple authentication
      // In a real app, you'd validate credentials with your server
      const newAuthState: AuthState = {
        isAuthenticated: true,
        user: {
          id: 'user_1',
          name: credentials.name || 'Music Lover',
          email: credentials.email,
        },
        streamingServices: authState.streamingServices,
      };
      
      setAuthState(newAuthState);
      await saveAuthState(newAuthState);
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }, [authState.streamingServices, saveAuthState]);

  // Logout function
  const logout = useCallback(async () => {
    try {
      // Clear all stored credentials
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
      await Keychain.resetInternetCredentials('spotify_auth');
      await Keychain.resetInternetCredentials('apple_auth');
      await Keychain.resetInternetCredentials('soundcloud_auth');
      
      setAuthState({
        isAuthenticated: false,
        streamingServices: {},
      });
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }, []);

  // Update streaming service authentication
  const updateStreamingAuth = useCallback(async (
    service: 'spotify' | 'apple' | 'soundcloud', 
    authData: any
  ) => {
    try {
      // Store in Keychain for security
      await Keychain.setInternetCredentials(
        `${service}_auth`,
        service,
        JSON.stringify(authData)
      );

      // Update state
      setAuthState(prev => ({
        ...prev,
        streamingServices: {
          ...prev.streamingServices,
          [service]: authData,
        },
      }));
    } catch (error) {
      console.error(`Failed to update ${service} auth:`, error);
      throw error;
    }
  }, []);

  // Remove streaming service authentication
  const removeStreamingAuth = useCallback(async (
    service: 'spotify' | 'apple' | 'soundcloud'
  ) => {
    try {
      await Keychain.resetInternetCredentials(`${service}_auth`);
      
      setAuthState(prev => {
        const newStreamingServices = { ...prev.streamingServices };
        delete newStreamingServices[service];
        return {
          ...prev,
          streamingServices: newStreamingServices,
        };
      });
    } catch (error) {
      console.error(`Failed to remove ${service} auth:`, error);
    }
  }, []);

  // Check if streaming service is connected
  const isStreamingServiceConnected = useCallback((
    service: 'spotify' | 'apple' | 'soundcloud'
  ): boolean => {
    const serviceAuth = authState.streamingServices[service];
    if (!serviceAuth) return false;

    // Check if token is expired (for services that have expiration)
    if (service === 'spotify' && serviceAuth.expiresAt) {
      return Date.now() < serviceAuth.expiresAt;
    }

    return true;
  }, [authState.streamingServices]);

  useEffect(() => {
    loadAuthState();
  }, [loadAuthState]);

  const contextValue: AuthContextValue = {
    authState,
    login,
    logout,
    updateStreamingAuth,
    removeStreamingAuth,
    isStreamingServiceConnected,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};