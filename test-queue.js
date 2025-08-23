#!/usr/bin/env node

// Test script to verify queue and playbook functionality 
const io = require('socket.io-client');

const SERVER_URL = 'http://localhost:3000';

console.log('🧪 Testing music queue and playbook functionality...\n');

const socket = io(SERVER_URL, {
  transports: ['polling']
});

let testState = {
  connected: false,
  initialDataReceived: false,
  files: [],
  queue: [],
  currentTrackIndex: -1,
  isPlaying: false,
  testsPassed: 0,
  testsFailed: 0
};

const runTests = () => {
  console.log('📊 Running queue and playbook tests...\n');
  
  setTimeout(() => {
    test1_AddSongToQueue();
  }, 1000);
};

const test1_AddSongToQueue = () => {
  console.log('Test 1: Adding song to queue');
  
  if (testState.files.length === 0) {
    console.log('❌ FAIL: No music files available');
    testState.testsFailed++;
    test2_PlayPauseControls();
    return;
  }
  
  const firstFile = testState.files[0];
  console.log(`   Adding file: ${firstFile.name}`);
  
  // Set up listener for queue update
  const originalQueueLength = testState.queue.length;
  
  socket.emit('add_to_queue', firstFile.id);
  
  // Wait for update
  setTimeout(() => {
    if (testState.queue.length === originalQueueLength + 1) {
      console.log('✅ PASS: Song added to queue successfully');
      console.log(`   Queue length: ${originalQueueLength} -> ${testState.queue.length}`);
      testState.testsPassed++;
    } else {
      console.log('❌ FAIL: Song was not added to queue');
      console.log(`   Queue length: ${originalQueueLength} -> ${testState.queue.length}`);
      testState.testsFailed++;
    }
    test2_PlayPauseControls();
  }, 2000);
};

const test2_PlayPauseControls = () => {
  console.log('\nTest 2: Play/Pause controls');
  
  if (testState.queue.length === 0) {
    console.log('❌ FAIL: No songs in queue to test playback');
    testState.testsFailed++;
    test3_RemoveFromQueue();
    return;
  }
  
  console.log('   Sending play command...');
  const wasPlaying = testState.isPlaying;
  
  socket.emit('play_pause');
  
  setTimeout(() => {
    if (testState.isPlaying !== wasPlaying) {
      console.log(`✅ PASS: Playback state changed from ${wasPlaying} to ${testState.isPlaying}`);
      testState.testsPassed++;
    } else {
      console.log(`❌ FAIL: Playback state didn't change (still ${testState.isPlaying})`);
      testState.testsFailed++;
    }
    test3_RemoveFromQueue();
  }, 2000);
};

const test3_RemoveFromQueue = () => {
  console.log('\nTest 3: Removing song from queue');
  
  if (testState.queue.length === 0) {
    console.log('❌ FAIL: No songs in queue to remove');
    testState.testsFailed++;
    test4_ClearQueue();
    return;
  }
  
  const originalLength = testState.queue.length;
  console.log(`   Removing first song from queue (${testState.queue[0]?.name})`);
  
  socket.emit('remove_from_queue', 0);
  
  setTimeout(() => {
    if (testState.queue.length === originalLength - 1) {
      console.log('✅ PASS: Song removed from queue successfully');
      console.log(`   Queue length: ${originalLength} -> ${testState.queue.length}`);
      testState.testsPassed++;
    } else {
      console.log('❌ FAIL: Song was not removed from queue');
      console.log(`   Queue length: ${originalLength} -> ${testState.queue.length}`);
      testState.testsFailed++;
    }
    test4_ClearQueue();
  }, 2000);
};

const test4_ClearQueue = () => {
  console.log('\nTest 4: Clearing entire queue');
  
  const originalLength = testState.queue.length;
  console.log(`   Clearing queue (${originalLength} songs)`);
  
  socket.emit('clear_queue');
  
  setTimeout(() => {
    if (testState.queue.length === 0) {
      console.log('✅ PASS: Queue cleared successfully');
      console.log(`   Queue length: ${originalLength} -> 0`);
      testState.testsPassed++;
    } else {
      console.log('❌ FAIL: Queue was not cleared');
      console.log(`   Queue length: ${originalLength} -> ${testState.queue.length}`);
      testState.testsFailed++;
    }
    
    showTestResults();
  }, 2000);
};

const showTestResults = () => {
  console.log('\n' + '='.repeat(50));
  console.log('🧪 Test Results Summary:');
  console.log(`   Passed: ${testState.testsPassed}`);
  console.log(`   Failed: ${testState.testsFailed}`);
  console.log(`   Total:  ${testState.testsPassed + testState.testsFailed}`);
  
  if (testState.testsFailed === 0) {
    console.log('\n🎉 All tests passed! Queue and playbook functionality is working.');
  } else {
    console.log('\n⚠️  Some tests failed. There are issues with queue/playbook functionality.');
  }
  
  console.log('\n📊 Final State:');
  console.log(`   Files available: ${testState.files.length}`);
  console.log(`   Queue length: ${testState.queue.length}`);
  console.log(`   Current track: ${testState.currentTrackIndex}`);
  console.log(`   Playing: ${testState.isPlaying}`);
  
  socket.disconnect();
  process.exit(testState.testsFailed === 0 ? 0 : 1);
};

// Socket event handlers
socket.on('connect', () => {
  console.log('✅ Connected to server');
  testState.connected = true;
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected from server');
  testState.connected = false;
});

socket.on('initial_data', (data) => {
  console.log(`📊 Received initial data: ${data.files?.length || 0} files, queue: ${data.queue?.length || 0}`);
  testState.initialDataReceived = true;
  testState.files = data.files || [];
  testState.queue = data.queue || [];
  testState.currentTrackIndex = data.currentTrackIndex || -1;
  testState.isPlaying = data.isPlaying || false;
  
  if (data.files?.length > 0) {
    console.log(`   First file: ${data.files[0].name}`);
  }
  
  if (testState.connected) {
    runTests();
  }
});

socket.on('update_state', (state) => {
  console.log(`🔄 State update - Queue: ${state.queue?.length || 0}, Playing: ${state.isPlaying}, Track: ${state.currentTrackIndex}`);
  testState.files = state.files || testState.files;
  testState.queue = state.queue || [];
  testState.currentTrackIndex = state.currentTrackIndex || -1;
  testState.isPlaying = state.isPlaying || false;
});

socket.on('stream_error', (error) => {
  console.log(`❌ Stream error: ${error.message}`);
});

socket.on('connect_error', (error) => {
  console.log(`❌ Connection error: ${error.message}`);
  process.exit(1);
});

// Timeout for the entire test
setTimeout(() => {
  if (!testState.connected) {
    console.log('❌ Test timeout - could not connect to server');
    process.exit(1);
  }
}, 10000);