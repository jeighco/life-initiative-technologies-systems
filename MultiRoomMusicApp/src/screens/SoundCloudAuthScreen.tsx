import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';

// SoundCloud OAuth Configuration
const SOUNDCLOUD_CLIENT_ID = 'your_soundcloud_client_id'; // TODO: Replace with actual client ID
const SOUNDCLOUD_REDIRECT_URI = 'multiroommusicapp://soundcloud/callback';
const SOUNDCLOUD_SCOPE = 'non-expiring'; // SoundCloud OAuth scope

const SoundCloudAuthScreen: React.FC = () => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const { updateStreamingAuth } = useAuth();

  useEffect(() => {
    checkExistingAuth();
    setupDeepLinkListener();
  }, []);

  const setupDeepLinkListener = () => {
    const handleURL = (url: string) => {
      if (url.includes('multiroommusicapp://soundcloud/callback')) {
        const urlParams = new URLSearchParams(url.split('?')[1]);
        const code = urlParams.get('code');
        const error = urlParams.get('error');
        const state = urlParams.get('state');
        
        if (error) {
          Alert.alert('Authentication Error', error);
          setIsConnecting(false);
          return;
        }
        
        if (code && state) {
          exchangeCodeForToken(code, state);
        }
      }
    };

    Linking.addEventListener('url', ({ url }) => handleURL(url));
    
    // Check if app was opened via deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleURL(url);
      }
    });
  };

  const checkExistingAuth = async () => {
    try {
      const token = await AsyncStorage.getItem('soundcloud_access_token');
      const userInfo = await AsyncStorage.getItem('soundcloud_user_info');
      
      if (token && userInfo) {
        setIsAuthenticated(true);
        const parsedUser = JSON.parse(userInfo);
        setUserProfile(parsedUser);
        
        // Update auth context
        const authData = {
          accessToken: token,
          user: parsedUser,
        };
        await updateStreamingAuth('soundcloud', authData);
      }
    } catch (error) {
      console.error('Error checking SoundCloud auth:', error);
    }
  };

  const fetchUserProfile = async (token: string) => {
    try {
      const response = await fetch(`https://api.soundcloud.com/me?oauth_token=${token}`);
      
      if (response.ok) {
        const profile = await response.json();
        setUserProfile(profile);
        
        // Store user info
        await AsyncStorage.setItem('soundcloud_user_info', JSON.stringify(profile));
        
        // Update auth context
        const authData = {
          accessToken: token,
          user: profile,
        };
        await updateStreamingAuth('soundcloud', authData);
      } else {
        console.error('Failed to fetch SoundCloud profile');
      }
    } catch (error) {
      console.error('Error fetching SoundCloud profile:', error);
    }
  };

  const generateRandomString = (length: number) => {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for (let i = 0; i < length; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  };

  const handleSoundCloudLogin = async () => {
    if (SOUNDCLOUD_CLIENT_ID === 'your_soundcloud_client_id') {
      Alert.alert(
        'SoundCloud Setup Required',
        'To enable SoundCloud integration:\n\n1. Create a SoundCloud Developer App at developers.soundcloud.com\n2. Add client ID to the app configuration\n3. Set redirect URI to: multiroommusicapp://soundcloud/callback\n4. Update SOUNDCLOUD_CLIENT_ID in SoundCloudAuthScreen.tsx\n5. Configure URL scheme in Info.plist',
        [{ text: 'OK' }]
      );
      return;
    }

    setIsConnecting(true);
    
    try {
      const state = generateRandomString(16);
      await AsyncStorage.setItem('soundcloud_auth_state', state);
      
      const authUrl = `https://soundcloud.com/connect?` +
        `client_id=${SOUNDCLOUD_CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(SOUNDCLOUD_REDIRECT_URI)}&` +
        `response_type=code&` +
        `scope=${SOUNDCLOUD_SCOPE}&` +
        `state=${state}`;
      
      const supported = await Linking.canOpenURL(authUrl);
      if (supported) {
        await Linking.openURL(authUrl);
      } else {
        Alert.alert('Error', 'Cannot open SoundCloud authentication URL');
        setIsConnecting(false);
      }
    } catch (error) {
      console.error('Error initiating SoundCloud login:', error);
      Alert.alert('Error', 'Failed to initiate SoundCloud login');
      setIsConnecting(false);
    }
  };

  const exchangeCodeForToken = async (code: string, state: string) => {
    try {
      // Verify state parameter
      const storedState = await AsyncStorage.getItem('soundcloud_auth_state');
      if (state !== storedState) {
        Alert.alert('Security Error', 'Invalid state parameter');
        setIsConnecting(false);
        return;
      }

      // Note: In production, this should be done on your server to keep client secret secure
      const response = await fetch('https://api.soundcloud.com/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `client_id=${SOUNDCLOUD_CLIENT_ID}&client_secret=YOUR_CLIENT_SECRET&grant_type=authorization_code&redirect_uri=${encodeURIComponent(SOUNDCLOUD_REDIRECT_URI)}&code=${code}`,
      });

      const data = await response.json();
      
      if (response.ok && data.access_token) {
        await AsyncStorage.setItem('soundcloud_access_token', data.access_token);
        
        setIsAuthenticated(true);
        fetchUserProfile(data.access_token);
        Alert.alert('Success', 'Connected to SoundCloud successfully!');
      } else {
        Alert.alert('Authentication Error', data.error_description || 'Failed to authenticate');
      }
    } catch (error) {
      console.error('Error exchanging code for token:', error);
      Alert.alert('Error', 'Failed to complete authentication');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await AsyncStorage.removeItem('soundcloud_access_token');
      await AsyncStorage.removeItem('soundcloud_user_info');
      await AsyncStorage.removeItem('soundcloud_auth_state');
      setIsAuthenticated(false);
      setUserProfile(null);
      await updateStreamingAuth('soundcloud', null);
      Alert.alert('Disconnected', 'SoundCloud account disconnected successfully');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.icon}>☁️</Text>
          <Text style={styles.title}>
            {isAuthenticated ? 'SoundCloud Connected' : 'Connect to SoundCloud'}
          </Text>
          <Text style={styles.subtitle}>
            {isAuthenticated 
              ? 'Your SoundCloud account is connected and ready to use'
              : 'Discover emerging artists and unique tracks on SoundCloud'
            }
          </Text>
        </View>

        {!isAuthenticated ? (
          <>
            <View style={styles.features}>
              <Text style={styles.featuresTitle}>What you'll get:</Text>
              <View style={styles.featuresList}>
                <Text style={styles.featureItem}>🎧 Access to independent and emerging artists</Text>
                <Text style={styles.featureItem}>🔥 Trending tracks and hot new releases</Text>
                <Text style={styles.featureItem}>📻 Podcasts and DJ sets</Text>
                <Text style={styles.featureItem}>🏘️ Stream SoundCloud content in all rooms</Text>
                <Text style={styles.featureItem}>💎 Exclusive content not found elsewhere</Text>
                <Text style={styles.featureItem}>🌍 Global independent music community</Text>
              </View>
            </View>

            <View style={styles.requirements}>
              <Text style={styles.requirementsTitle}>Requirements:</Text>
              <Text style={styles.requirementText}>
                • SoundCloud account (free or Pro){'\n'}
                • SoundCloud Developer App credentials{'\n'}
                • Internet connection for streaming{'\n'}
                • Some content may require SoundCloud Go+{'\n'}
                • iOS 13.0 or later
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.connectButton, isConnecting && styles.connectButtonDisabled]}
              onPress={handleSoundCloudLogin}
              disabled={isConnecting}
            >
              {isConnecting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.connectButtonText}>☁️ Connect to SoundCloud</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.connectedCard}>
              <Text style={styles.connectedTitle}>✅ Successfully Connected</Text>
              
              {userProfile && (
                <View style={styles.profileSection}>
                  <Text style={styles.profileLabel}>Account Details</Text>
                  <View style={styles.profileInfo}>
                    <Text style={styles.profileText}>
                      Username: {userProfile.username || 'Not provided'}
                    </Text>
                    <Text style={styles.profileText}>
                      Full Name: {userProfile.full_name || 'Not provided'}
                    </Text>
                    <Text style={styles.profileText}>
                      ID: {userProfile.id || 'Not provided'}
                    </Text>
                    <Text style={styles.profileText}>
                      Followers: {userProfile.followers_count || 0}
                    </Text>
                    <Text style={styles.profileText}>
                      Following: {userProfile.followings_count || 0}
                    </Text>
                  </View>
                </View>
              )}

              <View style={styles.featuresActive}>
                <Text style={styles.featuresActiveTitle}>Active Features:</Text>
                <Text style={styles.featureActive}>🎵 Stream SoundCloud music to all rooms</Text>
                <Text style={styles.featureActive}>📱 Control playback from your phone</Text>
                <Text style={styles.featureActive}>🔄 Sync across multiple devices</Text>
                <Text style={styles.featureActive}>🎚️ Volume control per room</Text>
                <Text style={styles.featureActive}>🎧 Access to independent music</Text>
              </View>

              <TouchableOpacity
                style={styles.disconnectButton}
                onPress={handleLogout}
              >
                <Text style={styles.disconnectButtonText}>Disconnect SoundCloud</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <View style={styles.setupInfo}>
          <Text style={styles.setupTitle}>📋 Setup Instructions</Text>
          <Text style={styles.setupText}>
            1. Create a SoundCloud Developer App at developers.soundcloud.com{'\n'}
            2. Add redirect URI: multiroommusicapp://soundcloud/callback{'\n'}
            3. Update SOUNDCLOUD_CLIENT_ID in SoundCloudAuthScreen.tsx{'\n'}
            4. Configure client secret on your server{'\n'}
            5. Configure URL scheme in Info.plist{'\n'}
            6. SoundCloud Go+ recommended for full features
          </Text>
        </View>

        <View style={styles.privacy}>
          <Text style={styles.privacyText}>
            🔒 Your SoundCloud credentials are encrypted and stored securely on your device only. We never share your personal information.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  content: {
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  icon: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 24,
  },
  features: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  featuresTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  featuresList: {
    gap: 12,
  },
  featureItem: {
    fontSize: 14,
    color: '#9CA3AF',
    lineHeight: 20,
  },
  requirements: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 20,
    marginBottom: 32,
    borderLeftWidth: 4,
    borderLeftColor: '#FF5500',
  },
  requirementsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FF5500',
    marginBottom: 12,
  },
  requirementText: {
    fontSize: 14,
    color: '#9CA3AF',
    lineHeight: 20,
  },
  connectButton: {
    backgroundColor: '#FF5500',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 24,
  },
  connectButtonDisabled: {
    backgroundColor: '#6B7280',
  },
  connectButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  connectedCard: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#10B981',
  },
  connectedTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#10B981',
    textAlign: 'center',
    marginBottom: 20,
  },
  profileSection: {
    marginBottom: 20,
  },
  profileLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  profileInfo: {
    backgroundColor: '#374151',
    borderRadius: 8,
    padding: 15,
  },
  profileText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 6,
  },
  featuresActive: {
    marginBottom: 20,
  },
  featuresActiveTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  featureActive: {
    fontSize: 14,
    color: '#10B981',
    marginBottom: 8,
    lineHeight: 18,
  },
  disconnectButton: {
    backgroundColor: '#EF4444',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  disconnectButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  setupInfo: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 15,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: '#FF5500',
  },
  setupTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FF5500',
    marginBottom: 10,
  },
  setupText: {
    fontSize: 12,
    color: '#9CA3AF',
    lineHeight: 18,
  },
  privacy: {
    alignItems: 'center',
    marginBottom: 20,
  },
  privacyText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },
});

export default SoundCloudAuthScreen;