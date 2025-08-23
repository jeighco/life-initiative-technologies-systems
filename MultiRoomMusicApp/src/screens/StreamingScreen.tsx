import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  FlatList
} from 'react-native';
import { useMusic } from '../context/MusicContext';
import { StreamingTrack } from '../types';

const StreamingScreen: React.FC = () => {
  const { addToQueue, searchAppleMusic, searchSoundCloud } = useMusic();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StreamingTrack[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeService, setActiveService] = useState<'apple-music' | 'soundcloud' | 'all'>('all');

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      return;
    }

    setIsSearching(true);
    setSearchResults([]);

    try {
      let results: StreamingTrack[] = [];

      if (activeService === 'apple-music' || activeService === 'all') {
        try {
          console.log('🍎 Searching Apple Music...');
          const appleMusicResults = await searchAppleMusic(searchQuery);
          results = [...results, ...appleMusicResults];
        } catch (error) {
          console.warn('Apple Music search failed:', error);
        }
      }

      if (activeService === 'soundcloud' || activeService === 'all') {
        try {
          console.log('☁️ Searching SoundCloud...');
          const soundCloudResults = await searchSoundCloud(searchQuery);
          results = [...results, ...soundCloudResults];
        } catch (error) {
          console.warn('SoundCloud search failed:', error);
        }
      }

      // Sort results by service preference and relevance
      results.sort((a, b) => {
        // Prioritize Apple Music for mainstream content
        if (a.service !== b.service) {
          return a.service === 'apple-music' ? -1 : 1;
        }
        // Then by duration (prefer full tracks)
        return b.duration - a.duration;
      });

      setSearchResults(results);

      if (results.length === 0) {
        Alert.alert(
          'No Results',
          `No tracks found for "${searchQuery}". Try a different search term.`,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Search error:', error);
      Alert.alert('Search Error', 'Unable to search streaming services. Please try again.');
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, activeService, searchAppleMusic, searchSoundCloud]);

  const handleAddToQueue = useCallback((track: StreamingTrack) => {
    addToQueue(track);
    Alert.alert(
      'Added to Queue',
      `"${track.name}" by ${track.artist} has been added to your queue.`,
      [{ text: 'OK' }]
    );
  }, [addToQueue]);

  const formatDuration = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const getServiceIcon = (service: string) => {
    switch (service) {
      case 'apple-music':
        return '🍎';
      case 'soundcloud':
        return '☁️';
      case 'spotify':
        return '🎵';
      default:
        return '🎶';
    }
  };

  const getServiceColor = (service: string) => {
    switch (service) {
      case 'apple-music':
        return '#FF1744';
      case 'soundcloud':
        return '#FF5500';
      case 'spotify':
        return '#1DB954';
      default:
        return '#666666';
    }
  };

  const renderTrack = ({ item: track }: { item: StreamingTrack }) => (
    <View style={styles.trackItem}>
      {/* Album Artwork */}
      {track.artwork?.url ? (
        <Image source={{ uri: track.artwork.url }} style={styles.trackArtwork} />
      ) : (
        <View style={[styles.trackArtwork, styles.placeholderArtwork]}>
          <Text style={styles.placeholderText}>🎵</Text>
        </View>
      )}

      {/* Track Info */}
      <View style={styles.trackInfo}>
        <Text style={styles.trackTitle} numberOfLines={1}>
          {track.name}
        </Text>
        <Text style={styles.trackArtist} numberOfLines={1}>
          {track.artist}
        </Text>
        <Text style={styles.trackAlbum} numberOfLines={1}>
          {track.album}
        </Text>

        {/* Service Badge and Duration */}
        <View style={styles.trackMeta}>
          <View style={[styles.serviceBadge, { backgroundColor: getServiceColor(track.service) }]}>
            <Text style={styles.serviceIcon}>{getServiceIcon(track.service)}</Text>
            <Text style={styles.serviceName}>
              {track.service === 'apple-music' ? 'Apple Music' : 'SoundCloud'}
            </Text>
          </View>
          <Text style={styles.duration}>{formatDuration(track.duration)}</Text>
        </View>
      </View>

      {/* Add Button */}
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => handleAddToQueue(track)}
      >
        <Text style={styles.addButtonText}>+ Add</Text>
      </TouchableOpacity>
    </View>
  );

  const renderServiceButton = (
    serviceId: 'apple-music' | 'soundcloud' | 'all',
    title: string,
    icon: string
  ) => (
    <TouchableOpacity
      style={[
        styles.serviceButton,
        activeService === serviceId && styles.activeServiceButton
      ]}
      onPress={() => setActiveService(serviceId)}
    >
      <Text style={styles.serviceButtonIcon}>{icon}</Text>
      <Text style={[
        styles.serviceButtonText,
        activeService === serviceId && styles.activeServiceButtonText
      ]}>
        {title}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🎵 Stream Music</Text>
        <Text style={styles.headerSubtitle}>
          Search millions of songs from Apple Music & SoundCloud
        </Text>
      </View>

      {/* Service Selection */}
      <View style={styles.serviceSelector}>
        {renderServiceButton('all', 'All Services', '🔍')}
        {renderServiceButton('apple-music', 'Apple Music', '🍎')}
        {renderServiceButton('soundcloud', 'SoundCloud', '☁️')}
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search for songs, artists, or albums..."
          placeholderTextColor="#9CA3AF"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        <TouchableOpacity
          style={[styles.searchButton, isSearching && styles.searchButtonDisabled]}
          onPress={handleSearch}
          disabled={isSearching || !searchQuery.trim()}
        >
          {isSearching ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.searchButtonText}>Search</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Results Count */}
      {searchResults.length > 0 && (
        <View style={styles.resultsHeader}>
          <Text style={styles.resultsCount}>
            Found {searchResults.length} track{searchResults.length !== 1 ? 's' : ''}
          </Text>
          <Text style={styles.resultsQuery}>for "{searchQuery}"</Text>
        </View>
      )}

      {/* Search Results */}
      <FlatList
        data={searchResults}
        renderItem={renderTrack}
        keyExtractor={(item) => `${item.service}-${item.id}`}
        style={styles.resultsList}
        contentContainerStyle={styles.resultsContainer}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          !isSearching && searchQuery ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyText}>No results found</Text>
              <Text style={styles.emptySubtext}>Try different search terms</Text>
            </View>
          ) : null
        }
      />

      {/* Getting Started */}
      {searchResults.length === 0 && !searchQuery && !isSearching && (
        <View style={styles.gettingStarted}>
          <Text style={styles.gettingStartedIcon}>🎶</Text>
          <Text style={styles.gettingStartedTitle}>Discover Music</Text>
          <Text style={styles.gettingStartedText}>
            Search millions of songs from Apple Music and add them to your queue for multi-room playback.
          </Text>
          
          <Text style={styles.examplesTitle}>Try searching for:</Text>
          {['Billie Eilish', 'The Weeknd', 'Dua Lipa', 'Bad Bunny'].map((suggestion) => (
            <TouchableOpacity
              key={suggestion}
              style={styles.suggestionButton}
              onPress={() => {
                setSearchQuery(suggestion);
                setActiveService('apple-music');
              }}
            >
              <Text style={styles.suggestionText}>{suggestion}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  serviceSelector: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  serviceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#374151',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  activeServiceButton: {
    backgroundColor: '#3B82F6',
  },
  serviceButtonIcon: {
    fontSize: 16,
  },
  serviceButtonText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  activeServiceButtonText: {
    color: '#FFFFFF',
  },
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#1F2937',
    color: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    fontSize: 16,
  },
  searchButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 80,
  },
  searchButtonDisabled: {
    backgroundColor: '#6B7280',
  },
  searchButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  resultsHeader: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  resultsCount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  resultsQuery: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 2,
  },
  resultsList: {
    flex: 1,
  },
  resultsContainer: {
    paddingHorizontal: 16,
  },
  trackItem: {
    flexDirection: 'row',
    backgroundColor: '#1F2937',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  trackArtwork: {
    width: 60,
    height: 60,
    borderRadius: 6,
    marginRight: 12,
  },
  placeholderArtwork: {
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 20,
  },
  trackInfo: {
    flex: 1,
  },
  trackTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  trackArtist: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 1,
  },
  trackAlbum: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 6,
  },
  trackMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  serviceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    gap: 4,
  },
  serviceIcon: {
    fontSize: 12,
  },
  serviceName: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  duration: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  addButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    marginLeft: 12,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  separator: {
    height: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6B7280',
  },
  gettingStarted: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  gettingStartedIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  gettingStartedTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  gettingStartedText: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  examplesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  suggestionButton: {
    backgroundColor: '#1F2937',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginBottom: 8,
  },
  suggestionText: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default StreamingScreen;