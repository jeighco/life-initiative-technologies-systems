/**
 * Deep Linking Service for iniviv.com integration
 * Handles universal links, custom URL schemes, and app state routing
 */

import { Linking, Alert } from 'react-native';
import { useState, useEffect } from 'react';

export interface DeepLinkData {
  url: string;
  scheme: string;
  hostname?: string;
  pathname?: string;
  queryParams?: { [key: string]: string };
}

export interface DeepLinkHandler {
  pattern: string;
  handler: (data: DeepLinkData) => void;
}

class DeepLinkingService {
  private handlers: DeepLinkHandler[] = [];
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Check if app was opened from a deep link
      const initialURL = await Linking.getInitialURL();
      if (initialURL) {
        console.log('🔗 App opened with URL:', initialURL);
        this.handleDeepLink(initialURL);
      }

      // Listen for incoming deep links while app is running
      const subscription = Linking.addEventListener('url', ({ url }) => {
        console.log('🔗 Deep link received:', url);
        this.handleDeepLink(url);
      });

      this.isInitialized = true;
      console.log('🔗 DeepLinkingService initialized');

      return () => {
        subscription?.remove();
      };
    } catch (error) {
      console.error('Failed to initialize DeepLinkingService:', error);
      throw error;
    }
  }

  private parseURL(url: string): DeepLinkData {
    try {
      const urlObj = new URL(url);
      const queryParams: { [key: string]: string } = {};
      
      urlObj.searchParams.forEach((value, key) => {
        queryParams[key] = value;
      });

      return {
        url,
        scheme: urlObj.protocol.replace(':', ''),
        hostname: urlObj.hostname,
        pathname: urlObj.pathname,
        queryParams,
      };
    } catch (error) {
      // Handle custom URL schemes that might not parse as URLs
      const parts = url.split('://');
      if (parts.length >= 2) {
        const scheme = parts[0];
        const rest = parts.slice(1).join('://');
        const [path, query] = rest.split('?');
        
        const queryParams: { [key: string]: string } = {};
        if (query) {
          query.split('&').forEach(param => {
            const [key, value] = param.split('=');
            if (key && value) {
              queryParams[decodeURIComponent(key)] = decodeURIComponent(value);
            }
          });
        }

        return {
          url,
          scheme,
          pathname: path ? `/${path}` : '/',
          queryParams,
        };
      }

      throw new Error(`Invalid URL format: ${url}`);
    }
  }

  private handleDeepLink(url: string): void {
    try {
      const linkData = this.parseURL(url);
      console.log('🔗 Parsed deep link:', linkData);

      // Find matching handler
      const handler = this.handlers.find(h => 
        this.matchesPattern(linkData, h.pattern)
      );

      if (handler) {
        handler.handler(linkData);
      } else {
        console.warn('🔗 No handler found for deep link:', url);
        this.handleUnknownLink(linkData);
      }
    } catch (error) {
      console.error('🔗 Failed to handle deep link:', error);
      Alert.alert('Invalid Link', 'The link you followed is not valid.');
    }
  }

  private matchesPattern(linkData: DeepLinkData, pattern: string): boolean {
    // Simple pattern matching - can be extended for complex patterns
    if (pattern === '*') return true;
    
    if (pattern.startsWith('scheme:')) {
      const targetScheme = pattern.replace('scheme:', '');
      return linkData.scheme === targetScheme;
    }

    if (pattern.startsWith('domain:')) {
      const targetDomain = pattern.replace('domain:', '');
      return linkData.hostname === targetDomain;
    }

    if (pattern.startsWith('path:')) {
      const targetPath = pattern.replace('path:', '');
      return linkData.pathname?.startsWith(targetPath) || false;
    }

    return linkData.url.includes(pattern);
  }

  private handleUnknownLink(linkData: DeepLinkData): void {
    // Default handling for unknown links
    if (linkData.scheme === 'https' && linkData.hostname === 'iniviv.com') {
      // Handle iniviv.com links
      if (linkData.pathname?.startsWith('/app')) {
        // App-specific deep link
        this.handleAppLink(linkData);
      } else if (linkData.pathname === '/download') {
        // Download page link
        this.handleDownloadLink(linkData);
      } else {
        // Generic iniviv.com link
        this.handleWebsiteLink(linkData);
      }
    } else if (linkData.scheme === 'multiroommusic' || linkData.scheme === 'iniviv') {
      // Custom app scheme
      this.handleCustomSchemeLink(linkData);
    }
  }

  private handleAppLink(linkData: DeepLinkData): void {
    console.log('🔗 Handling app link:', linkData.pathname);
    
    if (linkData.pathname === '/app/zones') {
      // Navigate to zones management
      this.notifyHandlers('navigate', { screen: 'Zones', params: linkData.queryParams });
    } else if (linkData.pathname === '/app/settings') {
      // Navigate to settings
      this.notifyHandlers('navigate', { screen: 'Settings', params: linkData.queryParams });
    } else if (linkData.pathname?.startsWith('/app/server/')) {
      // Server configuration link
      const serverIP = linkData.pathname.split('/').pop();
      this.notifyHandlers('configure-server', { serverIP, params: linkData.queryParams });
    } else {
      // Default app link
      this.notifyHandlers('navigate', { screen: 'Home', params: linkData.queryParams });
    }
  }

  private handleDownloadLink(linkData: DeepLinkData): void {
    // User clicked download link but app is already installed
    Alert.alert(
      'App Already Installed',
      'Multi-Room Music is already installed on your device!',
      [
        { text: 'Open App', onPress: () => this.notifyHandlers('navigate', { screen: 'Home' }) },
        { text: 'OK', style: 'cancel' }
      ]
    );
  }

  private handleWebsiteLink(linkData: DeepLinkData): void {
    // Handle other iniviv.com links
    Alert.alert(
      'Open in Browser?',
      `This link will open iniviv.com in your browser.`,
      [
        { text: 'Open Browser', onPress: () => Linking.openURL(linkData.url) },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  }

  private handleCustomSchemeLink(linkData: DeepLinkData): void {
    console.log('🔗 Handling custom scheme link:', linkData);
    
    // Handle custom URL schemes like multiroommusic://open
    if (linkData.pathname === '/open' || linkData.pathname === 'open') {
      this.notifyHandlers('navigate', { screen: 'Home', params: linkData.queryParams });
    } else if (linkData.pathname === '/connect' || linkData.pathname === 'connect') {
      // Quick connect to server
      const serverIP = linkData.queryParams?.server;
      if (serverIP) {
        this.notifyHandlers('quick-connect', { serverIP });
      }
    }
  }

  private notifyHandlers(action: string, data: any): void {
    // Notify registered handlers about navigation or actions
    const event = { action, data };
    console.log('🔗 Deep link action:', event);
    
    // This would be connected to your app's navigation system
    // For now, we'll just log it
  }

  registerHandler(pattern: string, handler: (data: DeepLinkData) => void): () => void {
    const handlerObj = { pattern, handler };
    this.handlers.push(handlerObj);

    console.log('🔗 Registered deep link handler for pattern:', pattern);

    // Return unsubscribe function
    return () => {
      const index = this.handlers.indexOf(handlerObj);
      if (index > -1) {
        this.handlers.splice(index, 1);
      }
    };
  }

  // Predefined handlers for common patterns
  onInivivLink(handler: (data: DeepLinkData) => void): () => void {
    return this.registerHandler('domain:iniviv.com', handler);
  }

  onAppOpen(handler: (data: DeepLinkData) => void): () => void {
    return this.registerHandler('scheme:multiroommusic', handler);
  }

  onServerConnect(handler: (data: DeepLinkData) => void): () => void {
    return this.registerHandler('path:/connect', handler);
  }

  // Generate shareable links
  generateAppLink(path: string = '', params: { [key: string]: string } = {}): string {
    const baseURL = 'https://iniviv.com/app';
    const url = new URL(path, baseURL);
    
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    return url.toString();
  }

  generateCustomSchemeLink(action: string = 'open', params: { [key: string]: string } = {}): string {
    let url = `multiroommusic://${action}`;
    
    const queryString = Object.entries(params)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
      
    if (queryString) {
      url += `?${queryString}`;
    }

    return url;
  }

  // Utility functions
  async canOpenURL(url: string): Promise<boolean> {
    try {
      return await Linking.canOpenURL(url);
    } catch (error) {
      console.error('Failed to check if URL can be opened:', error);
      return false;
    }
  }

  async openURL(url: string): Promise<void> {
    try {
      const canOpen = await this.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        throw new Error('Cannot open URL');
      }
    } catch (error) {
      console.error('Failed to open URL:', error);
      Alert.alert('Error', 'Could not open the link.');
    }
  }

  async shareApp(customMessage?: string): Promise<void> {
    const appLink = this.generateAppLink();
    const message = customMessage || 
      `Check out Multi-Room Music! Synchronized audio streaming across your home. Download: ${appLink}`;
    
    try {
      // This would use React Native's Share API
      console.log('🔗 Sharing app:', message);
      // await Share.share({ message, url: appLink });
    } catch (error) {
      console.error('Failed to share app:', error);
    }
  }

  destroy(): void {
    this.handlers = [];
    this.isInitialized = false;
    console.log('🗑️ DeepLinkingService destroyed');
  }
}

// React Hook for easy deep linking integration
export const useDeepLinking = () => {
  const [deepLinkData, setDeepLinkData] = useState<DeepLinkData | null>(null);

  useEffect(() => {
    const service = new DeepLinkingService();
    
    service.initialize().then(() => {
      // Register a handler to capture all deep links
      const unsubscribe = service.registerHandler('*', (data) => {
        setDeepLinkData(data);
      });

      return unsubscribe;
    });

    return () => {
      service.destroy();
    };
  }, []);

  return {
    deepLinkData,
    clearDeepLink: () => setDeepLinkData(null),
  };
};

// Singleton instance
export const deepLinkingService = new DeepLinkingService();