# Lobby System - Redis Architecture

## Overview

The lobby system uses **Redis as the single source of truth** for all lobby state. Every operation follows this pattern:

1. **Update Redis** (add/remove/change data)
2. **Broadcast to members** (read fresh data from Redis)

## Redis Data Structure

### Keys Used

```
lobby:{lobbyId}              # Hash - stores member data
lobby:members:{lobbyId}      # Set - stores member IDs
```

### Member Data Format

Each member in the hash stores:
```json
{
  "userId": "user123",
  "username": "PlayerName",
  "characterId": "char_warrior_01"
}
```

### TTL

All lobby keys expire after **1 hour** of inactivity.

## Client Actions

### Join Lobby

**Action:** `lobby_subscribe`

**Payload:**
```json
{
  "action": "lobby_subscribe",
  "lobbyId": "lobby123"
}
```

**Flow:**
1. Server adds member to Redis
2. Server updates ConnectionManager (in-memory for WebSocket routing)
3. Server broadcasts `lobby_roster` event to ALL members (including joiner)

**Response:**
```json
{
  "success": true,
  "lobbyId": "lobby123"
}
```

### Leave Lobby

**Action:** `lobby_member_left` or `lobby_unsubscribe`

**Payload:**
```json
{
  "action": "lobby_member_left",
  "lobbyId": "lobby123"
}
```

**Flow:**
1. Server removes member from Redis
2. Server broadcasts `member_left` event to remaining members
3. Server broadcasts `lobby_roster` event to remaining members

**Response:**
```json
{
  "success": true,
  "lobbyId": "lobby123"
}
```

### Change Character

**Action:** `update_status`

**Payload:**
```json
{
  "action": "update_status",
  "status": "ingame",
  "characterId": "char_mage_02"
}
```

**Flow:**
1. Server updates characterId in Redis (if user in lobby)
2. Server broadcasts `lobby_roster` event to ALL members

**Note:** Character is automatically set when joining lobby from auth data.

## Server Events

### Lobby Roster

**Event Type:** `lobby_roster`

Sent when:
- New member joins
- Member leaves
- Member changes character
- Periodic sync (every 10 seconds)

**Payload:**
```json
{
  "type": "lobby_event",
  "eventType": "lobby_roster",
  "lobbyId": "lobby123",
  "members": [
    {
      "userId": "user1",
      "username": "Player1",
      "characterId": "char_warrior_01"
    },
    {
      "userId": "user2",
      "username": "Player2",
      "characterId": "char_mage_02"
    }
  ],
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Member Left

**Event Type:** `member_left`

Sent when member disconnects or explicitly leaves.

**Payload:**
```json
{
  "type": "lobby_event",
  "eventType": "member_left",
  "lobbyId": "lobby123",
  "userId": "user1",
  "username": "Player1",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Authentication Flow

When client connects with `auth` action:

**Payload:**
```json
{
  "action": "auth",
  "userId": "user123",
  "username": "PlayerName",
  "characterId": "char_warrior_01"
}
```

Server stores `characterId` in ConnectionManager for later lobby joins.

## Disconnect Handling

When WebSocket closes:
1. Server checks if user was in lobby
2. If yes: removes from Redis
3. Broadcasts `member_left` to remaining members
4. Broadcasts `lobby_roster` to remaining members

## Code Components

### LobbyManager (`src/managers/LobbyManager.js`)

**Purpose:** Redis operations for lobby state

**Methods:**
- `addMember(lobbyId, userId, username, characterId)` - Add member to Redis
- `removeMember(lobbyId, userId)` - Remove member from Redis
- `updateMemberCharacter(lobbyId, userId, characterId)` - Update character in Redis
- `getLobbyMembers(lobbyId)` - Get array of member objects from Redis
- `getLobbyMemberIds(lobbyId)` - Get array of member IDs
- `isUserInLobby(lobbyId, userId)` - Check membership
- `getAllLobbyIds()` - Get list of active lobbies
- `cleanupEmptyLobbies()` - Remove empty lobbies from Redis

### LobbyEventsHandler (`src/handlers/LobbyEventsHandler.js`)

**Purpose:** Lobby event handling and broadcasting

**Methods:**
- `handleJoinLobby(data, userId)` - Process join request
- `handleLeaveLobby(data, userId)` - Process leave request
- `handleCharacterChange(lobbyId, userId, characterId)` - Update character
- `broadcastLobbyRoster(lobbyId)` - Send roster to all members
- `broadcastMemberLeft(lobbyId, userId, username)` - Notify about departure
- `handleDisconnect(userId, lobbyId, username)` - Cleanup on disconnect
- `syncAllLobbies()` - Periodic roster sync from Redis

### ConnectionManager (`src/managers/ConnectionManager.js`)

**Purpose:** In-memory WebSocket routing only

Stores:
- `userId` → WebSocket connection mapping
- `lobbyId` per client (for routing messages)
- `characterId` per client (temporary, until Redis update)

**Does NOT store lobby membership list** - that's in Redis.

## Unity Integration Example

```csharp
// Join lobby
var joinMsg = new {
    action = "lobby_subscribe",
    lobbyId = "lobby123"
};
websocket.SendText(JsonUtility.ToJson(joinMsg));

// Leave lobby
var leaveMsg = new {
    action = "lobby_member_left",
    lobbyId = "lobby123"
};
websocket.SendText(JsonUtility.ToJson(leaveMsg));

// Change character
var statusMsg = new {
    action = "update_status",
    status = "ingame",
    characterId = "char_mage_02"
};
websocket.SendText(JsonUtility.ToJson(statusMsg));

// Listen for events
void OnMessage(string message) {
    var msg = JsonUtility.FromJson<ServerMessage>(message);
    
    if (msg.type == "lobby_event") {
        switch (msg.eventType) {
            case "lobby_roster":
                UpdateLobbyUI(msg.members);
                break;
            case "member_left":
                RemovePlayerFromUI(msg.userId);
                break;
        }
    }
}
```

## Key Principles

1. **Redis is always the source of truth** for lobby membership
2. **Update Redis first, then broadcast** - never broadcast without updating Redis
3. **Roster events contain complete member list** - clients don't need to track joins/leaves, just apply the roster
4. **Periodic sync ensures consistency** - every 10 seconds, Redis data is re-broadcast
5. **ConnectionManager is just for routing** - WebSocket connection lookup only

## Troubleshooting

**Members not seeing updates?**
- Check Redis is running
- Verify `lobby:{lobbyId}` key exists in Redis
- Check periodic sync logs (should see "Synced X lobbies" every 10 seconds)

**Stale lobby data?**
- Redis keys expire after 1 hour
- Empty lobbies are cleaned up automatically
- Periodic sync refreshes roster every 10 seconds

**Character not updating?**
- Make sure `update_status` includes `characterId` field
- Verify client is in a lobby (`lobby_subscribe` was called)
- Check `broadcastLobbyRoster` is called after character update
