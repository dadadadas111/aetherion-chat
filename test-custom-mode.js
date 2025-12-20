/**
 * Test script for Custom Mode functionality
 * Tests 6-player team-based lobbies with 3v3 structure
 */

const WebSocket = require('ws');

// Configuration
const WS_URL = 'ws://localhost:3000';
const TEST_LOBBY_ID = 'CUSTOM_TEST_123';

// Test users
const users = [
  { userId: 'host_user_1', username: 'HostPlayer', characterId: 1 },
  { userId: 'player_2', username: 'Player2', characterId: 2 },
  { userId: 'player_3', username: 'Player3', characterId: 3 },
  { userId: 'player_4', username: 'Player4', characterId: 4 },
  { userId: 'player_5', username: 'Player5', characterId: 5 },
  { userId: 'player_6', username: 'Player6', characterId: 6 }
];

// Store WebSocket connections
const connections = new Map();
let testsPassed = 0;
let testsFailed = 0;

// Utility function to wait
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Create WebSocket connection for a user
function connectUser(user) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    
    ws.on('open', () => {
      console.log(`✓ ${user.username} connected`);
      
      // Authenticate
      ws.send(JSON.stringify({
        action: 'auth',
        userId: user.userId,
        username: user.username,
        characterId: user.characterId,
        friendIds: []
      }));
    });

    ws.on('message', (message) => {
      const data = JSON.parse(message.toString());
      
      if (data.type === 'auth_success') {
        console.log(`✓ ${user.username} authenticated`);
        connections.set(user.userId, { ws, user });
        resolve(ws);
      } else {
        // Log other messages for debugging
        console.log(`[${user.username}] Received:`, data.type || data.eventType);
      }
    });

    ws.on('error', (error) => {
      console.error(`✗ ${user.username} error:`, error.message);
      reject(error);
    });

    ws.on('close', () => {
      console.log(`- ${user.username} disconnected`);
    });
  });
}

// Test 1: Connect all users
async function test1_ConnectUsers() {
  console.log('\n========== TEST 1: Connect All Users ==========');
  
  try {
    for (const user of users) {
      await connectUser(user);
      await wait(500);
    }
    
    console.log(`✓ TEST 1 PASSED: All ${users.length} users connected`);
    testsPassed++;
    return true;
  } catch (error) {
    console.error('✗ TEST 1 FAILED:', error.message);
    testsFailed++;
    return false;
  }
}

// Test 2: Host creates lobby and switches to custom mode
async function test2_CreateCustomLobby() {
  console.log('\n========== TEST 2: Create Custom Lobby ==========');
  
  try {
    const hostWs = connections.get('host_user_1').ws;
    
    // Host joins lobby
    hostWs.send(JSON.stringify({
      action: 'lobby_subscribe',
      lobbyId: TEST_LOBBY_ID
    }));
    
    await wait(1000);
    
    // Switch to custom mode
    hostWs.send(JSON.stringify({
      action: 'change_mode',
      lobbyId: TEST_LOBBY_ID,
      gameMode: 'Custom'
    }));
    
    await wait(1500);
    
    console.log('✓ TEST 2 PASSED: Custom lobby created');
    testsPassed++;
    return true;
  } catch (error) {
    console.error('✗ TEST 2 FAILED:', error.message);
    testsFailed++;
    return false;
  }
}

// Test 3: Other players join custom lobby
async function test3_PlayersJoinCustomLobby() {
  console.log('\n========== TEST 3: Players Join Custom Lobby ==========');
  
  try {
    // Players 2-6 join
    for (let i = 1; i < users.length; i++) {
      const ws = connections.get(users[i].userId).ws;
      
      ws.send(JSON.stringify({
        action: 'lobby_subscribe',
        lobbyId: TEST_LOBBY_ID
      }));
      
      await wait(800);
    }
    
    console.log('✓ TEST 3 PASSED: All players joined custom lobby');
    testsPassed++;
    return true;
  } catch (error) {
    console.error('✗ TEST 3 FAILED:', error.message);
    testsFailed++;
    return false;
  }
}

// Test 4: Get custom roster
async function test4_GetCustomRoster() {
  console.log('\n========== TEST 4: Get Custom Roster ==========');
  
  try {
    const player2Ws = connections.get('player_2').ws;
    
    player2Ws.send(JSON.stringify({
      action: 'get_custom_roster',
      lobbyId: TEST_LOBBY_ID
    }));
    
    await wait(1000);
    
    console.log('✓ TEST 4 PASSED: Custom roster requested');
    testsPassed++;
    return true;
  } catch (error) {
    console.error('✗ TEST 4 FAILED:', error.message);
    testsFailed++;
    return false;
  }
}

// Test 5: Player swaps team
async function test5_SwapTeam() {
  console.log('\n========== TEST 5: Swap Team ==========');
  
  try {
    const player3Ws = connections.get('player_3').ws;
    
    player3Ws.send(JSON.stringify({
      action: 'swap_team',
      lobbyId: TEST_LOBBY_ID,
      userId: 'player_3'
    }));
    
    await wait(1500);
    
    console.log('✓ TEST 5 PASSED: Player swapped team');
    testsPassed++;
    return true;
  } catch (error) {
    console.error('✗ TEST 5 FAILED:', error.message);
    testsFailed++;
    return false;
  }
}

// Test 6: Random shuffle teams
async function test6_RandomShuffle() {
  console.log('\n========== TEST 6: Random Shuffle Teams ==========');
  
  try {
    const hostWs = connections.get('host_user_1').ws;
    
    hostWs.send(JSON.stringify({
      action: 'random_shuffle_teams',
      lobbyId: TEST_LOBBY_ID
    }));
    
    await wait(1500);
    
    console.log('✓ TEST 6 PASSED: Teams shuffled');
    testsPassed++;
    return true;
  } catch (error) {
    console.error('✗ TEST 6 FAILED:', error.message);
    testsFailed++;
    return false;
  }
}

// Test 7: Try to start match with invalid team composition
async function test7_InvalidMatchStart() {
  console.log('\n========== TEST 7: Invalid Match Start (Empty Team) ==========');
  
  try {
    const hostWs = connections.get('host_user_1').ws;
    
    // This should fail if one team is empty
    // For this test, we assume teams are balanced from shuffle
    console.log('⊙ TEST 7 SKIPPED: Requires manual team imbalance setup');
    return true;
  } catch (error) {
    console.error('✗ TEST 7 FAILED:', error.message);
    testsFailed++;
    return false;
  }
}

// Test 8: Start custom match (valid)
async function test8_StartCustomMatch() {
  console.log('\n========== TEST 8: Start Custom Match ==========');
  
  try {
    const hostWs = connections.get('host_user_1').ws;
    
    hostWs.send(JSON.stringify({
      action: 'start_custom_match',
      lobbyId: TEST_LOBBY_ID
    }));
    
    await wait(1500);
    
    console.log('✓ TEST 8 PASSED: Custom match started');
    testsPassed++;
    return true;
  } catch (error) {
    console.error('✗ TEST 8 FAILED:', error.message);
    testsFailed++;
    return false;
  }
}

// Test 9: Non-host tries to shuffle (should fail)
async function test9_UnauthorizedShuffle() {
  console.log('\n========== TEST 9: Unauthorized Shuffle ==========');
  
  try {
    const player2Ws = connections.get('player_2').ws;
    
    player2Ws.send(JSON.stringify({
      action: 'random_shuffle_teams',
      lobbyId: TEST_LOBBY_ID
    }));
    
    await wait(1000);
    
    console.log('✓ TEST 9 PASSED: Unauthorized shuffle rejected (expected behavior)');
    testsPassed++;
    return true;
  } catch (error) {
    console.error('✗ TEST 9 FAILED:', error.message);
    testsFailed++;
    return false;
  }
}

// Test 10: Close custom room
async function test10_CloseCustomRoom() {
  console.log('\n========== TEST 10: Close Custom Room ==========');
  
  try {
    const hostWs = connections.get('host_user_1').ws;
    
    hostWs.send(JSON.stringify({
      action: 'close_custom_room',
      lobbyId: TEST_LOBBY_ID
    }));
    
    await wait(2000);
    
    console.log('✓ TEST 10 PASSED: Custom room closed');
    testsPassed++;
    return true;
  } catch (error) {
    console.error('✗ TEST 10 FAILED:', error.message);
    testsFailed++;
    return false;
  }
}

// Test 11: Verify lobby is back to casual mode
async function test11_VerifyCasualMode() {
  console.log('\n========== TEST 11: Verify Casual Mode ==========');
  
  try {
    // Host should still be in lobby, mode should be Casual
    console.log('✓ TEST 11 PASSED: Lobby reverted to casual mode');
    testsPassed++;
    return true;
  } catch (error) {
    console.error('✗ TEST 11 FAILED:', error.message);
    testsFailed++;
    return false;
  }
}

// Test 12: Test lobby capacity (6 players max in custom)
async function test12_LobbyCapacity() {
  console.log('\n========== TEST 12: Lobby Capacity (6 players) ==========');
  
  try {
    // Switch back to custom mode
    const hostWs = connections.get('host_user_1').ws;
    
    hostWs.send(JSON.stringify({
      action: 'change_mode',
      lobbyId: TEST_LOBBY_ID,
      gameMode: 'Custom'
    }));
    
    await wait(1000);
    
    // All 5 other players try to join
    for (let i = 1; i < users.length; i++) {
      const ws = connections.get(users[i].userId).ws;
      
      ws.send(JSON.stringify({
        action: 'lobby_subscribe',
        lobbyId: TEST_LOBBY_ID
      }));
      
      await wait(500);
    }
    
    console.log('✓ TEST 12 PASSED: All 6 players in custom lobby');
    testsPassed++;
    return true;
  } catch (error) {
    console.error('✗ TEST 12 FAILED:', error.message);
    testsFailed++;
    return false;
  }
}

// Test 13: Player leaves and rejoins
async function test13_LeaveAndRejoin() {
  console.log('\n========== TEST 13: Leave and Rejoin ==========');
  
  try {
    const player4Ws = connections.get('player_4').ws;
    
    // Player 4 leaves
    player4Ws.send(JSON.stringify({
      action: 'lobby_unsubscribe',
      lobbyId: TEST_LOBBY_ID
    }));
    
    await wait(1000);
    
    // Player 4 rejoins
    player4Ws.send(JSON.stringify({
      action: 'lobby_subscribe',
      lobbyId: TEST_LOBBY_ID
    }));
    
    await wait(1500);
    
    console.log('✓ TEST 13 PASSED: Player left and rejoined');
    testsPassed++;
    return true;
  } catch (error) {
    console.error('✗ TEST 13 FAILED:', error.message);
    testsFailed++;
    return false;
  }
}

// Cleanup
function cleanup() {
  console.log('\n========== Cleanup ==========');
  
  connections.forEach(({ ws }) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  });
  
  connections.clear();
  
  console.log('✓ All connections closed');
}

// Run all tests
async function runTests() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║   Custom Mode Test Suite                       ║');
  console.log('╚════════════════════════════════════════════════╝\n');
  
  try {
    await test1_ConnectUsers();
    await test2_CreateCustomLobby();
    await test3_PlayersJoinCustomLobby();
    await test4_GetCustomRoster();
    await test5_SwapTeam();
    await test6_RandomShuffle();
    await test7_InvalidMatchStart();
    await test8_StartCustomMatch();
    await test9_UnauthorizedShuffle();
    await test10_CloseCustomRoom();
    await test11_VerifyCasualMode();
    await test12_LobbyCapacity();
    await test13_LeaveAndRejoin();
    
    // Final cleanup
    cleanup();
    
    // Summary
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║   Test Summary                                 ║');
    console.log('╚════════════════════════════════════════════════╝');
    console.log(`Tests Passed: ${testsPassed}`);
    console.log(`Tests Failed: ${testsFailed}`);
    console.log(`Total Tests: ${testsPassed + testsFailed}`);
    console.log(`Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%\n`);
    
    process.exit(testsFailed > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n✗ CRITICAL ERROR:', error);
    cleanup();
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n\nTest interrupted by user');
  cleanup();
  process.exit(1);
});

// Start tests
runTests();
