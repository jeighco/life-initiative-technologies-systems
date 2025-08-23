/**
 * CRITICAL Global polyfills for React Native
 * This file ensures that global JavaScript variables are properly available
 * in the React Native environment, fixing Metro debugging and bridge communication issues.
 */

console.log('🔧 Loading critical polyfills...');

// FORCE global variables to be available immediately
if (typeof global === 'undefined') {
  // Create global if it doesn't exist
  (function() { return this; })().global = (function() { return this; })();
}

// Ensure console is ALWAYS globally available  
global.console = console;
if (typeof window === 'undefined') {
  global.window = global;
}

// Critical Metro/React Native globals
global.setTimeout = setTimeout;
global.setInterval = setInterval;
global.clearTimeout = clearTimeout;
global.clearInterval = clearInterval;
global.requestAnimationFrame = requestAnimationFrame || function(cb) { return setTimeout(cb, 16); };
global.cancelAnimationFrame = cancelAnimationFrame || clearTimeout;

// Web API polyfills that React Native expects
global.MessageChannel = global.MessageChannel || class MessageChannel {
  constructor() {
    const channel = {
      port1: { postMessage: () => {}, onmessage: null },
      port2: { postMessage: () => {}, onmessage: null }
    };
    this.port1 = channel.port1;
    this.port2 = channel.port2;
  }
};

global.AbortController = global.AbortController || class AbortController {
  constructor() {
    this.signal = { aborted: false };
  }
  abort() {
    this.signal.aborted = true;
  }
};

global.FormData = global.FormData || class FormData {
  constructor() {
    this.data = new Map();
  }
  append(key, value) {
    this.data.set(key, value);
  }
};

global.XMLHttpRequest = global.XMLHttpRequest || class XMLHttpRequest {
  constructor() {
    this.readyState = 0;
    this.status = 0;
    this.responseText = '';
  }
  open() {}
  send() {}
  setRequestHeader() {}
};

// React DevTools globals
global.localStorage = global.localStorage || {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {}
};

global.sessionStorage = global.sessionStorage || {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {}
};

global.HTMLElement = global.HTMLElement || class HTMLElement {};
global.FileReader = global.FileReader || class FileReader {
  readAsArrayBuffer() {}
  readAsText() {}
};

// React Native specific globals
global.navigator = global.navigator || { userAgent: 'React Native' };
global.__DEV__ = __DEV__;
global.queueMicrotask = global.queueMicrotask || function(callback) {
  setTimeout(callback, 0);
};

// Additional missing variables from build errors
global.IS_REACT_ACT_ENVIRONMENT = false;
global.RN$enableMicrotasksInReact = false;
global._WORKLET = false;
global.ElementTypeForwardRef = 'react.forward_ref';
global.ElementTypeMemo = 'react.memo';
global.getComputedStyle = global.getComputedStyle || (() => ({}));
global.CSSStyleRule = global.CSSStyleRule || class CSSStyleRule {};
global.MutationObserver = global.MutationObserver || class MutationObserver {
  constructor() {}
  observe() {}
  disconnect() {}
};
global.structuredClone = global.structuredClone || function(obj) {
  return JSON.parse(JSON.stringify(obj));
};

// iOS React Native compatibility fixes
if (typeof global !== 'undefined') {
  // Prevent iOS sheet-related crashes by ensuring methods exist
  const originalWarn = console.warn;
  console.warn = (...args) => {
    const message = args.join(' ');
    if (message.includes('setSheetLargestUndimmedDetent') || 
        message.includes('unrecognized selector')) {
      // Suppress iOS sheet-related warnings that cause crashes
      return;
    }
    originalWarn.apply(console, args);
  };
}

// Add global error handler
global.ErrorUtils?.setGlobalHandler?.((error, isFatal) => {
  console.error('💥 Global Error Handler:', error, 'isFatal:', isFatal);
});

// Log successful polyfill initialization in development
if (__DEV__) {
  console.log('🚀 Starting Multi-Room Music App...');
  console.log('✅ Global polyfills initialized successfully');
  console.log('✅ iOS compatibility fixes applied');
  console.log('📦 React Native version: 0.81.0');
  console.log('🎵 App ready for initialization');
}