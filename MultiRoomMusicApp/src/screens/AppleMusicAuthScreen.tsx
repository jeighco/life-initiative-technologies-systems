import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useMusic } from '../context/MusicContext';
import { STREAMING_CONFIG } from '../config/streaming';

const AppleMusicAuthScreen: React.FC = () => {
  const [isConnecting, setIsConnecting] = useState(false);
  const { 
    requestAppleMusicAuth, 
    signOutAppleMusic, 
    isAppleMusicAuthorized 
  } = useMusic();

  const handleAppleMusicLogin = async () => {
    if (isConnecting) return;

    setIsConnecting(true);
    try {
      console.log('🍎 Starting Apple Music authentication...');
      const success = await requestAppleMusicAuth();
      
      if (success) {
        Alert.alert(
          '🎉 Success!',
          'You are now connected to Apple Music. You can access your full music library and stream full tracks.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          '❌ Authentication Failed',
          'Could not authenticate with Apple Music. Please make sure you have an active Apple Music subscription and try again.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Apple Music authentication error:', error);
      Alert.alert(
        '❌ Error',
        'An error occurred during Apple Music authentication. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSignOut = async () => {
    Alert.alert(
      '🚪 Sign Out',
      'Are you sure you want to sign out of Apple Music?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOutAppleMusic();
              Alert.alert('✅ Signed Out', 'You have been signed out of Apple Music.');
            } catch (error) {
              console.error('Sign out error:', error);
              Alert.alert('❌ Error', 'Failed to sign out. Please try again.');
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <Text style={styles.headerIcon}>🍎</Text>
        <Text style={styles.title}>Apple Music</Text>
        <Text style={styles.subtitle}>Connect to access your full music library</Text>
      </View>

      <View style={styles.configInfo}>
        <Text style={styles.configTitle}>🔧 Configuration</Text>
        <View style={styles.configItem}>
          <Text style={styles.configLabel}>Team ID:</Text>
          <Text style={styles.configValue}>{STREAMING_CONFIG.APPLE_MUSIC.TEAM_ID}</Text>
        </View>
        <View style={styles.configItem}>
          <Text style={styles.configLabel}>Key ID:</Text>
          <Text style={styles.configValue}>{STREAMING_CONFIG.APPLE_MUSIC.KEY_ID}</Text>
        </View>
        <View style={styles.configItem}>
          <Text style={styles.configLabel}>Bundle ID:</Text>
          <Text style={styles.configValue}>com.iniviv.multiroommusicapp</Text>
        </View>
      </View>

      {!isAppleMusicAuthorized ? (
        <View style={styles.authSection}>
          <View style={styles.featuresList}>
            <Text style={styles.featuresTitle}>🎵 What you'll get:</Text>
            <Text style={styles.featureItem}>• Access to 100+ million songs</Text>
            <Text style={styles.featureItem}>• Full track playback (not just previews)</Text>
            <Text style={styles.featureItem}>• Your personal music library</Text>
            <Text style={styles.featureItem}>• Curated playlists and recommendations</Text>
            <Text style={styles.featureItem}>• High-quality audio streaming</Text>
          </View>

          <View style={styles.requirementBox}>
            <Text style={styles.requirementTitle}>⚠️ Requirements</Text>
            <Text style={styles.requirementText}>
              You need an active Apple Music subscription to use this feature.
              If you don't have one, you can sign up in the Apple Music app.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.loginButton, isConnecting && styles.loginButtonDisabled]}
            onPress={handleAppleMusicLogin}
            disabled={isConnecting}
          >
            {isConnecting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.loginButtonText}>🍎 Connect Apple Music</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.disclaimer}>
            By connecting, you authorize this app to access your Apple Music account.
            Your credentials are handled securely by Apple's MusicKit framework.
          </Text>
        </View>
      ) : (
        <View style={styles.connectedSection}>
          <View style={styles.statusCard}>
            <Text style={styles.statusIcon}>✅</Text>
            <Text style={styles.statusTitle}>Connected to Apple Music</Text>
            <Text style={styles.statusDescription}>
              You can now search and play full tracks from Apple Music's catalog.
            </Text>
          </View>

          <View style={styles.capabilitiesList}>
            <Text style={styles.capabilitiesTitle}>🎯 Available Features:</Text>
            <Text style={styles.capabilityItem}>✓ Search Apple Music catalog</Text>
            <Text style={styles.capabilityItem}>✓ Play full tracks (no 30s limit)</Text>
            <Text style={styles.capabilityItem}>✓ Access your music library</Text>
            <Text style={styles.capabilityItem}>✓ Add songs to multi-room queue</Text>
            <Text style={styles.capabilityItem}>✓ High-quality audio streaming</Text>
          </View>

          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <Text style={styles.signOutButtonText}>🚪 Sign Out</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.helpSection}>
        <Text style={styles.helpTitle}>❓ Need Help?</Text>
        <Text style={styles.helpText}>
          If you're having trouble connecting, make sure:
        </Text>
        <Text style={styles.helpItem}>• You have an active Apple Music subscription</Text>
        <Text style={styles.helpItem}>• You're signed in to your Apple ID</Text>
        <Text style={styles.helpItem}>• Your device has internet connectivity</Text>
        <Text style={styles.helpItem}>• The app has permission to access Apple Music</Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  contentContainer: {
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  headerIcon: {
    fontSize: 60,
    marginBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  configInfo: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 30,
  },
  configTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  configItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  configLabel: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  configValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'monospace',
  },
  authSection: {
    marginBottom: 30,
  },
  featuresList: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  featuresTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  featureItem: {
    color: '#10B981',
    fontSize: 14,
    marginBottom: 6,
  },
  requirementBox: {
    backgroundColor: '#92400E',
    borderColor: '#D97706',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  requirementTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FBBF24',
    marginBottom: 8,
  },
  requirementText: {
    color: '#FEF3C7',
    fontSize: 14,
    lineHeight: 20,
  },
  loginButton: {
    backgroundColor: '#FF1744',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  disclaimer: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 16,
  },
  connectedSection: {
    marginBottom: 30,
  },
  statusCard: {
    backgroundColor: '#064E3B',
    borderColor: '#10B981',
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  statusIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#10B981',
    marginBottom: 8,
  },
  statusDescription: {
    color: '#D1FAE5',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  capabilitiesList: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  capabilitiesTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  capabilityItem: {
    color: '#10B981',
    fontSize: 14,
    marginBottom: 6,
  },
  signOutButton: {
    backgroundColor: '#7F1D1D',
    borderColor: '#DC2626',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  signOutButtonText: {
    color: '#FCA5A5',
    fontSize: 16,
    fontWeight: 'bold',
  },
  helpSection: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
  },
  helpTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  helpText: {
    color: '#9CA3AF',
    fontSize: 14,
    marginBottom: 8,
  },
  helpItem: {
    color: '#9CA3AF',
    fontSize: 14,
    marginBottom: 4,
    marginLeft: 8,
  },
});

export default AppleMusicAuthScreen;