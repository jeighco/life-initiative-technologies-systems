/**
 * @format
 */

// IMMEDIATE critical polyfills before any imports
if (typeof global === 'undefined') {
  (function() { return this; })().global = (function() { return this; })();
}
global.console = console;
if (typeof window === 'undefined') {
  global.window = global;
}
global.setTimeout = setTimeout;
global.setInterval = setInterval;
global.clearTimeout = clearTimeout;
global.clearInterval = clearInterval;

// Import full polyfills FIRST to ensure global variables are available
import './polyfills';

import 'react-native-gesture-handler';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

console.log('🚀 Registering Multi-Room Music App...');

// Register the main app
AppRegistry.registerComponent(appName, () => App);

console.log('✅ App registration complete');
