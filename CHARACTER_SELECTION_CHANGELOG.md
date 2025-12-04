# Character Selection System - Changelog

**Date:** December 2, 2025  
**Version:** 2.1.0  
**Type:** Feature Addition

---

## Overview

Added comprehensive character selection tracking across the chat server. Players can now register their selected character ID during authentication, update it in real-time, and lobby members automatically see each other's character selections.

---

## What Changed

### 1. Authentication - Character ID Support

**Action:** `auth`

**New Field:**
- `characterId` (string, optional) - The player's currently selected character/skin ID

**Updated Payload Example:**
```json
{
  "action": "auth",
  "userId": "player123",
  "username": "CoolPlayer",
  "friendIds": ["friend1", "friend2"],
  "characterId": "warrior_skin_01"
}
```

**Behavior:**
- Server stores `characterId` in connection state
- Server caches `characterId` in Redis player status
- Character ID is included in friend status notifications

---

### 2. Status Updates - Character Changes

**Action:** `update_status`

**New Field:**
- `characterId` (string, optional) - Updated character/skin selection

**Updated Payload Example:**
```json
{
  "action": "update_status",
  "status": "online",
  "characterId": "mage_skin_03"
}
```

**Behavior:**
- Updates player's character in Redis cache
- Updates character in connection manager
- **If player is in a lobby:** Broadcasts character change to all lobby members via `character_changed` event

---

### 3. NEW Lobby Event: Character Changed

**Event Type:** `character_changed`

**Received By:** All lobby members (except the person who changed)

**Payload:**
```json
{
  "type": "lobby_event",
  "eventType": "character_changed",
  "lobbyId": "ABC123",
  "userId": "player123",
  "username": "CoolPlayer",
  "characterId": "mage_skin_03",
  "timestamp": "2025-12-02T10:30:00Z"
}
```

**When Fired:**
- Player calls `update_status` with a `characterId` while in a lobby
- All other lobby members receive this event in real-time

**Unity Client Action:**
Update the UI to show the new character selection for that player.

---

### 4. NEW Lobby Event: Lobby Roster

**Event Type:** `lobby_roster`

**Received By:** Player who just joined the lobby (via `lobby_subscribe`)

**Payload:**
```json
{
  "type": "lobby_event",
  "eventType": "lobby_roster",
  "lobbyId": "ABC123",
  "members": [
    {
      "userId": "player123",
      "username": "CoolPlayer",
      "characterId": "warrior_skin_01"
    },
    {
      "userId": "player456",
      "username": "ProGamer",
      "characterId": "mage_skin_03"
    },
    {
      "userId": "player789",
      "username": "NewbieSlayer",
      "characterId": null
    }
  ],
  "timestamp": "2025-12-02T10:30:00Z"
}
```

**When Fired:**
- Automatically sent when a player successfully subscribes to a lobby (`lobby_subscribe`)
- Contains all current lobby members and their character selections

**Unity Client Action:**
Populate the lobby UI with all members and their selected characters.

---

### 5. NEW Lobby Event: Member Left

**Event Type:** `member_left`

**Received By:** All remaining lobby members (when someone disconnects)

**Payload:**
```json
{
  "type": "lobby_event",
  "eventType": "member_left",
  "lobbyId": "ABC123",
  "userId": "player123",
  "username": "CoolPlayer",
  "timestamp": "2025-12-02T10:30:00Z"
}
```

**When Fired:**
- Automatically sent when a player disconnects from the server while in a lobby
- All remaining lobby members receive this event

**Unity Client Action:**
Remove the player from the lobby UI.

---

### 6. Friend Status - Character ID Included

**Message Type:** `friend_status_changed`

**New Field:**
- `characterId` (string, nullable) - Friend's current character selection

**Updated Payload Example:**
```json
{
  "type": "friend_status_changed",
  "friendId": "player123",
  "friendUsername": "CoolPlayer",
  "status": "online",
  "gameInfo": null,
  "characterId": "warrior_skin_01",
  "timestamp": "2025-12-02T10:30:00Z"
}
```

**Behavior:**
- When friends change status, their current character ID is included in the notification

---

## Unity Client Integration Guide

### Step 1: Update Authentication

Add `characterId` to your auth message:

```csharp
public void Authenticate(string userId, string username, string[] friendIds, string characterId)
{
    var authMsg = new {
        action = "auth",
        userId = userId,
        username = username,
        friendIds = friendIds,
        characterId = characterId  // NEW
    };
    
    ws.Send(JsonUtility.ToJson(authMsg));
}
```

---

### Step 2: Send Character Changes

When player changes their character/skin:

```csharp
public void UpdateCharacterSelection(string characterId)
{
    var statusMsg = new {
        action = "update_status",
        status = "online",  // or current status
        characterId = characterId  // NEW
    };
    
    ws.Send(JsonUtility.ToJson(statusMsg));
}
```

**Important:** This automatically notifies all lobby members if you're in a lobby.

---

### Step 3: Handle Lobby Roster Event

When joining a lobby, populate the UI with all members:

```csharp
void HandleLobbyRoster(LobbyRosterEvent evt)
{
    // Clear current lobby UI
    lobbyMemberList.Clear();
    
    // Populate with all members
    foreach (var member in evt.members)
    {
        AddLobbyMember(member.userId, member.username, member.characterId);
    }
}
```

**Roster Event Structure:**
```csharp
[System.Serializable]
public class LobbyRosterEvent
{
    public string type;           // "lobby_event"
    public string eventType;      // "lobby_roster"
    public string lobbyId;
    public LobbyMember[] members;
    public string timestamp;
}

[System.Serializable]
public class LobbyMember
{
    public string userId;
    public string username;
    public string characterId;    // Can be null
}
```

---

### Step 4: Handle Character Change Events

Update lobby UI when someone changes character:

```csharp
void HandleCharacterChanged(CharacterChangedEvent evt)
{
    // Find the lobby member UI element
    var memberUI = FindLobbyMember(evt.userId);
    
    // Update their character display
    if (memberUI != null)
    {
        memberUI.SetCharacter(evt.characterId);
    }
}
```

**Character Changed Event Structure:**
```csharp
[System.Serializable]
public class CharacterChangedEvent
{
    public string type;        // "lobby_event"
    public string eventType;   // "character_changed"
    public string lobbyId;
    public string userId;
    public string username;
    public string characterId;
    public string timestamp;
}
```

---

### Step 5: Handle Member Left Events

Remove player from lobby UI when they disconnect:

```csharp
void HandleMemberLeft(MemberLeftEvent evt)
{
    // Remove the lobby member from UI
    RemoveLobbyMember(evt.userId);
    
    // Optional: Show notification
    ShowNotification($"{evt.username} left the lobby");
}
```

**Member Left Event Structure:**
```csharp
[System.Serializable]
public class MemberLeftEvent
{
    public string type;        // "lobby_event"
    public string eventType;   // "member_left"
    public string lobbyId;
    public string userId;
    public string username;
    public string timestamp;
}
```

---

### Step 6: Update Message Router

Add handlers for the new event types:

```csharp
void OnWebSocketMessage(string message)
{
    var baseMsg = JsonUtility.FromJson<BaseMessage>(message);
    
    if (baseMsg.type == "lobby_event")
    {
        var lobbyEvent = JsonUtility.FromJson<LobbyEvent>(message);
        
        switch (lobbyEvent.eventType)
        {
            case "lobby_roster":
                HandleLobbyRoster(JsonUtility.FromJson<LobbyRosterEvent>(message));
                break;
                
            case "character_changed":
                HandleCharacterChanged(JsonUtility.FromJson<CharacterChangedEvent>(message));
                break;
                
            case "member_left":
                HandleMemberLeft(JsonUtility.FromJson<MemberLeftEvent>(message));
                break;
                
            // ... existing cases (start_queue, stop_queue, etc.)
        }
    }
    else if (baseMsg.type == "friend_status_changed")
    {
        var statusEvent = JsonUtility.FromJson<FriendStatusChanged>(message);
        // statusEvent.characterId is now available
        UpdateFriendUI(statusEvent);
    }
}
```

---

## Example Flow

### Scenario: Player Joins Lobby and Changes Character

1. **Player joins lobby:**
   ```json
   → Client sends: { "action": "lobby_subscribe", "lobbyId": "ABC123" }
   ← Server sends: Lobby roster with all members and their characters
   ```

2. **Player changes character:**
   ```json
   → Client sends: { "action": "update_status", "status": "online", "characterId": "mage_skin_03" }
   ← All other lobby members receive: character_changed event
   ```

3. **Another member joins:**
   ```json
   → New member subscribes to lobby
   ← New member receives: Roster with everyone's current characters (including the mage)
   ```

---

## Breaking Changes

**None.** All new fields are optional and backward compatible.

- Old clients without `characterId` will work normally
- `characterId` defaults to `null` if not provided
- Existing event handlers continue to work

---

## Testing

### Test Character Selection Flow

1. Connect two clients with different characters
2. Both join the same lobby
3. Verify roster shows both characters
4. Change character on client 1
5. Verify client 2 receives `character_changed` event
6. Connect third client and join lobby
7. Verify roster shows all current characters

---

## API Reference Summary

### Updated Actions

| Action | New Field | Type | Required | Description |
|--------|-----------|------|----------|-------------|
| `auth` | `characterId` | string | No | Initial character selection |
| `update_status` | `characterId` | string | No | Update character selection |

### New Event Types

| Event Type | Received When | Contains |
|------------|---------------|----------|
| `lobby_roster` | Join lobby | All members + characters |
| `character_changed` | Member changes character | userId + new characterId |
| `member_left` | Member disconnects | userId + username |

### Updated Event Types

| Event Type | New Field | Description |
|------------|-----------|-------------|
| `friend_status_changed` | `characterId` | Friend's current character |

---

## Questions?

If you encounter issues or need clarification:
1. Check that `characterId` is being sent in auth/update_status
2. Verify lobby subscription is successful before expecting events
3. Ensure event handlers parse the new fields correctly

**Server Repository:** aetherion-chat  
**Unity Client Team:** Please update lobby UI components to display character selections

---

## Files Modified

### Server Files
- `src/managers/PlayerStatusManager.js` - Added characterId to status storage
- `src/managers/ConnectionManager.js` - Track characterId per connection
- `src/handlers/StatusUpdateHandler.js` - Handle character updates and notify lobby
- `src/handlers/LobbyEventsHandler.js` - Added sendLobbyRoster method
- `src/server.js` - Updated auth flow and lobby subscribe trigger

### Documentation
- `CHARACTER_SELECTION_CHANGELOG.md` - This document
