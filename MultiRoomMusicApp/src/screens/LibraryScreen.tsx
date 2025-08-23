import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import RNFS from 'react-native-fs';
import { useMusic } from '../context/MusicContext';
import { useSocket } from '../context/SocketContext';

const LibraryScreen: React.FC = () => {
  const { musicFiles, addToQueue, refreshLibrary, uploadFile } = useMusic();
  const { connectionState } = useSocket();
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{[key: string]: number}>({});

  const filteredFiles = musicFiles.filter(file =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (file.artist && file.artist.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (file.album && file.album.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleUpload = async () => {
    if (connectionState.status !== 'connected') {
      Alert.alert('Error', 'Please connect to the server before uploading files');
      return;
    }

    try {
      // Show file picker
      const results = await DocumentPicker.pick({
        type: [
          DocumentPicker.types.audio,
          'audio/mpeg',
          'audio/mp4',
          'audio/wav',
          'audio/flac',
          'audio/x-m4a',
        ],
        allowMultiSelection: true,
      });

      if (results.length === 0) return;

      setIsUploading(true);
      
      Alert.alert(
        'Upload Files',
        `Upload ${results.length} file(s) to your music library?`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => setIsUploading(false),
          },
          {
            text: 'Upload',
            onPress: () => processUploads(results),
          },
        ]
      );
    } catch (err) {
      setIsUploading(false);
      
      if (DocumentPicker.isCancel(err)) {
        // User cancelled the picker
        return;
      }
      
      console.error('File picker error:', err);
      Alert.alert('Error', 'Failed to select files. Please try again.');
    }
  };

  const processUploads = async (files: any[]) => {
    let successCount = 0;
    let errorCount = 0;
    
    for (const file of files) {
      try {
        setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));
        
        // Update progress to show upload starting
        setUploadProgress(prev => ({ ...prev, [file.name]: 25 }));

        // Create FormData for file upload (better for large files)
        const formData = new FormData();
        formData.append('musicFile', {
          uri: file.uri,
          type: file.type || 'audio/mpeg',
          name: file.name,
        } as any);

        // Upload to server using FormData
        console.log(`📤 Uploading ${file.name} to ${connectionState.serverAddress}/api/upload`);
        console.log(`📤 File info: ${file.type || 'audio/mpeg'}, size: ${file.size || 'unknown'}`);
        
        const response = await fetch(`${connectionState.serverAddress}/api/upload`, {
          method: 'POST',
          body: formData,
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        setUploadProgress(prev => ({ ...prev, [file.name]: 75 }));

        if (response.ok) {
          const result = await response.json();
          console.log(`✅ Upload success for ${file.name}:`, result);
          setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
          successCount++;
        } else {
          const errorText = await response.text();
          console.error(`❌ Upload failed for ${file.name}: ${response.status} ${response.statusText}`, errorText);
          throw new Error(`Upload failed: ${response.status} ${response.statusText} - ${errorText}`);
        }
      } catch (error) {
        console.error(`Upload error for ${file.name}:`, error);
        setUploadProgress(prev => ({ ...prev, [file.name]: -1 })); // -1 indicates error
        errorCount++;
      }
    }

    // Clear progress and reset state
    setTimeout(() => {
      setUploadProgress({});
      setIsUploading(false);
    }, 2000);

    // Show results
    if (successCount > 0) {
      refreshLibrary(); // Refresh the library to show new files
    }

    if (errorCount === 0) {
      Alert.alert('Success', `Successfully uploaded ${successCount} file(s)!`);
    } else if (successCount === 0) {
      Alert.alert('Upload Failed', `Failed to upload ${errorCount} file(s). Please try again.`);
    } else {
      Alert.alert(
        'Partial Success', 
        `Uploaded ${successCount} file(s) successfully, ${errorCount} failed.`
      );
    }
  };

  const renderMusicFile = (file: any) => (
    <View key={file.filename} style={styles.musicItem}>
      <View style={styles.musicInfo}>
        <Text style={styles.musicTitle} numberOfLines={1}>
          {file.name}
        </Text>
        {file.artist && (
          <Text style={styles.musicArtist} numberOfLines={1}>
            {file.artist}
          </Text>
        )}
        {file.album && (
          <Text style={styles.musicAlbum} numberOfLines={1}>
            {file.album}
          </Text>
        )}
      </View>
      <TouchableOpacity
        style={[
          styles.addButton,
          connectionState.status !== 'connected' && styles.buttonDisabled
        ]}
        onPress={() => addToQueue(file)}
        disabled={connectionState.status !== 'connected'}
      >
        <Text style={styles.addButtonText}>+ Add</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search music..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={refreshLibrary}
          >
            <Text style={styles.buttonText}>🔄</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.uploadButton,
              (isUploading || connectionState.status !== 'connected') && styles.buttonDisabled
            ]}
            onPress={handleUpload}
            disabled={isUploading || connectionState.status !== 'connected'}
          >
            {isUploading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>📁</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.statsContainer}>
        <Text style={styles.statsText}>
          {filteredFiles.length} of {musicFiles.length} songs
        </Text>
        {connectionState.status !== 'connected' && (
          <Text style={styles.warningText}>⚠️ Connect to server to upload files</Text>
        )}
      </View>

      {/* Upload Progress Section */}
      {Object.keys(uploadProgress).length > 0 && (
        <View style={styles.uploadProgressContainer}>
          <Text style={styles.uploadProgressTitle}>Uploading Files...</Text>
          {Object.entries(uploadProgress).map(([fileName, progress]) => (
            <View key={fileName} style={styles.uploadProgressItem}>
              <Text style={styles.uploadFileName} numberOfLines={1}>
                {fileName}
              </Text>
              <View style={styles.uploadStatusContainer}>
                {progress === -1 ? (
                  <Text style={styles.uploadError}>❌</Text>
                ) : progress === 100 ? (
                  <Text style={styles.uploadSuccess}>✅</Text>
                ) : (
                  <View style={styles.uploadProgressBar}>
                    <View 
                      style={[
                        styles.uploadProgressFill, 
                        { width: `${progress}%` }
                      ]} 
                    />
                    <Text style={styles.uploadProgressText}>
                      {progress}%
                    </Text>
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {filteredFiles.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              {searchQuery ? 'No songs match your search' : 'No music files found'}
            </Text>
            <Text style={styles.emptySubtext}>
              {searchQuery 
                ? 'Try a different search term' 
                : connectionState.status === 'connected' 
                  ? 'Upload music files to get started'
                  : 'Connect to server to load your music library'
              }
            </Text>
          </View>
        ) : (
          filteredFiles.map(renderMusicFile)
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  header: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  searchContainer: {
    flex: 1,
  },
  searchInput: {
    backgroundColor: '#1F2937',
    color: '#FFFFFF',
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  refreshButton: {
    backgroundColor: '#3B82F6',
    width: 44,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadButton: {
    backgroundColor: '#10B981',
    width: 44,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 18,
  },
  statsContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  statsText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  warningText: {
    color: '#F59E0B',
    fontSize: 12,
    marginTop: 4,
  },
  uploadProgressContainer: {
    backgroundColor: '#1F2937',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
    padding: 12,
  },
  uploadProgressTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  uploadProgressItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  uploadFileName: {
    flex: 1,
    color: '#9CA3AF',
    fontSize: 14,
    marginRight: 12,
  },
  uploadStatusContainer: {
    width: 80,
    alignItems: 'center',
  },
  uploadProgressBar: {
    width: 70,
    height: 6,
    backgroundColor: '#374151',
    borderRadius: 3,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadProgressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 3,
  },
  uploadProgressText: {
    position: 'absolute',
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  uploadSuccess: {
    fontSize: 16,
  },
  uploadError: {
    fontSize: 16,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  musicItem: {
    flexDirection: 'row',
    backgroundColor: '#1F2937',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  musicInfo: {
    flex: 1,
    marginRight: 12,
  },
  musicTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  musicArtist: {
    color: '#9CA3AF',
    fontSize: 14,
    marginBottom: 1,
  },
  musicAlbum: {
    color: '#6B7280',
    fontSize: 12,
  },
  addButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  buttonDisabled: {
    backgroundColor: '#6B7280',
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 18,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
});

export default LibraryScreen;