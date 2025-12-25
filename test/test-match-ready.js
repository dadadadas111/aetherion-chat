const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const USERIDLIST = [
    'RXXK2W4wwcfvBbG9JguSA6FgWne2',
    'Ar1fagtEbcbVlidlOzbyGOTMaWF3',
    '172ygbWeyGPbN98mIEBSrcvBA7x1',
    'H2zt7d9dP5e8f9ZolmjgFHOo8j42',
    'vASQCJ7Ibfb2XCyeeFNDbRQpRPI2',
    'l3M85x0CBTRat356wOsKdd1mCR72',
]

// Usage: node test/test-match-ready.js [numClients] [matchSize] [serverWs] [matchId]
const NUM_CLIENTS = parseInt(process.argv[2], 10) || 6;
const MATCH_SIZE = parseInt(process.argv[3], 10) || NUM_CLIENTS;
const SERVER_WS = process.argv[4] || process.env.SERVER_WS || 'ws://localhost:3000';
const MATCH_ID = process.argv[5] || uuidv4();

console.log(`Test: ${NUM_CLIENTS} clients -> server ${SERVER_WS} | matchId=${MATCH_ID} matchSize=${MATCH_SIZE}`);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const clients = [];
  let lastWillStartAt = null;

  for (let i = 0; i < NUM_CLIENTS; i++) {
    const userId = USERIDLIST[i % USERIDLIST.length];
    const username = `tester${i}`;
    const team = (i % 2 === 0) ? 'A' : 'B';

    const ws = new WebSocket(SERVER_WS);

    ws.on('open', async () => {
      // auth
      ws.send(JSON.stringify({ action: 'auth', userId, username }));

      // small stagger before registering to simulate race
      await sleep(Math.floor(Math.random() * 300));

      const payload = {
        matchId: MATCH_ID,
        matchSize: MATCH_SIZE,
        isready: true,
        team: team,
        map: 0,
        matchMode: 'Ranked',
        name: `test-${MATCH_ID}`
      };

      console.log(`[Client ${i}] Sending match_register: id=${MATCH_ID} size=${MATCH_SIZE} team=${team} ready=True`);
      ws.send(JSON.stringify({ action: 'match_register', ...payload }));

      // one client will poll status periodically to show updates
      if (i === 0) {
        setInterval(() => {
          ws.send(JSON.stringify({ action: 'match_status', matchId: MATCH_ID }));
        }, 800);
      }
    });

    ws.on('message', (msg) => {
      try {
        const data = JSON.parse(msg.toString());

        // server broadcasts type: 'match_status' messages
        if (data.type === 'match_status' || (data.action === 'match_status')) {
          const isReady = data.isMatchReady || data.isReady || false;
          const will = data.matchWillStartAt || data.matchWillStartAt === 0 ? Number(data.matchWillStartAt) : null;
          const sWill = will ? new Date(will).toISOString() : 'null';
          console.log(`[Client ${i}] match_status: id=${MATCH_ID} ready=${isReady} willStartAt=${will} (${sWill})`);

          if (will) {
            if (lastWillStartAt && will < lastWillStartAt - 500) {
              console.log(`>>> willStartAt reduced from ${lastWillStartAt} to ${will}`);
            }
            lastWillStartAt = will;
          }

          // when ready and start decided, stop after short delay
          if (isReady && will && will <= Date.now() + 15000) {
            console.log('Match ready and start scheduled soon; exiting test in 5s.');
            setTimeout(() => process.exit(0), 5000);
          }
        } else if (data.type === 'ack' && data.action === 'match_register') {
          // ack for register
          const will = data.matchWillStartAt || null;
          console.log(`[Client ${i}] ack match_register: willStartAt=${will}`);
        }
      } catch (e) {
        // ignore
      }
    });

    ws.on('error', (err) => {
      console.error(`[Client ${i}] ws error:`, err.message);
    });

    clients.push(ws);
    // slight stagger for connection creation
    await sleep(50);
  }

  // safety timeout
  setTimeout(() => {
    console.log('Test timeout reached, exiting.');
    process.exit(0);
  }, 120000);
}

run().catch(err => { console.error(err); process.exit(1); });
