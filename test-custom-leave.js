// Test script: simulate leaving in a Custom-mode lobby
// Usage:
// 1) Start server: npm start
// 2) Run this script: node test-custom-leave.js

const WebSocket = require('ws');

const WS_URL = 'ws://localhost:3000';
const LOBBY_ID = 'TEST_CUSTOM_LOBBY_Alpha';

const HOST = { userId: 'host_TEST_01', username: 'HostTester' };
const PLAYER = { userId: 'player_TEST_02', username: 'LeftPlayer' };

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function makeClient(name, identity) {
  const ws = new WebSocket(WS_URL);
  ws.on('open', () => console.log(`[${name}] connected`));
  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      console.log(`[${name}] <-`, JSON.stringify(data));
    } catch (e) {
      console.log(`[${name}] <- (raw)`, msg.toString());
    }
  });
  ws.on('close', () => console.log(`[${name}] closed`));
  ws.on('error', (err) => console.error(`[${name}] error`, err.message));
  return {
    name,
    identity,
    ws,
    send(action, payload = {}) {
      const message = { action, ...payload };
      try {
        ws.send(JSON.stringify(message));
        console.log(`[${name}] ->`, JSON.stringify(message));
      } catch (e) {
        console.error(`[${name}] send error`, e.message);
      }
    }
  };
}

(async () => {
  console.log('Test start: Custom-mode leave scenario for lobby', LOBBY_ID);

  const host = makeClient('HOST', HOST);
  const player = makeClient('PLAYER', PLAYER);

  // Wait for sockets to open
  await sleep(500);

  // Authenticate both (host first)
  host.send('auth', { userId: HOST.userId, username: HOST.username, friendIds: [], characterId: 'char_host' });
  await sleep(200);

  // Host subscribes to lobby
  host.send('lobby_subscribe', { lobbyId: LOBBY_ID });
  await sleep(300);

  // Host switches lobby to Custom mode
  host.send('change_mode', { lobbyId: LOBBY_ID, gameMode: 'Custom' });
  await sleep(500);

  // Player authenticates and joins the same lobby
  player.send('auth', { userId: PLAYER.userId, username: PLAYER.username, friendIds: [], characterId: 'char_player' });
  await sleep(200);
  player.send('lobby_subscribe', { lobbyId: LOBBY_ID });
  await sleep(800);

  // Now player leaves the lobby (simulate manual leave)
  console.log('\n-- Player will leave now --');
  player.send('lobby_unsubscribe', { lobbyId: LOBBY_ID });
  await sleep(800);

  // Optionally request roster from host to confirm custom roster broadcast handled
  console.log('\n-- Host requests custom roster (get_custom_roster) --');
  host.send('get_custom_roster', { lobbyId: LOBBY_ID });
  await sleep(800);

  // Close connections
  player.ws.close();
  await sleep(200);
  host.ws.close();

  console.log('Test finished');
  process.exit(0);
})();
