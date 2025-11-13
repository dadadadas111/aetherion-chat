# Aetherion Chat Server - Unity Integration Guide

## Overview
This is a real-time chat server for Aetherion online game. It uses **WebSocket** for real-time communication and provides **REST APIs** for chat history and notifications.

**Server URL**: `ws://your-server-address:3000` (WebSocket)  
**API URL**: `http://your-server-address:3000/api` (REST)

---

## Connection Setup

### 1. Connect to WebSocket Server
Use a WebSocket library in Unity (e.g., `WebSocketSharp` or Unity's native WebSocket).

```csharp
// Example connection URL
string serverUrl = "ws://localhost:3000";
WebSocket ws = new WebSocket(serverUrl);
ws.Connect();
```

### 2. Authenticate User
**After connecting**, send an authentication message:

```json
{
  "action": "auth",
  "userId": "player123",
  "friendIds": ["friend1", "friend2", "friend3"]
}
```

**Response:**
```json
{
  "type": "auth_success",
  "userId": "player123",
  "timestamp": "2025-11-13T10:00:00.000Z"
}
```

---

## Chat Features

### 1. Global Chat
Broadcast a message to **all online players**.

**Send:**
```json
{
  "action": "global_chat",
  "message": "Hello everyone!"
}
```

**Receive (all clients):**
```json
{
  "type": "global_chat",
  "senderId": "player123",
  "message": "Hello everyone!",
  "timestamp": "2025-11-13T10:00:00.000Z"
}
```

---

### 2. Friend Chat
Send a private message to a friend. Messages are **saved to Firestore** for history.

**Send:**
```json
{
  "action": "friend_chat",
  "recipientId": "friend1",
  "message": "Hey friend!"
}
```

**Receive (recipient):**
```json
{
  "type": "friend_chat",
  "senderId": "player123",
  "recipientId": "friend1",
  "message": "Hey friend!",
  "timestamp": "2025-11-13T10:00:00.000Z"
}
```

**Receive (sender confirmation):**
```json
{
  "type": "friend_chat_sent",
  "senderId": "player123",
  "recipientId": "friend1",
  "message": "Hey friend!",
  "timestamp": "2025-11-13T10:00:00.000Z"
}
```

#### Get Friend Chat History (REST API)
**GET** `/api/friend-chat/history?userId=player123&friendId=friend1&limit=50&startAfter=2025-11-13T09:00:00.000Z`

**Response:**
```json
{
  "success": true,
  "messages": [
    {
      "id": "msg123",
      "senderId": "player123",
      "recipientId": "friend1",
      "message": "Hey friend!",
      "timestamp": "2025-11-13T10:00:00.000Z",
      "read": false
    }
  ],
  "count": 1
}
```

**Parameters:**
- `userId` (required): Your user ID
- `friendId` (required): Friend's user ID
- `limit` (optional): Number of messages (default: 50)
- `startAfter` (optional): ISO timestamp for pagination (get older messages)

#### Mark Messages as Read (REST API)
**POST** `/api/friend-chat/mark-read`

**Body:**
```json
{
  "userId": "player123",
  "friendId": "friend1"
}
```

---

### 3. Lobby Chat
Chat with players in the same game lobby.

#### Subscribe to Lobby
```json
{
  "action": "lobby_subscribe",
  "lobbyId": "lobby_abc123"
}
```

#### Send Lobby Chat
```json
{
  "action": "lobby_chat",
  "lobbyId": "lobby_abc123",
  "message": "Ready to start!"
}
```

**Receive (all lobby members):**
```json
{
  "type": "lobby_chat",
  "lobbyId": "lobby_abc123",
  "senderId": "player123",
  "message": "Ready to start!",
  "timestamp": "2025-11-13T10:00:00.000Z"
}
```

#### Unsubscribe from Lobby
```json
{
  "action": "lobby_unsubscribe"
}
```

---

### 4. Lobby Invitations
Invite a friend to join your lobby.

**Send Invite:**
```json
{
  "action": "lobby_invite",
  "recipientId": "friend1",
  "lobbyCode": "ABC123",
  "lobbyName": "Epic Battle",
  "expiresAt": "2025-11-13T10:05:00.000Z"
}
```

**Receive (recipient):**
```json
{
  "type": "lobby_invite",
  "senderId": "player123",
  "lobbyCode": "ABC123",
  "lobbyName": "Epic Battle",
  "expiresAt": "2025-11-13T10:05:00.000Z",
  "timestamp": "2025-11-13T10:00:00.000Z"
}
```

**Send Response (Accept/Decline):**
```json
{
  "action": "lobby_invite_response",
  "senderId": "player123",
  "lobbyCode": "ABC123",
  "accepted": true
}
```

**Receive Response (original sender):**
```json
{
  "type": "lobby_invite_response",
  "responderId": "friend1",
  "lobbyCode": "ABC123",
  "accepted": true,
  "timestamp": "2025-11-13T10:00:30.000Z"
}
```

---

### 5. Notifications
Your game server can send notifications to connected players via REST API.

**POST** `/api/notification` (from your game server)

**Body:**
```json
{
  "userIds": ["player123", "player456"],
  "notificationType": "match_found",
  "payload": {
    "matchId": "match789",
    "startTime": "2025-11-13T10:05:00.000Z"
  }
}
```

**Receive (Unity client):**
```json
{
  "type": "notification",
  "notificationType": "match_found",
  "payload": {
    "matchId": "match789",
    "startTime": "2025-11-13T10:05:00.000Z"
  },
  "timestamp": "2025-11-13T10:00:00.000Z"
}
```

**Broadcast to All Players:**  
**POST** `/api/notification/broadcast`

**Body:**
```json
{
  "notificationType": "server_maintenance",
  "payload": {
    "message": "Server will restart in 10 minutes",
    "downtime": 600
  }
}
```

---

## Message Flow Summary

### Incoming Message Types (from server)
- `auth_success` - Authentication successful
- `global_chat` - Global chat message
- `friend_chat` - Friend chat message received
- `friend_chat_sent` - Your friend chat was sent
- `lobby_chat` - Lobby chat message
- `lobby_invite` - Lobby invitation received
- `lobby_invite_response` - Response to your invite
- `notification` - Notification from game server
- `ack` - Acknowledgment of your action
- `error` - Error message

### Outgoing Actions (to server)
- `auth` - Authenticate with userId
- `global_chat` - Send global chat
- `friend_chat` - Send friend chat
- `lobby_subscribe` - Join lobby channel
- `lobby_unsubscribe` - Leave lobby channel
- `lobby_chat` - Send lobby chat
- `lobby_invite` - Send lobby invite
- `lobby_invite_response` - Respond to invite
- `ping` - Keep-alive ping

---

## Best Practices

1. **Always authenticate** immediately after connecting
2. **Subscribe to lobby** when player joins a game lobby
3. **Unsubscribe from lobby** when player leaves
4. **Handle reconnection** if connection drops
5. **Parse JSON** carefully for all incoming messages
6. **Check message type** to route to correct UI handler
7. **Use pagination** for friend chat history to avoid loading too much data
8. **Send ping** periodically (every 30 seconds) to keep connection alive

---

## Connection Lifecycle Example

```csharp
// 1. Connect
ws.Connect();

// 2. Authenticate
ws.Send(JsonUtility.ToJson(new {
    action = "auth",
    userId = "player123",
    friendIds = new string[] { "friend1", "friend2" }
}));

// 3. Use features (global chat, friend chat, etc.)

// 4. Join lobby when in game
ws.Send(JsonUtility.ToJson(new {
    action = "lobby_subscribe",
    lobbyId = "lobby_abc123"
}));

// 5. Leave lobby when game ends
ws.Send(JsonUtility.ToJson(new {
    action = "lobby_unsubscribe"
}));

// 6. Disconnect on game exit
ws.Close();
```

---

## Error Handling

All errors are returned with:
```json
{
  "type": "error",
  "error": "Error message description"
}
```

Common errors:
- `"Not authenticated"` - Send auth message first
- `"Recipient is offline"` - Friend/invite target not connected
- `"Message cannot be empty"` - Empty message sent
- `"You are not subscribed to this lobby"` - Send lobby chat without subscribing

---

## Server Health Check

**GET** `/health`

**Response:**
```json
{
  "status": "ok",
  "totalClients": 42,
  "totalLobbies": 5,
  "timestamp": "2025-11-13T10:00:00.000Z"
}
```

---

## Need Help?
- Check server logs for connection issues
- Ensure WebSocket URL is correct
- Verify JSON format of your messages
- Test with a WebSocket client tool first (e.g., Postman, wscat)
