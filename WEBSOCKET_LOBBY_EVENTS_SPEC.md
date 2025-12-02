# WebSocket Lobby Events Specification

This document defines the lobby event system that the WebSocket chat server needs to implement for real-time lobby synchronization.

## Overview

The client now uses WebSocket for lobby event synchronization (queue start/stop, mode changes) instead of Unity Lobbies SDK polling. Unity Lobbies is still used for player join/leave notifications and basic lobby management.

## Outgoing Actions (Client → Server)

### 1. Start Queue Action

**Action Name:** `lobby_start_queue`

**Purpose:** Notify all lobby members that the host has started matchmaking queue.

**Payload:**
```json
{
  "action": "lobby_start_queue",
  "lobbyId": "LOBBY_CODE_HERE",
  "gameMode": "Casual|Ranked|Custom"
}
```

**Client Behavior:**
- Sent by host when they click "Start Queue" button
- Sent AFTER successfully starting matchmaking on Unity Matchmaker
- All lobby members (except sender) should receive a `lobby_event` message

**Example:**
```json
{
  "action": "lobby_start_queue",
  "lobbyId": "ABC123",
  "gameMode": "Casual"
}
```

---

### 2. Stop Queue Action

**Action Name:** `lobby_stop_queue`

**Purpose:** Notify all lobby members that someone has cancelled the matchmaking queue.

**Payload:**
```json
{
  "action": "lobby_stop_queue",
  "lobbyId": "LOBBY_CODE_HERE"
}
```

**Client Behavior:**
- Can be sent by host OR members
- Sent when clicking "Cancel Queue" button
- All lobby members should receive a `lobby_event` message and stop their queue UI

**Example:**
```json
{
  "action": "lobby_stop_queue",
  "lobbyId": "ABC123"
}
```

---

### 3. Change Mode Action

**Action Name:** `lobby_change_mode`

**Purpose:** Notify all lobby members that the host has changed the game mode.

**Payload:**
```json
{
  "action": "lobby_change_mode",
  "lobbyId": "LOBBY_CODE_HERE",
  "gameMode": "Casual|Ranked|Custom"
}
```

**Client Behavior:**
- Only sent by host
- Sent when host selects a different game mode
- All members should update their UI to show the new mode

**Example:**
```json
{
  "action": "lobby_change_mode",
  "lobbyId": "ABC123",
  "gameMode": "Ranked"
}
```

---

### 4. Change Host Action (Not Yet Implemented)

**Action Name:** `lobby_change_host`

**Purpose:** Notify lobby members of a host change.

**Payload:**
```json
{
  "action": "lobby_change_host",
  "lobbyId": "LOBBY_CODE_HERE",
  "newHostId": "FIREBASE_UID_OF_NEW_HOST"
}
```

**Status:** Defined but not used yet. Reserved for future host migration feature.

---

## Incoming Messages (Server → Client)

### Lobby Event Message

**Message Type:** `lobby_event`

**Purpose:** Server broadcasts lobby events to all subscribed lobby members.

**Payload:**
```json
{
  "type": "lobby_event",
  "timestamp": "2024-12-02T10:30:00Z",
  "eventType": "start_queue|stop_queue|change_mode|change_host",
  "lobbyId": "LOBBY_CODE",
  "senderId": "FIREBASE_UID_OF_SENDER",
  "senderName": "DisplayName",
  "gameMode": "Casual|Ranked|Custom",  // Optional: only for start_queue and change_mode
  "newHostId": "FIREBASE_UID",         // Optional: only for change_host
  "newHostName": "DisplayName"         // Optional: only for change_host
}
```

**Examples:**

1. Start Queue Event:
```json
{
  "type": "lobby_event",
  "timestamp": "2024-12-02T10:30:00Z",
  "eventType": "start_queue",
  "lobbyId": "ABC123",
  "senderId": "user123",
  "senderName": "PlayerOne",
  "gameMode": "Casual"
}
```

2. Stop Queue Event:
```json
{
  "type": "lobby_event",
  "timestamp": "2024-12-02T10:31:00Z",
  "eventType": "stop_queue",
  "lobbyId": "ABC123",
  "senderId": "user456",
  "senderName": "PlayerTwo"
}
```

3. Change Mode Event:
```json
{
  "type": "lobby_event",
  "timestamp": "2024-12-02T10:32:00Z",
  "eventType": "change_mode",
  "lobbyId": "ABC123",
  "senderId": "user123",
  "senderName": "PlayerOne",
  "gameMode": "Ranked"
}
```

4. Change Host Event (Future):
```json
{
  "type": "lobby_event",
  "timestamp": "2024-12-02T10:33:00Z",
  "eventType": "change_host",
  "lobbyId": "ABC123",
  "senderId": "user123",
  "senderName": "PlayerOne",
  "newHostId": "user456",
  "newHostName": "PlayerTwo"
}
```

---

## Server Requirements

### 1. Lobby Subscription System

The server should track which users are subscribed to which lobbies. This can be done by:

- Tracking active lobby subscriptions per WebSocket connection
- When a client sends `lobby_subscribe` (existing action), store `lobbyId → [userIds]`
- When a client sends `lobby_unsubscribe`, remove them from the lobby
- On disconnect, clean up their lobby subscriptions

### 2. Event Broadcasting

When receiving a lobby action (start_queue, stop_queue, change_mode):

1. **Validate** the sender is authenticated
2. **Lookup** all users subscribed to the `lobbyId`
3. **Broadcast** a `lobby_event` message to all subscribers EXCEPT the sender
4. Include sender's `userId` and `username` in the broadcast
5. Include relevant fields (gameMode for queue/mode events)

### 3. Rate Limiting (Recommended)

- Limit lobby events to prevent spam (e.g., max 10 events per minute per user)
- Prevent non-host users from sending certain events (if host tracking is implemented)

### 4. Error Handling

Send an `error` message if:
- User is not authenticated
- User is not subscribed to the lobby
- Invalid lobbyId or gameMode value
- Rate limit exceeded

**Error Response Example:**
```json
{
  "type": "error",
  "timestamp": "2024-12-02T10:30:00Z",
  "error": "Not subscribed to lobby ABC123"
}
```

### 5. ACK Messages (Optional)

Optionally send acknowledgment for lobby actions:

```json
{
  "type": "ack",
  "timestamp": "2024-12-02T10:30:00Z",
  "action": "lobby_start_queue",
  "success": true,
  "lobbyId": "ABC123"
}
```

---

## Client Implementation Details

### Event Handlers

The client has these handlers in `MainMenuLobbyManager.cs`:

- `HandleStartQueueEvent()` - Shows queue UI for members
- `HandleStopQueueEvent()` - Stops queue UI for everyone
- `HandleChangeModeEvent()` - Updates mode display for members
- `HandleChangeHostEvent()` - Reserved for future use

### Flow Examples

#### Host Starts Queue
1. Host clicks "Start Queue" → `MainMenuMpsService.StartMatchmaking()` called
2. Unity Matchmaker ticket created successfully
3. Client sends `lobby_start_queue` WebSocket action
4. Server broadcasts `lobby_event` with `eventType: "start_queue"`
5. All members receive event and show queue UI

#### Member Cancels Queue
1. Member clicks "Cancel Queue" → `MainMenuMpsService.CancelMatchmaking()` called
2. Member's local queue state cleared
3. Client sends `lobby_stop_queue` WebSocket action
4. Server broadcasts `lobby_event` with `eventType: "stop_queue"`
5. Host and other members receive event and stop queue UI

#### Host Changes Mode
1. Host selects new mode → `OnModeSelected()` called
2. Local UI updated immediately for host
3. Client sends `lobby_change_mode` WebSocket action
4. Server broadcasts `lobby_event` with `eventType: "change_mode"`
5. All members receive event and update mode display

---

## Migration Notes

### What Changed from Unity Lobbies Sync

**Before (Old System):**
- Queue status synced via Unity Lobbies `Data["QueueStatus"]`
- Game mode synced via Unity Lobbies `Data["GameMode"]`
- Cancel requests via Unity Lobbies `Data["CancelRequest"]`
- Heavy polling and duplicate event firing
- Connection instability issues

**After (New System):**
- Queue start/stop via WebSocket `lobby_event` messages
- Mode changes via WebSocket `lobby_event` messages
- Direct cancellation (no more cancel requests)
- Clean event system with single source of truth
- Stable WebSocket connections

### What Still Uses Unity Lobbies

Unity Lobbies SDK is still used for:
- Player join/leave notifications (`OnPlayerJoinedLobby`, `OnPlayerLeftLobby`)
- Lobby creation and management
- Match found notifications (via `Data["MatchId"]`)
- Host migration (future)

---

## Testing Checklist

Server implementation should pass these tests:

- [ ] Client can send `lobby_start_queue` and all members receive event
- [ ] Client can send `lobby_stop_queue` and all members receive event
- [ ] Client can send `lobby_change_mode` and all members receive event
- [ ] Events are NOT sent back to the sender
- [ ] Events include correct `senderId` and `senderName`
- [ ] Events include correct `gameMode` when applicable
- [ ] Multiple lobbies can operate independently
- [ ] Disconnected users are cleaned up from lobby subscriptions
- [ ] Invalid lobby IDs return errors
- [ ] Unauthenticated users cannot send lobby events

---

## Future Enhancements

1. **Host Validation**: Track who is the host and validate `change_mode` actions
2. **Host Migration**: Implement `change_host` event when host leaves
3. **Lobby State**: Store current queue/mode state on server for late joiners
4. **Event History**: Keep recent events for reconnecting clients
5. **Permissions**: Different event permissions for host vs members

---

## Contact

For questions about this specification, contact the client-side team.
Server repository: (to be provided)
Client repository: Aetherion (Unity C#)
