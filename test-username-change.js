/**
 * Test script to verify username change behavior
 * Tests what happens when a client re-authenticates with a different username
 */

const WebSocket = require('ws');

// Configuration
const WS_URL = 'ws://localhost:3000';
const TEST_USER_ID = 'username_test_001';
const LOBBY_ID = 'USERNAME_TEST_LOBBY';

// Helper to send message
function sendMessage(ws, action, data) {
  ws.send(JSON.stringify({ action, ...data }));
}

// Helper to wait
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Main test
async function runTest() {
  console.log('=== Username Change Test ===\n');
  
  // Create first WebSocket connection
  const ws1 = new WebSocket(WS_URL);
  
  await new Promise((resolve, reject) => {
    ws1.on('open', () => {
      console.log('✓ WebSocket connected');
      
      ws1.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        
        if (msg.type === 'auth_success') {
          console.log(`✓ AUTH SUCCESS - Username: ${msg.username}`);
        } 
        else if (msg.type === 'lobby_event') {
          if (msg.eventType === 'lobby_roster') {
            console.log(`\n[ROSTER UPDATE]`);
            console.log(`  Members: ${msg.members.length}`);
            msg.members.forEach(m => {
              console.log(`    - ${m.username} (${m.userId})`);
            });
          }
        }
        else if (msg.type === 'ack') {
          console.log(`✓ ACK: ${msg.action} - ${msg.success ? 'SUCCESS' : 'FAILED'}`);
        }
        else if (msg.type === 'error') {
          console.error(`✗ ERROR: ${msg.error}`);
        }
      });
      
      resolve();
    });
    
    ws1.on('error', reject);
  });
  
  console.log('\n--- TEST 1: Initial authentication ---');
  sendMessage(ws1, 'auth', {
    userId: TEST_USER_ID,
    username: 'OriginalUsername',
    friendIds: [],
    characterId: 'char_001'
  });
  await wait(500);
  
  console.log('\n--- TEST 2: Re-authenticate with DIFFERENT username (same WebSocket) ---');
  sendMessage(ws1, 'auth', {
    userId: TEST_USER_ID,
    username: 'ChangedUsername',
    friendIds: [],
    characterId: 'char_001'
  });
  await wait(500);
  
  console.log('\n--- TEST 3: Join lobby to verify username in roster ---');
  sendMessage(ws1, 'lobby_subscribe', {
    lobbyId: LOBBY_ID
  });
  await wait(1000);
  
  console.log('\n--- TEST 4: Create second connection with DIFFERENT username (same userId) ---');
  const ws2 = new WebSocket(WS_URL);
  
  await new Promise((resolve) => {
    ws2.on('open', () => {
      console.log('✓ Second WebSocket connected');
      
      ws2.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        
        if (msg.type === 'auth_success') {
          console.log(`✓ AUTH SUCCESS (WS2) - Username: ${msg.username}`);
        }
        else if (msg.type === 'lobby_event') {
          if (msg.eventType === 'lobby_roster') {
            console.log(`\n[ROSTER UPDATE FROM WS2]`);
            console.log(`  Members: ${msg.members.length}`);
            msg.members.forEach(m => {
              console.log(`    - ${m.username} (${m.userId})`);
            });
          }
        }
        else if (msg.type === 'ack') {
          console.log(`✓ ACK (WS2): ${msg.action}`);
        }
      });
      
      resolve();
    });
  });
  
  ws1.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'force_disconnect') {
      console.log(`\n✓ WS1 received force_disconnect: ${msg.reason}`);
    }
  });
  
  ws1.on('close', (code, reason) => {
    console.log(`✓ WS1 closed - Code: ${code}, Reason: ${reason || 'No reason'}`);
  });
  
  console.log('\nAuthenticating second connection with NEW username...');
  sendMessage(ws2, 'auth', {
    userId: TEST_USER_ID,
    username: 'ThirdUsername',
    friendIds: [],
    characterId: 'char_002'
  });
  await wait(500);
  
  console.log('\nJoining lobby with second connection...');
  sendMessage(ws2, 'lobby_subscribe', {
    lobbyId: LOBBY_ID
  });
  await wait(1500);
  
  console.log('\n\n=== TEST SUMMARY ===');
  console.log('Expected behavior:');
  console.log('  1. Re-auth on same WS: Username should override');
  console.log('  2. Lobby roster: Should show latest username');
  console.log('  3. New connection, same userId: Old WS gets force_disconnect');
  console.log('  4. Final roster: Should show "ThirdUsername"');
  console.log('\nCheck the output above to verify behavior!\n');
  
  // Cleanup
  setTimeout(() => {
    try { ws1.close(); } catch (e) {}
    try { ws2.close(); } catch (e) {}
    process.exit(0);
  }, 1000);
}

// Start test
console.log('Starting username change test...\n');
runTest().catch(error => {
  console.error('Test error:', error);
  process.exit(1);
});
