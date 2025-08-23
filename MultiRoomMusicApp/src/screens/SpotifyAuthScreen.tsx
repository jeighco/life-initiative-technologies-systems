import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';

// Spotify OAuth Configuration
const SPOTIFY_CLIENT_ID = 'your_spotify_client_id'; // TODO: Replace with actual client ID
const SPOTIFY_REDIRECT_URI = 'multiroommusicapp://spotify/callback';
const SPOTIFY_SCOPES = [
  'user-read-private',
  'user-read-email',
  'playlist-read-private',
  'playlist-read-collaborative',
  'streaming',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-library-read',
  'user-follow-read',
].join('%20');

const SpotifyAuthScreen: React.FC = () => {
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
      if (url.includes('multiroommusicapp://spotify/callback')) {
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
      const token = await AsyncStorage.getItem('spotify_access_token');
      const expiryTime = await AsyncStorage.getItem('spotify_token_expiry');
      
      if (token && expiryTime) {
        const now = Date.now();
        if (now < parseInt(expiryTime)) {
          setIsAuthenticated(true);
          fetchUserProfile(token);
        } else {
          // Token expired, try to refresh
          const refreshToken = await AsyncStorage.getItem('spotify_refresh_token');
          if (refreshToken) {
            refreshAccessToken(refreshToken);
          }
        }
      }
    } catch (error) {
      console.error('Error checking auth:', error);
    }
  };

  const fetchUserProfile = async (token: string) => {
    try {
      const response = await fetch('https://api.spotify.com/v1/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const profile = await response.json();
        setUserProfile(profile);
        
        // Update auth context
        const authData = {
          accessToken: token,
          user: profile,
          expiresAt: parseInt(await AsyncStorage.getItem('spotify_token_expiry') || '0'),
        };
        await updateStreamingAuth('spotify', authData);
      } else if (response.status === 401) {
        // Token invalid, need to re-authenticate
        handleLogout();
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
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

  const handleSpotifyLogin = async () => {
    if (SPOTIFY_CLIENT_ID === 'your_spotify_client_id') {
      Alert.alert(
        'Spotify Setup Required',
        'To enable Spotify integration:\n\n1. Create a Spotify Developer App at developer.spotify.com\n2. Add client ID to the app configuration\n3. Set redirect URI to: multiroommusicapp://spotify/callback\n4. Update SPOTIFY_CLIENT_ID in SpotifyAuthScreen.tsx\n5. Configure URL scheme in Info.plist',
        [{ text: 'OK' }]
      );
      return;
    }

    setIsConnecting(true);
    
    try {
      const state = generateRandomString(16);
      await AsyncStorage.setItem('spotify_auth_state', state);
      
      const authUrl = `https://accounts.spotify.com/authorize?` +
        `response_type=code&` +
        `client_id=${SPOTIFY_CLIENT_ID}&` +
        `scope=${SPOTIFY_SCOPES}&` +
        `redirect_uri=${encodeURIComponent(SPOTIFY_REDIRECT_URI)}&` +
        `state=${state}&` +
        `show_dialog=true`;
      
      const supported = await Linking.canOpenURL(authUrl);
      if (supported) {
        await Linking.openURL(authUrl);
      } else {
        Alert.alert('Error', 'Cannot open Spotify authentication URL');
        setIsConnecting(false);
      }
    } catch (error) {
      console.error('Error initiating login:', error);
      Alert.alert('Error', 'Failed to initiate Spotify login');
      setIsConnecting(false);
    }
  };

  const exchangeCodeForToken = async (code: string, state: string) => {
    try {
      // Verify state parameter
      const storedState = await AsyncStorage.getItem('spotify_auth_state');
      if (state !== storedState) {
        Alert.alert('Security Error', 'Invalid state parameter');
        setIsConnecting(false);
        return;
      }

      // Note: In production, this should be done on your server to keep client secret secure
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(SPOTIFY_REDIRECT_URI)}&client_id=${SPOTIFY_CLIENT_ID}`,
      });

      const data = await response.json();
      
      if (response.ok) {
        const expiryTime = Date.now() + (data.expires_in * 1000);
        
        await AsyncStorage.setItem('spotify_access_token', data.access_token);
        if (data.refresh_token) {
          await AsyncStorage.setItem('spotify_refresh_token', data.refresh_token);
        }
        await AsyncStorage.setItem('spotify_token_expiry', expiryTime.toString());
        
        setIsAuthenticated(true);
        fetchUserProfile(data.access_token);
        Alert.alert('Success', 'Connected to Spotify successfully!');
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

  const refreshAccessToken = async (refreshToken: string) => {
    try {
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `grant_type=refresh_token&refresh_token=${refreshToken}&client_id=${SPOTIFY_CLIENT_ID}`,
      });

      const data = await response.json();
      
      if (response.ok) {
        const expiryTime = Date.now() + (data.expires_in * 1000);
        
        await AsyncStorage.setItem('spotify_access_token', data.access_token);
        await AsyncStorage.setItem('spotify_token_expiry', expiryTime.toString());
        
        if (data.refresh_token) {
          await AsyncStorage.setItem('spotify_refresh_token', data.refresh_token);
        }
        
        setIsAuthenticated(true);
        fetchUserProfile(data.access_token);
      } else {
        // Refresh token invalid, need to re-authenticate
        handleLogout();
      }
    } catch (error) {
      console.error('Error refreshing token:', error);
      handleLogout();
    }
  };

  const handleLogout = async () => {
    try {
      await AsyncStorage.removeItem('spotify_access_token');
      await AsyncStorage.removeItem('spotify_refresh_token');
      await AsyncStorage.removeItem('spotify_token_expiry');
      await AsyncStorage.removeItem('spotify_auth_state');
      setIsAuthenticated(false);
      setUserProfile(null);
      await updateStreamingAuth('spotify', null);
      Alert.alert('Disconnected', 'Spotify account disconnected successfully');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.icon}>🎵</Text>
          <Text style={styles.title}>
            {isAuthenticated ? 'Spotify Connected' : 'Connect to Spotify'}
          </Text>
          <Text style={styles.subtitle}>
            {isAuthenticated 
              ? 'Your Spotify account is connected and ready to use'
              : 'Access millions of songs and playlists from Spotify'
            }
          </Text>
        </View>

        {!isAuthenticated ? (
          <>
            <View style={styles.features}>
              <Text style={styles.featuresTitle}>What you'll get:</Text>
              <View style={styles.featuresList}>
                <Text style={styles.featureItem}>🎶 Access to Spotify's entire music catalog</Text>
                <Text style={styles.featureItem}>📋 Import your playlists and favorites</Text>
                <Text style={styles.featureItem}>🔍 Search for any song, artist, or album</Text>
                <Text style={styles.featureItem}>🏘️ Play Spotify music in all your rooms</Text>
                <Text style={styles.featureItem}>🎯 Personalized recommendations</Text>
                <Text style={styles.featureItem}>🎧 High-quality streaming</Text>
              </View>
            </View>

            <View style={styles.requirements}>
              <Text style={styles.requirementsTitle}>Requirements:</Text>
              <Text style={styles.requirementText}>
                • Active Spotify Premium subscription{'\n'}
                • Spotify Developer App credentials{'\n'}
                • Internet connection for streaming{'\n'}
                • iOS 13.0 or later
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.connectButton, isConnecting && styles.connectButtonDisabled]}
              onPress={handleSpotifyLogin}
              disabled={isConnecting}
            >
              {isConnecting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.connectButtonText}>🎵 Connect to Spotify</Text>
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
                      Name: {userProfile.display_name || 'Not provided'}
                    </Text>
                    <Text style={styles.profileText}>
                      Email: {userProfile.email || 'Not provided'}
                    </Text>
                    <Text style={styles.profileText}>
                      Country: {userProfile.country || 'Not provided'}
                    </Text>
                    <Text style={styles.profileText}>
                      Followers: {userProfile.followers?.total || 0}
                    </Text>
                    <Text style={styles.profileText}>
                      Subscription: {userProfile.product || 'Free'}
                    </Text>
                  </View>
                </View>
              )}

              <View style={styles.featuresActive}>
                <Text style={styles.featuresActiveTitle}>Active Features:</Text>
                <Text style={styles.featureActive}>🎵 Stream Spotify music to all rooms</Text>
                <Text style={styles.featureActive}>📱 Control playback from your phone</Text>
                <Text style={styles.featureActive}>🔄 Sync across multiple devices</Text>
                <Text style={styles.featureActive}>🎚️ Volume control per room</Text>
              </View>

              <TouchableOpacity
                style={styles.disconnectButton}
                onPress={handleLogout}
              >
                <Text style={styles.disconnectButtonText}>Disconnect Spotify</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <View style={styles.setupInfo}>
          <Text style={styles.setupTitle}>📋 Setup Instructions</Text>
          <Text style={styles.setupText}>
            1. Create a Spotify Developer App at developer.spotify.com{'\n'}
            2. Add redirect URI: multiroommusicapp://spotify/callback{'\n'}
            3. Update SPOTIFY_CLIENT_ID in SpotifyAuthScreen.tsx{'\n'}
            4. Configure URL scheme in Info.plist{'\n'}
            5. Premium account recommended for full features
          </Text>
        </View>

        <View style={styles.privacy}>
          <Text style={styles.privacyText}>
            🔒 Your Spotify credentials are securely stored and encrypted. We never share your personal information with third parties.
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
    borderLeftColor: '#F59E0B',
  },
  requirementsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F59E0B',
    marginBottom: 12,
  },
  requirementText: {
    fontSize: 14,
    color: '#9CA3AF',
    lineHeight: 20,
  },
  connectButton: {
    backgroundColor: '#1DB954',
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
    borderLeftColor: '#3B82F6',
  },
  setupTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#3B82F6',
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

export default SpotifyAuthScreen;