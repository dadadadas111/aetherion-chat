/**
 * Test script for Spectator slots and isHost flag
 * Verifies: server includes `isHost` and `isSpectator` in `custom_lobby_roster`
 */

const WebSocket = require('ws');

const WS_URL = 'ws://localhost:3000';
const LOBBY_ID = 'SPECTATOR_TEST_LOBBY';

// Host + 7 players to ensure spectators are used (6 player slots + 3 spectators supported server-side)
const users = [
  { userId: 'host_u', username: 'Host', characterId: 'c1' },
  { userId: 'p2', username: 'P2', characterId: 'c2' },
  { userId: 'p3', username: 'P3', characterId: 'c3' },
  { userId: 'p4', username: 'P4', characterId: 'c4' },
  { userId: 'p5', username: 'P5', characterId: 'c5' },
  { userId: 'p6', username: 'P6', characterId: 'c6' },
  { userId: 'p7', username: 'P7', characterId: 'c7' },
  { userId: 'p8', username: 'P8', characterId: 'c8' }
];

const connections = new Map();
let latestRoster = null;
const rosterHistory = [];

const wait = ms => new Promise(r => setTimeout(r, ms));

function connectUser(user) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);

    ws.on('open', () => {
      ws.send(JSON.stringify({ action: 'auth', userId: user.userId, username: user.username, characterId: user.characterId }));
    });

    ws.on('message', raw => {
      let data = {};
      try { data = JSON.parse(raw.toString()); } catch (e) { data = { raw: raw.toString() } }

      // debug: log all inbound messages for visibility
      console.log(`[${user.userId}] <-`, data.eventType || data.type || '(no-type)', Object.assign({}, data));

      // capture roster broadcasts
      if (data.eventType === 'custom_lobby_roster') {
        latestRoster = data.customRoster || [];
        rosterHistory.push(latestRoster);
      }

      if (data.type === 'auth_success') {
        connections.set(user.userId, { ws, user });
        resolve(ws);
      }
    });

    ws.on('error', err => reject(err));
    ws.on('close', () => {});
  });
}

async function run() {
  console.log('Connecting users...');
  for (const u of users) {
    try {
      await connectUser(u);
      await wait(200);
    } catch (e) {
      console.error('Connect error for', u.userId, e.message);
      process.exit(1);
    }
  }

  console.log('Host creating lobby and switching to Custom mode...');
  const host = connections.get('host_u');
  host.ws.send(JSON.stringify({ action: 'lobby_subscribe', lobbyId: LOBBY_ID }));
  await wait(300);
  host.ws.send(JSON.stringify({ action: 'change_mode', lobbyId: LOBBY_ID, gameMode: 'Custom' }));
  await wait(500);

  console.log('Other players subscribing...');
  for (let i = 1; i < users.length; i++) {
    const c = connections.get(users[i].userId);
    c.ws.send(JSON.stringify({ action: 'lobby_subscribe', lobbyId: LOBBY_ID }));
    await wait(200);
  }

  // Wait for roster broadcasts to settle
  await wait(1500);

  // Request an explicit roster from one client to force server send
  const anyClient = connections.get('p2');
  anyClient.ws.send(JSON.stringify({ action: 'get_custom_roster', lobbyId: LOBBY_ID }));
  await wait(800);

  // Validate roster structure: accept any historical snapshot that shows host + at least one spectator
  if (rosterHistory.length === 0) {
    console.error('✗ FAILED: No roster received at all');
    cleanup(1);
    return;
  }

  const snapshotWithHostAndSpectator = rosterHistory.find(snap => {
    const hostEntry = snap.find(r => r.userId === 'host_u' && r.isHost === true);
    const hasSpectator = snap.some(r => r.isSpectator === true);
    return hostEntry && hasSpectator;
  });

  if (!snapshotWithHostAndSpectator) {
    console.error('✗ FAILED: No roster snapshot contained both host (isHost=true) and spectators');
    console.log('History length:', rosterHistory.length);
    console.log('Last roster payload:', JSON.stringify(latestRoster, null, 2));
    cleanup(1);
    return;
  }

  // Use that snapshot for reporting
  const hostEntry = snapshotWithHostAndSpectator.find(r => r.userId === 'host_u');
  const spectatorEntries = snapshotWithHostAndSpectator.filter(r => r.isSpectator === true);

  console.log('✓ PASSED: Host flag present and spectators detected');
  console.log('Spectators:', spectatorEntries.map(s => ({ userId: s.userId, slot: s.slotIndex })));

  // Done
  cleanup(0);
}

function cleanup(code = 0) {
  connections.forEach(({ ws }) => {
    try { ws.close(); } catch (e) {}
  });
  process.exit(code);
}

run().catch(err => { console.error('Test error:', err); cleanup(1); });
