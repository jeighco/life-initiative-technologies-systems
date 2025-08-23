import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const TestApp: React.FC = () => {
  console.log('🧪 TestApp rendering...');
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>🎵 Multi-Room Music</Text>
      <Text style={styles.subtitle}>iOS App Test</Text>
      <Text style={styles.status}>✅ JavaScript is working</Text>
      <Text style={styles.status}>✅ React Native is working</Text>
      <Text style={styles.status}>✅ No white screen!</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#9CA3AF',
    marginBottom: 30,
    textAlign: 'center',
  },
  status: {
    fontSize: 16,
    color: '#10B981',
    marginBottom: 10,
    textAlign: 'center',
  },
});

export default TestApp;