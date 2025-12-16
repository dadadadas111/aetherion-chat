/**
 * Test script for lobby race condition
 * Tests simultaneous lobby joins to ensure roster data is correct
 */

const WebSocket = require('ws');

// Configuration
const WS_URL = 'ws://localhost:3000';
const LOBBY_ID = 'RACE_TEST_LOBBY';

// Test users
const users = [
  { userId: 'race_001', username: 'Player1', characterId: 'char_001' },
  { userId: 'race_002', username: 'Player2', characterId: 'char_002' },
  { userId: 'race_003', username: 'Player3', characterId: 'char_003' },
  { userId: 'race_004', username: 'Player4', characterId: 'char_004' },
  { userId: 'race_005', username: 'Player5', characterId: 'char_005' }
];

let connections = [];
let rosterReceived = {};

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
  console.log('=== Connecting users ===\n');
  
  for (const user of users) {
    const ws = new WebSocket(WS_URL);
    
    await new Promise((resolve, reject) => {
      ws.on('open', () => {
        console.log(`✓ ${user.username} connected`);
        
        // Authenticate
        sendMessage(ws, 'auth', {
          userId: user.userId,
          username: user.username,
          friendIds: [],
          characterId: user.characterId
        });
        
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          
          if (msg.type === 'auth_success') {
            console.log(`✓ ${user.username} authenticated`);
            resolve();
          } 
          else if (msg.type === 'lobby_event') {
            if (msg.eventType === 'lobby_roster') {
              if (!rosterReceived[user.userId]) {
                rosterReceived[user.userId] = [];
              }
              rosterReceived[user.userId].push({
                timestamp: new Date().toISOString(),
                memberCount: msg.members.length,
                members: msg.members.map(m => ({
                  userId: m.userId,
                  username: m.username,
                  characterId: m.characterId
                }))
              });
              
              console.log(`\n[${user.username} ROSTER UPDATE #${rosterReceived[user.userId].length}]`);
              console.log(`  Members: ${msg.members.length}`);
              msg.members.forEach(m => {
                console.log(`    - ${m.username} (${m.userId}): ${m.characterId || 'No character'}`);
              });
            }
            else if (msg.eventType === 'member_left') {
              console.log(`\n[${user.username} MEMBER LEFT]: ${msg.username}`);
            }
          }
          else if (msg.type === 'ack') {
            if (msg.action === 'lobby_subscribe') {
              console.log(`✓ ${user.username} ${msg.success ? 'joined' : 'FAILED to join'} lobby`);
            }
          }
          else if (msg.type === 'error') {
            console.error(`✗ ${user.username} ERROR: ${msg.error}`);
          }
        });
      });
      
      ws.on('error', reject);
    });
    
    connections.push({ ...user, ws });
  }
  
  console.log('\n');
}

// Test: Sequential joins (baseline)
async function testSequentialJoins() {
  console.log('=== TEST 1: Sequential Joins (Baseline) ===\n');
  rosterReceived = {};
  
  for (let i = 0; i < 3; i++) {
    const conn = connections[i];
    console.log(`${conn.username} joining...`);
    sendMessage(conn.ws, 'lobby_subscribe', { lobbyId: LOBBY_ID });
    await wait(500); // Wait between joins
  }
  
  await wait(1000);
  
  console.log('\n--- Sequential Join Results ---');
  verifyRosterData(3);
}

// Test: Simultaneous joins (race condition test)
async function testSimultaneousJoins() {
  console.log('\n=== TEST 2: Simultaneous Joins (Race Condition Test) ===\n');
  
  // Leave lobby first
  for (let i = 0; i < 3; i++) {
    sendMessage(connections[i].ws, 'lobby_unsubscribe', { lobbyId: LOBBY_ID });
  }
  await wait(1000);
  
  rosterReceived = {};
  
  // All 3 users join at the exact same time
  console.log('All users joining simultaneously...');
  const joinPromises = [];
  for (let i = 0; i < 3; i++) {
    sendMessage(connections[i].ws, 'lobby_subscribe', { lobbyId: LOBBY_ID });
  }
  
  await wait(1500);
  
  console.log('\n--- Simultaneous Join Results ---');
  verifyRosterData(3);
}

// Test: Rapid successive joins (very short delays)
async function testRapidJoins() {
  console.log('\n=== TEST 3: Rapid Successive Joins (10ms delays) ===\n');
  
  // Leave lobby first
  for (let i = 0; i < 3; i++) {
    sendMessage(connections[i].ws, 'lobby_unsubscribe', { lobbyId: LOBBY_ID });
  }
  await wait(1000);
  
  rosterReceived = {};
  
  console.log('Users joining with 10ms delays...');
  for (let i = 0; i < 3; i++) {
    const conn = connections[i];
    console.log(`${conn.username} joining...`);
    sendMessage(conn.ws, 'lobby_subscribe', { lobbyId: LOBBY_ID });
    await wait(10); // Very short delay
  }
  
  await wait(1500);
  
  console.log('\n--- Rapid Join Results ---');
  verifyRosterData(3);
}

// Test: 5 users joining simultaneously
async function testMassSimultaneousJoins() {
  console.log('\n=== TEST 4: Mass Simultaneous Joins (5 users at once) ===\n');
  
  // Leave lobby first
  for (let i = 0; i < 3; i++) {
    sendMessage(connections[i].ws, 'lobby_unsubscribe', { lobbyId: LOBBY_ID });
  }
  await wait(1000);
  
  rosterReceived = {};
  
  console.log('All 5 users joining simultaneously...');
  for (let i = 0; i < 5; i++) {
    sendMessage(connections[i].ws, 'lobby_subscribe', { lobbyId: LOBBY_ID });
  }
  
  await wait(2000);
  
  console.log('\n--- Mass Join Results ---');
  verifyRosterData(5);
}

// Verify roster data integrity
function verifyRosterData(expectedCount) {
  let allPassed = true;
  
  for (const [userId, rosters] of Object.entries(rosterReceived)) {
    const user = users.find(u => u.userId === userId);
    const latestRoster = rosters[rosters.length - 1];
    
    console.log(`\n${user.username}:`);
    console.log(`  Total roster updates: ${rosters.length}`);
    console.log(`  Final member count: ${latestRoster.memberCount}`);
    
    // Check if final roster has all expected members
    if (latestRoster.memberCount !== expectedCount) {
      console.log(`  ✗ FAILED: Expected ${expectedCount} members, got ${latestRoster.memberCount}`);
      allPassed = false;
    } else {
      console.log(`  ✓ PASSED: Correct member count`);
    }
    
    // Check for duplicate userIds in roster
    const userIds = latestRoster.members.map(m => m.userId);
    const uniqueIds = new Set(userIds);
    if (userIds.length !== uniqueIds.size) {
      console.log(`  ✗ FAILED: Duplicate userIds in roster`);
      allPassed = false;
    } else {
      console.log(`  ✓ PASSED: No duplicate members`);
    }
    
    // Check if all members have character IDs
    const missingCharacters = latestRoster.members.filter(m => !m.characterId);
    if (missingCharacters.length > 0) {
      console.log(`  ✗ WARNING: ${missingCharacters.length} members missing character IDs`);
    } else {
      console.log(`  ✓ PASSED: All members have character IDs`);
    }
  }
  
  return allPassed;
}

// Run all tests
async function runTests() {
  try {
    await connectUsers();
    
    await testSequentialJoins();
    await testSimultaneousJoins();
    await testRapidJoins();
    await testMassSimultaneousJoins();
    
    console.log('\n\n=== FINAL SUMMARY ===');
    console.log('All race condition tests completed!');
    console.log('Review the results above to ensure:');
    console.log('  1. All members receive correct final roster');
    console.log('  2. No duplicate members in any roster');
    console.log('  3. All character IDs are preserved');
    console.log('  4. Member counts match expected values\n');
    
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    // Close connections
    console.log('=== Closing connections ===');
    connections.forEach(conn => {
      try {
        conn.ws.close();
      } catch (e) {}
    });
    setTimeout(() => process.exit(0), 1000);
  }
}

// Start tests
console.log('Starting race condition test...\n');
console.log('This will test:');
console.log('  1. Sequential joins (baseline)');
console.log('  2. Simultaneous joins (main race condition test)');
console.log('  3. Rapid successive joins (10ms delays)');
console.log('  4. Mass simultaneous joins (5 users)\n');
runTests();
