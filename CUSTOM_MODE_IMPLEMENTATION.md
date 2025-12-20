# Custom Mode Implementation - Complete Guide

## Overview
This document describes the complete implementation of Custom Mode for the Aetherion Chat server. Custom mode enables 6-player team-based lobbies (3v3) with advanced team management features.

## Implementation Summary

### Files Modified/Created

1. **`src/managers/LobbyManager.js`** - Added custom mode team management methods
2. **`src/handlers/CustomModeHandler.js`** - New handler for custom mode events (CREATED)
3. **`src/handlers/LobbyEventsHandler.js`** - Updated to integrate custom mode
4. **`src/server.js`** - Registered custom mode handlers and routes
5. **`test-custom-mode.js`** - Comprehensive test suite (CREATED)

---

## Architecture

### Data Structure

Custom mode uses Redis to store team assignments:

**Redis Key**: `lobby:custom:{lobbyId}`

**Data Structure**:
```json
{
  "teams": {
    "0": {
      "slots": [
        { "slotIndex": 0, "userId": "player1_uid", "username": "Player1" },
        { "slotIndex": 1, "userId": null, "username": null },
        { "slotIndex": 2, "userId": null, "username": null }
      ]
    },
    "1": {
      "slots": [
        { "slotIndex": 0, "userId": "player2_uid", "username": "Player2" },
        { "slotIndex": 1, "userId": null, "username": null },
        { "slotIndex": 2, "userId": null, "username": null }
      ]
    }
  }
}
```

---

## WebSocket Events

### Client → Server

#### 1. Swap Team
```json
{
  "action": "swap_team",
  "lobbyId": "ABCD1234",
  "userId": "firebase_uid_123"
}
```

**Response**:
```json
{
  "type": "team_swapped",
  "eventType": "team_swapped",
  "lobbyId": "ABCD1234",
  "userId": "player2_uid",
  "username": "Player2",
  "fromTeam": 0,
  "toTeam": 1,
  "timestamp": "2025-12-20T10:30:00.000Z"
}
```

**Followed by**:
```json
{
  "type": "custom_lobby_roster",
  "eventType": "custom_lobby_roster",
  "lobbyId": "ABCD1234",
  "customRoster": [
    {
      "userId": "player1_uid",
      "username": "Player1",
      "teamIndex": 0,
      "slotIndex": 0,
      "isHost": true
    },
    ...
  ]
}
```

**Error Cases**:
- Target team is full: `{ success: false, error: "TEAM_FULL", message: "Target team is full" }`
- Player not in lobby: `{ success: false, error: "You are not in this lobby" }`
- Not in custom mode: `{ success: false, error: "Lobby is not in custom mode" }`

---

#### 2. Start Custom Match
```json
{
  "action": "start_custom_match",
  "lobbyId": "ABCD1234"
}
```

**Response**:
```json
{
  "type": "lobby_event",
  "eventType": "custom_match_start",
  "lobbyId": "ABCD1234",
  "matchId": "match_1703073000000",
  "team0Count": 3,
  "team1Count": 3,
  "timestamp": "2025-12-20T10:30:00.000Z"
}
```

**Validation**:
- Must be lobby host
- Both teams must have at least 1 player

**Error Cases**:
- Not host: `{ success: false, error: "UNAUTHORIZED", message: "Only host can start the match" }`
- Invalid teams: `{ success: false, error: "INVALID_TEAM_COMPOSITION", message: "Both teams need at least 1 player" }`

---

#### 3. Random Shuffle Teams
```json
{
  "action": "random_shuffle_teams",
  "lobbyId": "ABCD1234"
}
```

**Response**:
```json
{
  "type": "teams_shuffled",
  "eventType": "teams_shuffled",
  "lobbyId": "ABCD1234",
  "senderId": "host_uid",
  "senderName": "HostPlayer",
  "timestamp": "2025-12-20T10:30:00.000Z"
}
```

**Followed by**: `custom_lobby_roster` event

**Logic**:
- Host remains in their current team
- All other players are randomly distributed between teams
- Uses Fisher-Yates shuffle algorithm

**Validation**:
- Must be lobby host

---

#### 4. Close Custom Room
```json
{
  "action": "close_custom_room",
  "lobbyId": "ABCD1234"
}
```

**Response**:
```json
{
  "type": "room_closed",
  "eventType": "room_closed",
  "lobbyId": "ABCD1234",
  "reason": "Host closed the room",
  "timestamp": "2025-12-20T10:30:00.000Z"
}
```

**Actions**:
1. Broadcasts `room_closed` event to all members
2. Kicks all non-host players from lobby
3. Clears custom mode data from Redis
4. Changes lobby mode to "Casual"
5. Sends mode change event to host

**Validation**:
- Must be lobby host

---

#### 5. Get Custom Roster
```json
{
  "action": "get_custom_roster",
  "lobbyId": "ABCD1234"
}
```

**Response**:
```json
{
  "type": "custom_lobby_roster",
  "eventType": "custom_lobby_roster",
  "lobbyId": "ABCD1234",
  "customRoster": [
    {
      "userId": "player1_uid",
      "username": "Player1",
      "teamIndex": 0,
      "slotIndex": 0,
      "isHost": true
    },
    {
      "userId": "player2_uid",
      "username": "Player2",
      "teamIndex": 1,
      "slotIndex": 0,
      "isHost": false
    }
  ],
  "timestamp": "2025-12-20T10:30:00.000Z"
}
```

---

### Server → Client

#### Custom Lobby Roster
Sent automatically when:
- Player joins custom lobby
- Team swap occurs
- Random shuffle completes
- Player leaves lobby
- Avatar/profile changes

#### Team Swapped
Sent before roster update when a player swaps teams

#### Teams Shuffled
Sent before roster update when host shuffles teams

#### Room Closed
Sent to all members when host closes the custom room

---

## LobbyManager API

### New Methods

#### `initializeCustomTeams(lobbyId, hostId, hostUsername)`
Initializes the team structure when switching to custom mode.
- Creates 2 teams with 3 slots each
- Places host in team 0, slot 0

#### `getCustomTeams(lobbyId)`
Returns the full team structure from Redis.

#### `setCustomTeams(lobbyId, teams)`
Updates the team structure in Redis.

#### `addPlayerToCustomTeam(lobbyId, userId, username, teamIndex = null)`
Adds a player to a team.
- If `teamIndex` is null, finds first available slot
- Returns `{ success, teamIndex, slotIndex }` or error

#### `removePlayerFromCustomTeam(lobbyId, userId)`
Removes a player from their team slot.

#### `getPlayerTeamAssignment(lobbyId, userId)`
Returns `{ teamIndex, slotIndex }` for a player.

#### `swapPlayerTeam(lobbyId, userId)`
Moves player to opposite team.
- Returns `{ success, fromTeam, toTeam, slotIndex }` or error

#### `getCustomRoster(lobbyId, hostId)`
Returns roster in client-friendly format (array of player objects).

#### `clearCustomMode(lobbyId)`
Removes all custom mode data when switching back to casual/ranked.

---

## CustomModeHandler API

### Methods

#### `handleSwapTeam(data, userId)`
Handles team swap requests.

#### `handleStartCustomMatch(data, userId)`
Validates and starts a custom match.

#### `handleRandomShuffle(data, userId)`
Randomly redistributes players between teams.

#### `handleCloseRoom(data, userId)`
Closes custom room and reverts to casual mode.

#### `handleGetCustomRoster(data, userId)`
Sends current roster to requesting client.

#### `broadcastCustomRoster(lobbyId)`
Broadcasts roster to all lobby members.

#### `verifyHost(lobbyId, userId)`
Helper to check if user is lobby host.

#### `verifyCustomMode(lobbyId)`
Helper to check if lobby is in custom mode.

---

## Integration with Existing Systems

### Join/Leave Lobby Flow

**When joining custom lobby**:
1. Regular lobby join process
2. Check if lobby is in custom mode
3. If yes, call `addPlayerToCustomTeam()`
4. Broadcast `custom_lobby_roster` instead of regular roster

**When leaving custom lobby**:
1. Check if lobby is in custom mode
2. If yes, call `removePlayerFromCustomTeam()`
3. Regular lobby leave process
4. Broadcast `custom_lobby_roster` instead of regular roster

### Mode Change Flow

**Switching TO custom mode**:
1. Set mode in Redis
2. Initialize team structure with `initializeCustomTeams()`
3. Add all existing members to teams
4. Broadcast `custom_lobby_roster`

**Switching FROM custom mode**:
1. Clear custom data with `clearCustomMode()`
2. Set new mode in Redis
3. Broadcast mode change event

### Avatar/Profile Changes

When a player changes avatar while in custom lobby:
1. Regular avatar change broadcast
2. Additionally broadcast `custom_lobby_roster` to update UI

---

## Testing

### Running Tests

```bash
# Start the server
node src/server.js

# In another terminal, run tests
node test-custom-mode.js
```

### Test Coverage

The test suite (`test-custom-mode.js`) covers:

1. ✓ Connecting multiple users
2. ✓ Creating custom lobby
3. ✓ Players joining custom lobby
4. ✓ Getting custom roster
5. ✓ Swapping teams
6. ✓ Random shuffle
7. ✓ Starting custom match
8. ✓ Authorization checks
9. ✓ Closing custom room
10. ✓ Mode reversion to casual
11. ✓ Lobby capacity (6 players)
12. ✓ Leave and rejoin

---

## Error Handling

### Error Responses

All custom mode handlers return structured error responses:

```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Human-readable message"
}
```

### Error Codes

- `TEAM_FULL` - Cannot swap, target team at capacity
- `INVALID_TEAM_COMPOSITION` - Cannot start match without players on both teams
- `UNAUTHORIZED` - Action requires host privileges
- `Redis not available` - Redis connection issue
- `Custom teams not initialized` - Data structure not found
- `You are not in this lobby` - User not subscribed to lobby
- `Lobby is not in custom mode` - Action requires custom mode

---

## Performance Considerations

### Redis Operations

- All team data stored in single hash per lobby
- TTL set to 1 hour (configurable via `LOBBY_TTL`)
- Team operations are atomic

### Broadcasting

- Custom roster only sent to subscribed lobby members
- Uses existing ConnectionManager for efficient WebSocket management
- No redundant broadcasts (roster sent after team operations complete)

### Cleanup

- Custom data automatically expires via Redis TTL
- Explicit cleanup when mode changes
- Handled in disconnect flow

---

## Migration Notes

### Backwards Compatibility

✅ **Fully backwards compatible** with existing Casual/Ranked modes:
- Custom mode is opt-in (requires explicit mode change)
- Regular lobbies unaffected
- No breaking changes to existing events
- All existing handlers continue to work

### Database

No database schema changes required. Everything stored in Redis cache.

---

## Future Enhancements

Potential improvements:

1. **Persistent Match History**: Store custom matches in Firebase/PostgreSQL
2. **Team Presets**: Allow saving favorite team configurations
3. **Skill-based Shuffling**: Balance teams by player skill/level
4. **Captain Mode**: Let captains pick teams turn-by-turn
5. **Private Slots**: Reserve slots for specific players
6. **Team Chat**: Separate chat channels per team

---

## Troubleshooting

### Common Issues

**Issue**: Players not appearing in custom roster
- **Solution**: Check Redis connection, verify lobby is in custom mode

**Issue**: Team swap fails silently
- **Solution**: Check server logs for validation errors, verify target team not full

**Issue**: Room close doesn't kick players
- **Solution**: Verify host permissions, check ConnectionManager subscriptions

**Issue**: Roster not updating after profile change
- **Solution**: Ensure `customModeHandler` is injected into `lobbyEventsHandler`

### Debug Logging

Enable verbose logging:
```javascript
// In CustomModeHandler or LobbyManager
console.log('Custom teams:', JSON.stringify(teams, null, 2));
```

---

## API Quick Reference

### Client Actions
- `swap_team` - Swap to opposite team
- `start_custom_match` - Start the match (host only)
- `random_shuffle_teams` - Shuffle all players (host only)
- `close_custom_room` - Close room and revert to casual (host only)
- `get_custom_roster` - Request current roster

### Server Events
- `custom_lobby_roster` - Full roster update
- `team_swapped` - Player changed teams
- `teams_shuffled` - Teams were shuffled
- `room_closed` - Room was closed
- `custom_match_start` - Match is starting

---

## Summary

The custom mode implementation provides:
- ✅ 6-player capacity (vs 3 for casual/ranked)
- ✅ Team-based slot management (3v3)
- ✅ Host controls (shuffle, start, close)
- ✅ Member controls (swap teams)
- ✅ Real-time roster synchronization
- ✅ Full backwards compatibility
- ✅ Comprehensive error handling
- ✅ Redis-based state management
- ✅ Extensive test coverage

All requirements from the specification have been implemented and tested.
