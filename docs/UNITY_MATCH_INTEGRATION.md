**Unity Match Integration**

Purpose: Short reference for Unity clients describing websocket actions, expected payloads, server events, and the external REST call triggered when a match start is decided. This is a behavioral spec only — no coding guidance.

Prerequisites
 - Clients must authenticate via the existing websocket `auth` message before using these actions. The server uses the authenticated `userId` as authoritative.

WebSocket Actions
 - `match_register` — register or update a player's readiness/team for a match.
   - Payload fields:
     - `matchId` (string) — required
     - `matchSize` (integer) — required
     - `isready` (boolean)
     - `matchMode` (string) — optional
     - `map` (integer) — optional
     - `team` (string) — allowed: `A` or `B`
     - `name` (string) — optional, used in REST payload
   - Behavior: server merges each player's entry in Redis. If not all players are ready the server provides a default `matchWillStartAt` (1 minute). When all players registered and ready the server sets a single start time 10 seconds ahead (atomic via Redis) and triggers the external REST start request.

 - `match_status` — request current match registration/readiness.
   - Payload fields:
     - `matchId` (string) — required

Responses / Events
 - Acknowledgements for these actions include (example fields):
   - `success` (boolean)
   - `matchId` (string)
   - `registeredCount` (integer)
   - `matchSize` (integer)
   - `isMatchReady` (boolean)
   - `matchWillStartAt` (number) — epoch milliseconds UTC
   - `players` (array) — entries with `playerId`, `isReady`, `team`, `matchMode`, `map`, `updatedAt`

 - The server also broadcasts websocket messages of type `match_status` to connected players in the match when state changes. The broadcast payload mirrors the acknowledgement structure and includes `timestamp`.

External REST Callback (server -> game server)
 - When the server decides the final start time it POSTs JSON to `MATCH_START_URL` (environment variable; default `https://aetherion.dash.id.vn/api/Matches/start`).
 - Payload shape follows this example:

 {
   "matchId": "string",
   "name": "string",
   "mode": "string",
   "map": 0,
   "players": [
     { "userId": "string", "team": "A" }
   ]
 }

Data rules / notes
 - `team` is accepted only as `A` or `B` (stored as `null` otherwise).
 - `matchWillStartAt` is epoch milliseconds (UTC). Default (not-ready) = now + 60s. When all ready = now + 10s.
 - The server uses Redis NX to ensure only one process sets the final start time and issues the REST call; rely on server-provided `matchWillStartAt` for synchronization.

Where to look in repo
 - Handler implementation: `src/handlers/MatchReadyHandler.js`
 - Websocket routing: `src/server.js` (actions `match_register`, `match_status`)

No client-side start call
 - The server will call the external Matches API when it decides the start time. Clients should not call that API directly.

---
