/**
 * Simple test script for lobby events
 * Tests the four lobby event types: start_queue, stop_queue, change_mode, change_host
 */

const WebSocket = require('ws');

// Configuration
const WS_URL = 'ws://localhost:3000';
const LOBBY_ID = 'TEST_LOBBY_123';

// Test users
const users = [
  { userId: 'host_001', username: 'HostPlayer' },
  { userId: 'member_002', username: 'MemberPlayer1' },
  { userId: 'member_003', username: 'MemberPlayer2' }
];

let connections = [];

// Helper to send message
function sendMessage(ws, action, data) {
  ws.send(JSON.stringify({ action, ...data }));
}

// Helper to wait
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Connect all users
async function connectUsers() {
  console.log('=== Connecting users ===');
  
  for (const user of users) {
    const ws = new WebSocket(WS_URL);
    
    await new Promise((resolve, reject) => {
      ws.on('open', () => {
        console.log(`${user.username} connected`);
        
        // Authenticate
        sendMessage(ws, 'auth', {
          userId: user.userId,
          username: user.username,
          friendIds: []
        });
        
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'auth_success') {
            console.log(`${user.username} authenticated`);
            resolve();
          } else if (msg.type === 'lobby_event') {
            console.log(`\n[${user.username} RECEIVED EVENT]:`);
            console.log(`  Event Type: ${msg.eventType}`);
            console.log(`  Sender: ${msg.senderName} (${msg.senderId})`);
            console.log(`  Lobby: ${msg.lobbyId}`);
            if (msg.gameMode) console.log(`  Game Mode: ${msg.gameMode}`);
            if (msg.newHostId) console.log(`  New Host: ${msg.newHostName} (${msg.newHostId})`);
            console.log(`  Timestamp: ${msg.timestamp}\n`);
          } else if (msg.type === 'ack') {
            console.log(`${user.username} ACK: ${msg.action} - ${msg.success ? 'SUCCESS' : 'FAILED'}`);
            if (msg.recipients !== undefined) {
              console.log(`  Sent to ${msg.recipients} recipients`);
            }
          } else if (msg.type === 'error') {
            console.error(`${user.username} ERROR: ${msg.error}`);
          }
        });
      });
      
      ws.on('error', reject);
    });
    
    connections.push({ ...user, ws });
  }
}

// Subscribe all users to lobby
async function subscribeToLobby() {
  console.log('\n=== Subscribing to lobby ===');
  
  for (const conn of connections) {
    sendMessage(conn.ws, 'lobby_subscribe', { lobbyId: LOBBY_ID });
    console.log(`${conn.username} subscribing to ${LOBBY_ID}`);
  }
  
  await wait(500);
}

// Run tests
async function runTests() {
  try {
    await connectUsers();
    await subscribeToLobby();
    
    console.log('\n=== TEST 1: Host starts queue (Casual) ===');
    sendMessage(connections[0].ws, 'lobby_start_queue', {
      lobbyId: LOBBY_ID,
      gameMode: 'Casual'
    });
    await wait(1000);
    
    console.log('\n=== TEST 2: Host changes mode to Ranked ===');
    sendMessage(connections[0].ws, 'lobby_change_mode', {
      lobbyId: LOBBY_ID,
      gameMode: 'Ranked'
    });
    await wait(1000);
    
    console.log('\n=== TEST 3: Member stops queue ===');
    sendMessage(connections[1].ws, 'lobby_stop_queue', {
      lobbyId: LOBBY_ID
    });
    await wait(1000);
    
    console.log('\n=== TEST 4: Host changes mode to Custom ===');
    sendMessage(connections[0].ws, 'lobby_change_mode', {
      lobbyId: LOBBY_ID,
      gameMode: 'Custom'
    });
    await wait(1000);
    
    console.log('\n=== TEST 5: Host starts queue (Custom) ===');
    sendMessage(connections[0].ws, 'lobby_start_queue', {
      lobbyId: LOBBY_ID,
      gameMode: 'Custom'
    });
    await wait(1000);
    
    console.log('\n=== TEST 6: Change host to member_002 ===');
    sendMessage(connections[0].ws, 'lobby_change_host', {
      lobbyId: LOBBY_ID,
      newHostId: 'member_002'
    });
    await wait(1000);
    
    console.log('\n=== TEST 7: Invalid game mode (should fail) ===');
    sendMessage(connections[0].ws, 'lobby_start_queue', {
      lobbyId: LOBBY_ID,
      gameMode: 'InvalidMode'
    });
    await wait(1000);
    
    console.log('\n=== All tests completed ===');
    
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    // Close connections
    console.log('\n=== Closing connections ===');
    connections.forEach(conn => conn.ws.close());
    process.exit(0);
  }
}

// Start tests
console.log('Starting lobby events test...\n');
runTests();
