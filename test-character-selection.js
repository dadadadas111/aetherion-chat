/**
 * Test script for character selection system
 * Tests character registration, updates, and lobby roster synchronization
 */

const WebSocket = require('ws');

// Configuration
const WS_URL = 'ws://localhost:3000';
const LOBBY_ID = 'CHARACTER_TEST_LOBBY';

// Test users with characters
const users = [
  { userId: 'char_player_001', username: 'WarriorMain', characterId: 'warrior_skin_01' },
  { userId: 'char_player_002', username: 'MageMain', characterId: 'mage_skin_02' },
  { userId: 'char_player_003', username: 'RogueMain', characterId: 'rogue_skin_03' }
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
  console.log('=== Connecting users with character IDs ===\n');
  
  for (const user of users) {
    const ws = new WebSocket(WS_URL);
    
    await new Promise((resolve, reject) => {
      ws.on('open', () => {
        console.log(`${user.username} connected`);
        
        // Authenticate with character ID
        sendMessage(ws, 'auth', {
          userId: user.userId,
          username: user.username,
          friendIds: [],
          characterId: user.characterId  // NEW: Include character
        });
        
        ws.on('message', (data) => {
          const msg = JSON.parse(data.toString());
          
          if (msg.type === 'auth_success') {
            console.log(`${user.username} authenticated with character: ${user.characterId}`);
            resolve();
          } 
          else if (msg.type === 'lobby_event') {
            if (msg.eventType === 'lobby_roster') {
              console.log(`\n[${user.username} RECEIVED ROSTER]:`);
              console.log(`  Lobby: ${msg.lobbyId}`);
              console.log(`  Members:`);
              msg.members.forEach(member => {
                console.log(`    - ${member.username} (${member.userId}): ${member.characterId || 'No character'}`);
              });
              console.log();
            }
            else if (msg.eventType === 'character_changed') {
              console.log(`\n[${user.username} RECEIVED CHARACTER CHANGE]:`);
              console.log(`  Player: ${msg.username} (${msg.userId})`);
              console.log(`  New Character: ${msg.characterId}`);
              console.log(`  Lobby: ${msg.lobbyId}\n`);
            }
            else if (msg.eventType === 'member_left') {
              console.log(`\n[${user.username} RECEIVED MEMBER LEFT]:`);
              console.log(`  Player: ${msg.username} (${msg.userId})`);
              console.log(`  Lobby: ${msg.lobbyId}\n`);
            }
          } 
          else if (msg.type === 'ack') {
            if (msg.action === 'lobby_subscribe' && msg.success) {
              console.log(`${user.username} successfully subscribed to lobby`);
            }
          }
          else if (msg.type === 'error') {
            console.error(`${user.username} ERROR: ${msg.error}`);
          }
        });
      });
      
      ws.on('error', reject);
    });
    
    connections.push({ ...user, ws });
  }
}

// Subscribe users to lobby
async function subscribeToLobby(userIndex) {
  const conn = connections[userIndex];
  console.log(`\n--- ${conn.username} joining lobby ---`);
  sendMessage(conn.ws, 'lobby_subscribe', { lobbyId: LOBBY_ID });
  await wait(800);
}

// Change character
async function changeCharacter(userIndex, newCharacterId) {
  const conn = connections[userIndex];
  console.log(`\n--- ${conn.username} changing character to ${newCharacterId} ---`);
  sendMessage(conn.ws, 'update_status', {
    status: 'online',
    characterId: newCharacterId
  });
  await wait(800);
}

// Run tests
async function runTests() {
  try {
    await connectUsers();
    
    console.log('\n=== TEST 1: First player joins lobby (empty roster) ===');
    await subscribeToLobby(0);
    
    console.log('\n=== TEST 2: Second player joins (should see first player\'s character) ===');
    await subscribeToLobby(1);
    
    console.log('\n=== TEST 3: Third player joins (should see both existing players) ===');
    await subscribeToLobby(2);
    
    console.log('\n=== TEST 4: Player 1 changes character ===');
    await changeCharacter(0, 'warrior_legendary_skin');
    
    console.log('\n=== TEST 5: Player 2 changes character ===');
    await changeCharacter(1, 'mage_fire_skin');
    
    console.log('\n=== TEST 6: Player 3 changes character ===');
    await changeCharacter(2, 'rogue_shadow_skin');
    
    console.log('\n=== TEST 7: Player 2 disconnects (member_left event) ===');
    connections[1].ws.close();
    await wait(1000);
    
    console.log('\n=== All character selection tests completed ===\n');
    
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    // Close connections
    console.log('=== Closing connections ===');
    connections.forEach(conn => conn.ws.close());
    setTimeout(() => process.exit(0), 1000);
  }
}

// Start tests
console.log('Starting character selection test...\n');
runTests();
