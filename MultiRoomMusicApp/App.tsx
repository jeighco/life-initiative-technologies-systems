/**
 * Multi-Room Music iOS App - Enhanced Version
 * Complete multi-room music platform with streaming service integration
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar, View, Text, TouchableOpacity } from 'react-native';

// Screens
import HomeScreen from './src/screens/HomeScreen';
import RoomsScreen from './src/screens/RoomsScreen';
import LibraryScreen from './src/screens/LibraryScreen';
import StreamingScreen from './src/screens/StreamingScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import QueueScreen from './src/screens/QueueScreen';
import CastScreen from './src/screens/CastScreen';
import LoginScreen from './src/screens/LoginScreen';
import SpotifyAuthScreen from './src/screens/SpotifyAuthScreen';
import AppleMusicAuthScreen from './src/screens/AppleMusicAuthScreen';
import SoundCloudAuthScreen from './src/screens/SoundCloudAuthScreen';

// Context Providers
import { SocketProvider } from './src/context/SocketContext';
import { AuthProvider } from './src/context/AuthContext';
import { MusicProvider } from './src/context/MusicContext';
import { RoomsProvider } from './src/context/RoomsContext';
import { CastProvider } from './src/context/CastContext';

// Components
import Playbar from './src/components/Playbar';
import ErrorBoundary from './src/components/ErrorBoundary';

// Types
import { RootTabParamList, RootStackParamList } from './src/types/navigation';

const Tab = createBottomTabNavigator<RootTabParamList>();
const Stack = createStackNavigator<RootStackParamList>();

// Main Tab Navigator with Playbar
const MainTabNavigator = () => {
  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        initialRouteName="Home"
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color, size }) => {
            const iconMap: Record<string, string> = {
              home: '🏠',
              rooms: '🏘️',
              library: '📚',
              queue: '📝',
              streaming: '🎵',
              cast: '📺',
              settings: '⚙️',
            };
            const iconName = iconMap[route.name.toLowerCase()] || '🎵';
            return (
              <Text style={{ fontSize: size || 20, color: color || '#FFFFFF' }}>
                {iconName}
              </Text>
            );
          },
          tabBarActiveTintColor: '#3B82F6',
          tabBarInactiveTintColor: '#9CA3AF',
          tabBarStyle: {
            backgroundColor: '#1F2937',
            borderTopColor: '#374151',
          },
          headerStyle: {
            backgroundColor: '#111827',
          },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        })}
      >
        <Tab.Screen 
          name="Home" 
          component={HomeScreen}
          options={{ title: '🎵 Multi-Room Music' }}
        />
        <Tab.Screen 
          name="Rooms" 
          component={RoomsScreen}
          options={{ title: '🏘️ Room Control' }}
        />
        <Tab.Screen 
          name="Library" 
          component={LibraryScreen}
          options={{ title: '📚 Music Library' }}
        />
        <Tab.Screen 
          name="Queue" 
          component={QueueScreen}
          options={{ title: '📝 Queue' }}
        />
        <Tab.Screen 
          name="Streaming" 
          component={StreamingScreen}
          options={{ title: '🎵 Streaming Services' }}
        />
        <Tab.Screen 
          name="Cast" 
          component={CastScreen}
          options={{ title: '📺 Cast to TV' }}
        />
        <Tab.Screen 
          name="Settings" 
          component={SettingsScreen}
          options={{ title: '⚙️ Settings' }}
        />
      </Tab.Navigator>
      <Playbar />
    </View>
  );
};

// Root Stack Navigator
const RootNavigator = () => {
  return (
    <Stack.Navigator
      initialRouteName="Main"
      screenOptions={{
        headerStyle: {
          backgroundColor: '#111827',
        },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Stack.Screen 
        name="Main" 
        component={MainTabNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="Login" 
        component={LoginScreen}
        options={{ title: '🔐 Authentication' }}
      />
      <Stack.Screen 
        name="SpotifyAuth" 
        component={SpotifyAuthScreen}
        options={{ title: '🎵 Spotify Login' }}
      />
      <Stack.Screen 
        name="AppleMusicAuth" 
        component={AppleMusicAuthScreen}
        options={{ title: '🍎 Apple Music Login' }}
      />
      <Stack.Screen 
        name="SoundCloudAuth" 
        component={SoundCloudAuthScreen}
        options={{ title: '☁️ SoundCloud Login' }}
      />
    </Stack.Navigator>
  );
};

// Main App Component
const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <View style={{ flex: 1 }}>
        <StatusBar barStyle="light-content" backgroundColor="#111827" />
        <AuthProvider>
          <SocketProvider>
            <MusicProvider>
              <RoomsProvider>
                <CastProvider>
                  <NavigationContainer>
                    <RootNavigator />
                  </NavigationContainer>
                </CastProvider>
              </RoomsProvider>
            </MusicProvider>
          </SocketProvider>
        </AuthProvider>
      </View>
    </ErrorBoundary>
  );
};

// Minimal test to debug white screen
const MinimalApp = () => {
  console.log('🧪 MinimalApp is rendering');
  
  const openDevMenu = () => {
    const DevMenu = require('react-native').NativeModules?.DevMenu;
    if (DevMenu) {
      DevMenu.show();
    }
  };

  // Force visible colors for debugging
  return (
    <View style={{ 
      flex: 1, 
      backgroundColor: '#FF0000', // Bright red background to ensure visibility
      justifyContent: 'center', 
      alignItems: 'center',
      padding: 20
    }}>
      <Text style={{ 
        color: '#FFFFFF', 
        fontSize: 24,
        fontWeight: 'bold',
        textAlign: 'center',
        backgroundColor: '#000000', // Black background for contrast
        padding: 10
      }}>
        🎵 TEST APP WORKING!
      </Text>
      <Text style={{ 
        color: '#FFFF00', 
        fontSize: 16,
        textAlign: 'center',
        marginTop: 20 
      }}>
        JavaScript is executing! 🎉
      </Text>
      <TouchableOpacity
        style={{
          backgroundColor: '#0066CC',
          padding: 15,
          borderRadius: 10,
          marginTop: 30
        }}
        onPress={openDevMenu}
      >
        <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' }}>
          Open Debug Menu
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default MinimalApp;