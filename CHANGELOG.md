# Changelog

All notable changes to the Aetherion Chat Server will be documented in this file.

## [2.0.0] - 2025-11-20

### 🚀 Major Changes - Username Support

#### Added
- **Username as Secondary Identifier**: Username is now required during authentication alongside userId
- **Display Names in All Messages**: All chat messages and invites now include sender/recipient display names
- **Firestore Username Storage**: Chat history now stores usernames for both sender and recipient
- **Enhanced Logging**: Server logs now display usernames alongside userIds for better debugging

#### Breaking Changes ⚠️

**Authentication Changes:**
- `username` field is now **required** in the auth message
- Old auth format will be rejected with an error

**Before (v1.x):**
```json
{
  "action": "auth",
  "userId": "player123",
  "friendIds": ["friend1", "friend2"]
}
```

**After (v2.0):**
```json
{
  "action": "auth",
  "userId": "player123",
  "username": "CoolPlayer123",
  "friendIds": ["friend1", "friend2"]
}
```

#### Modified Message Formats

All message types now include sender/recipient names:

**1. Global Chat Messages**
```json
{
  "type": "global_chat",
  "senderId": "player123",
  "senderName": "CoolPlayer123",  // ✨ NEW
  "message": "Hello everyone!",
  "timestamp": "2025-11-20T10:00:00.000Z"
}
```

**2. Friend Chat Messages**
```json
{
  "type": "friend_chat",
  "senderId": "player123",
  "senderName": "CoolPlayer123",      // ✨ NEW
  "recipientId": "friend1",
  "recipientName": "BestFriend99",    // ✨ NEW
  "message": "Hey friend!",
  "timestamp": "2025-11-20T10:00:00.000Z"
}
```

**3. Lobby Chat Messages**
```json
{
  "type": "lobby_chat",
  "lobbyId": "lobby_abc123",
  "senderId": "player123",
  "senderName": "CoolPlayer123",  // ✨ NEW
  "message": "Ready to start!",
  "timestamp": "2025-11-20T10:00:00.000Z"
}
```

**4. Lobby Invitations**
```json
{
  "type": "lobby_invite",
  "senderId": "player123",
  "senderName": "CoolPlayer123",  // ✨ NEW
  "lobbyCode": "ABC123",
  "lobbyName": "Epic Battle",
  "expiresAt": "2025-11-20T10:05:00.000Z",
  "timestamp": "2025-11-20T10:00:00.000Z"
}
```

**5. Lobby Invite Responses**
```json
{
  "type": "lobby_invite_response",
  "responderId": "friend1",
  "responderName": "BestFriend99",  // ✨ NEW
  "lobbyCode": "ABC123",
  "accepted": true,
  "timestamp": "2025-11-20T10:00:30.000Z"
}
```

**6. Authentication Success Response**
```json
{
  "type": "auth_success",
  "userId": "player123",
  "username": "CoolPlayer123",  // ✨ NEW
  "timestamp": "2025-11-20T10:00:00.000Z"
}
```

#### Database Changes

**Firestore `friend_chats` Collection:**

New fields added to documents:
- `senderName`: Display name of the message sender
- `recipientName`: Display name of the message recipient

**Updated Document Structure:**
```javascript
{
  conversationId: "player1_player2",
  senderId: "player1",
  senderName: "CoolPlayer1",        // ✨ NEW
  recipientId: "player2",
  recipientName: "AwesomePlayer2",  // ✨ NEW
  message: "Hello!",
  timestamp: Timestamp,
  read: false
}
```

**Friend Chat History API Response:**

GET `/api/friend-chat/history` now returns:
```json
{
  "success": true,
  "messages": [
    {
      "id": "msg123",
      "senderId": "player123",
      "senderName": "CoolPlayer123",      // ✨ NEW
      "recipientId": "friend1",
      "recipientName": "BestFriend99",    // ✨ NEW
      "message": "Hey friend!",
      "timestamp": "2025-11-20T10:00:00.000Z",
      "read": false
    }
  ],
  "count": 1
}
```

#### Technical Implementation Details

**Modified Files:**
1. `src/server.js`
   - Added username validation in authentication
   - Pass username to ConnectionManager

2. `src/managers/ConnectionManager.js`
   - Store username with client connection data
   - Enhanced logging with usernames

3. `src/handlers/GlobalChatHandler.js`
   - Add senderName to message payloads
   - Retrieve username from connection manager

4. `src/handlers/FriendChatHandler.js`
   - Add senderName and recipientName to messages
   - Store usernames in Firestore documents
   - Return usernames in chat history API

5. `src/handlers/LobbyChatHandler.js`
   - Add senderName to lobby messages

6. `src/handlers/LobbyInviteHandler.js`
   - Add senderName to invitations
   - Add responderName to invite responses

#### Migration Guide

**For Unity Developers:**

1. **Update Authentication Code:**
```csharp
// OLD - Will no longer work
var authMsg = new {
    action = "auth",
    userId = "player123",
    friendIds = new string[] { "friend1", "friend2" }
};

// NEW - Required format
var authMsg = new {
    action = "auth",
    userId = "player123",
    username = "CoolPlayer123",  // ← Add this
    friendIds = new string[] { "friend1", "friend2" }
};
```

2. **Update Message Parsing:**

Add `senderName` field to your message classes:
```csharp
[System.Serializable]
public class GlobalChatMessage {
    public string type;
    public string senderId;
    public string senderName;  // ← Add this
    public string message;
    public string timestamp;
}

[System.Serializable]
public class FriendChatMessage {
    public string type;
    public string senderId;
    public string senderName;      // ← Add this
    public string recipientId;
    public string recipientName;   // ← Add this
    public string message;
    public string timestamp;
}
```

3. **Update UI to Display Usernames:**
```csharp
void OnGlobalChatReceived(GlobalChatMessage msg) {
    // OLD: chatUI.AddMessage(msg.senderId, msg.message);
    // NEW: Use senderName for display
    chatUI.AddMessage(msg.senderName, msg.message);
}
```

#### Benefits

✅ **No More ID-to-Username Queries**: Display names are included in every message  
✅ **Improved User Experience**: Users see readable names instead of IDs  
✅ **Better Chat History**: Historical messages retain username context  
✅ **Enhanced Debugging**: Server logs are more readable with usernames  
✅ **Reduced API Calls**: No need for separate username lookup endpoints

#### Backward Compatibility

⚠️ **This is a breaking change** - v1.x clients will not work with v2.0 server

- Old authentication messages without `username` will be rejected
- Clients must update to include username in auth message
- All message handlers have been updated to include username fields

#### Testing Recommendations

1. Test authentication with username field
2. Verify all chat messages display sender names correctly
3. Check friend chat history includes usernames
4. Validate lobby invites show sender names
5. Ensure offline message saving includes usernames

---

## [1.0.0] - 2025-11-13

### Initial Release

#### Features
- WebSocket-based real-time communication
- Global chat broadcasting
- Private friend chat with Firestore history
- Lobby-based chat channels
- Lobby invitation system
- Server-to-client notifications via REST API
- Friend chat history with pagination
- CORS enabled for all origins
- Firebase Firestore integration
- Health check and statistics endpoints
