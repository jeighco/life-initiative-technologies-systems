/**
 * Simplified Multi-Room Music iOS App
 * Basic working version to test functionality
 */

import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
} from 'react-native';

const SimpleApp: React.FC = () => {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#111827" />
      
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>🎵 Multi-Room Music</Text>
          <Text style={styles.subtitle}>Enhanced iOS App</Text>
        </View>

        {/* Connection Status */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🔗 Connection Status</Text>
          <View style={styles.statusRow}>
            <Text style={styles.statusText}>📶 Server: Connecting...</Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusText}>🔊 Snapcast: Disconnected</Text>
          </View>
          <Text style={styles.deviceInfo}>📱 iOS Device Ready</Text>
        </View>

        {/* Features */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🚀 Enhanced Features</Text>
          <View style={styles.featuresList}>
            <Text style={styles.featureItem}>✅ Complete Navigation System</Text>
            <Text style={styles.featureItem}>✅ Room Management Controls</Text>
            <Text style={styles.featureItem}>✅ Volume Controls per Room</Text>
            <Text style={styles.featureItem}>✅ Streaming Service Integration</Text>
            <Text style={styles.featureItem}>✅ Music Upload System</Text>
            <Text style={styles.featureItem}>✅ Real-time Synchronization</Text>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🎛️ Quick Actions</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.actionButton}>
              <Text style={styles.buttonText}>🏘️ Manage Rooms</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton}>
              <Text style={styles.buttonText}>📚 Browse Library</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.actionButton}>
              <Text style={styles.buttonText}>🎵 Streaming</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton}>
              <Text style={styles.buttonText}>⚙️ Settings</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Status */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📊 System Status</Text>
          <Text style={styles.statusInfo}>
            🎯 App Version: 1.0.0 Enhanced{'\n'}
            🔧 Build: iOS Native with React Native{'\n'}
            🌐 Server: 192.168.12.125:3000{'\n'}
            🎵 Snapcast: Ready for Connection{'\n'}
            📱 Platform: iOS Multi-Room Music
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            🎵 Multi-Room Music • Enhanced iOS Experience
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
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
  header: {
    alignItems: 'center',
    marginBottom: 24,
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
  },
  card: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  statusRow: {
    marginBottom: 8,
  },
  statusText: {
    fontSize: 16,
    color: '#9CA3AF',
  },
  deviceInfo: {
    fontSize: 14,
    color: '#3B82F6',
    marginTop: 8,
  },
  featuresList: {
    gap: 8,
  },
  featureItem: {
    fontSize: 14,
    color: '#9CA3AF',
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  actionButton: {
    backgroundColor: '#3B82F6',
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  statusInfo: {
    color: '#9CA3AF',
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 32,
  },
  footerText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
});

export default SimpleApp;