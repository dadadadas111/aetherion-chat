# Redis Lobby System Redesign - Summary

## What Changed

### Old System Problems
- Lobby state split between in-memory (ConnectionManager) and ad-hoc broadcasts
- No persistent lobby state in Redis
- Roster updates via `setInterval` rather than event-driven
- Character changes handled in multiple places
- Complex flow with redundant logic

### New System
- **Redis as single source of truth** for all lobby state
- Clean pattern: **Update Redis → Broadcast**
- Event-driven updates (no reliance on periodic sync as primary mechanism)
- Centralized lobby logic in LobbyManager + LobbyEventsHandler

## Files Changed

### 1. `src/managers/LobbyManager.js` (NEW)
- Redis operations for lobby state
- Methods: addMember, removeMember, updateMemberCharacter, getLobbyMembers, etc.
- Redis keys: `lobby:{lobbyId}` (hash), `lobby:members:{lobbyId}` (set)
- 1-hour TTL on all keys

### 2. `src/handlers/LobbyEventsHandler.js` (COMPLETE REWRITE)
- Removed: 370+ lines of old logic (queue, mode, host events, rate limiting)
- Added: handleJoinLobby, handleLeaveLobby, handleCharacterChange
- Added: broadcastLobbyRoster (reads from Redis)
- Added: handleDisconnect (cleanup on WS close)
- Added: syncAllLobbies (periodic sync from Redis)
- **220 lines total** (was 370+)

### 3. `src/handlers/StatusUpdateHandler.js`
- Added: lobbyEventsHandler dependency
- Changed: Character updates now call `lobbyEventsHandler.handleCharacterChange()`
- Removed: Old `notifyLobbyOfCharacterChange()` method (40+ lines)

### 4. `src/server.js`
- Added: Import and initialize LobbyManager
- Changed: Initialize lobbyEventsHandler with LobbyManager
- Changed: Pass lobbyEventsHandler to StatusUpdateHandler
- Changed: `lobby_subscribe` → `lobbyEventsHandler.handleJoinLobby()`
- Changed: `lobby_member_left` → `lobbyEventsHandler.handleLeaveLobby()`
- Removed: All queue/mode/host actions (not needed yet)
- Changed: Disconnect handler uses `lobbyEventsHandler.handleDisconnect()`
- Changed: Periodic sync calls `lobbyEventsHandler.syncAllLobbies()`

### 5. `LOBBY_SYSTEM.md` (NEW)
- Clean documentation on Redis structure
- Client actions (join, leave, character change)
- Server events (lobby_roster, member_left)
- Unity integration example
- Troubleshooting guide

## How It Works Now

### Join Lobby
1. Client sends `lobby_subscribe` with lobbyId
2. Server calls `LobbyManager.addMember()` → Redis updated
3. Server calls `LobbyEventsHandler.broadcastLobbyRoster()` → reads from Redis, broadcasts to all

### Leave Lobby
1. Client sends `lobby_member_left` with lobbyId
2. Server calls `LobbyManager.removeMember()` → Redis updated
3. Server broadcasts `member_left` event
4. Server calls `LobbyEventsHandler.broadcastLobbyRoster()` → reads from Redis, broadcasts to remaining

### Change Character
1. Client sends `update_status` with characterId
2. Server calls `LobbyManager.updateMemberCharacter()` → Redis updated
3. Server calls `LobbyEventsHandler.broadcastLobbyRoster()` → reads from Redis, broadcasts to all

### Disconnect
1. WebSocket closes
2. Server detects user was in lobby
3. Server calls `LobbyManager.removeMember()` → Redis updated
4. Server broadcasts `member_left` event
5. Server calls `LobbyEventsHandler.broadcastLobbyRoster()` → reads from Redis, broadcasts to remaining

### Periodic Sync (every 10 seconds)
1. Timer fires
2. `LobbyManager.getAllLobbyIds()` → get active lobbies from Redis
3. For each lobby: `broadcastLobbyRoster()` → read members from Redis, broadcast

## Redis Structure

```
lobby:lobby123 → Hash
  user1 → {"userId":"user1","username":"Player1","characterId":"char_warrior_01"}
  user2 → {"userId":"user2","username":"Player2","characterId":"char_mage_02"}

lobby:members:lobby123 → Set
  user1
  user2
```

Both keys have 1-hour TTL.

## What Was Removed

- `handleStartQueue()` - not needed (was 40 lines)
- `handleStopQueue()` - not needed (was 25 lines)
- `handleChangeMode()` - not needed (was 35 lines)
- `handleChangeHost()` - not needed (was 45 lines)
- Rate limiting logic - not needed (was 30 lines)
- `broadcastLobbyEvent()` - replaced (was 35 lines)
- Old `sendLobbyRoster()` - replaced (was 50 lines)
- Old `broadcastAllLobbyRosters()` - replaced (was 20 lines)
- Old `handleMemberLeft()` - replaced (was 30 lines)
- Old `notifyLobbyOfCharacterChange()` in StatusUpdateHandler (was 40 lines)

**Total removed: ~350 lines of old complex logic**

## What Was Added

- `LobbyManager.js` - 240 lines (Redis operations)
- New `LobbyEventsHandler.js` - 220 lines (clean event handling)
- `LOBBY_SYSTEM.md` - comprehensive documentation

**Total added: ~460 lines of clean, focused code**

## Testing

To test the new system:

1. Start server: `node src/server.js`
2. Verify Redis connection: should see "Lobby manager initialized successfully"
3. Connect client with auth (include characterId)
4. Send `lobby_subscribe` with lobbyId
5. Should receive `lobby_roster` event with your character
6. Connect second client to same lobby
7. Both should receive updated `lobby_roster` with 2 members
8. Change character with `update_status` + characterId
9. Both should receive updated `lobby_roster` with new character
10. One client leaves with `lobby_member_left`
11. Other should receive `member_left` then `lobby_roster` with 1 member

## Benefits

✅ **Single source of truth** - Redis holds all lobby state
✅ **Simpler logic** - Update Redis, then broadcast. That's it.
✅ **Persistent state** - Lobbies survive server restarts (within 1 hour TTL)
✅ **Event-driven** - Updates happen when they should, not just on timer
✅ **Easier debugging** - Can inspect Redis directly to see lobby state
✅ **Less code** - Removed 350 lines, added cleaner implementation
✅ **Better scaling** - Redis can be on separate server, multiple app servers can share state

## Next Steps

If you want to add queue/mode/host features later:
1. Add fields to member data in Redis (e.g., `isHost`, `isInQueue`)
2. Add methods to LobbyManager (e.g., `setLobbyMode`, `setLobbyHost`)
3. Add handlers to LobbyEventsHandler (follow same pattern: update Redis → broadcast roster)
4. Add actions to server.js
