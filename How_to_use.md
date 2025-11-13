# Aetherion Chat Server - Unity Integration Guide

## Overview
This is a real-time chat server for Aetherion online game. It uses **WebSocket** for real-time communication and provides **REST APIs** for chat history and notifications.

**Production Server**:
- **WebSocket URL**: `wss://aetherion-chat.onrender.com`
- **API URL**: `https://aetherion-chat.onrender.com/api`

**Local Development**:
- **WebSocket URL**: `ws://localhost:3000`
- **API URL**: `http://localhost:3000/api`

---

## Connection Setup

### 1. Connect to WebSocket Server
Use a WebSocket library in Unity (e.g., `WebSocketSharp` or `NativeWebSocket`).

**Production Connection:**
```csharp
// Use WSS (secure WebSocket) for production
string serverUrl = "wss://aetherion-chat.onrender.com";
WebSocket ws = new WebSocket(serverUrl);
ws.Connect();
```

**Local Development:**
```csharp
// Use WS (non-secure) for local testing
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
Use HTTP GET request to retrieve chat history with pagination support.

**Endpoint:**  
`GET https://aetherion-chat.onrender.com/api/friend-chat/history`

**Query Parameters:**
- `userId` (required): Your user ID
- `friendId` (required): Friend's user ID
- `limit` (optional): Number of messages to return (default: 50, max: 100)
- `startAfter` (optional): ISO timestamp for pagination - returns messages older than this timestamp

**Example Request:**
```
GET https://aetherion-chat.onrender.com/api/friend-chat/history?userId=player123&friendId=friend1&limit=50
```

**Example with Pagination (load older messages):**
```
GET https://aetherion-chat.onrender.com/api/friend-chat/history?userId=player123&friendId=friend1&limit=50&startAfter=2025-11-13T09:00:00.000Z
```

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
Mark all unread messages from a friend as read.

**Endpoint:**  
`POST https://aetherion-chat.onrender.com/api/friend-chat/mark-read`

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "userId": "player123",
  "friendId": "friend1"
}
```

**Response:**
```json
{
  "success": true,
  "updated": 5
}
```

---

### 3. Lobby Chat
Chat with players in the same game lobby. You must **subscribe to a lobby** before sending messages.

#### Step 1: Subscribe to Lobby
When a player joins a lobby, send this message:

```json
{
  "action": "lobby_subscribe",
  "lobbyId": "lobby_abc123"
}
```

**Response:**
```json
{
  "type": "ack",
  "action": "lobby_subscribe",
  "success": true,
  "lobbyId": "lobby_abc123"
}
```

#### Step 2: Send Lobby Chat Messages
After subscribing, you can send messages to all lobby members:

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

#### Step 3: Unsubscribe from Lobby
When a player leaves the lobby, unsubscribe:

```json
{
  "action": "lobby_unsubscribe"
}
```

**Note:** Players are automatically unsubscribed when they disconnect or join a different lobby.

---

### 4. Lobby Invitations
Invite friends to join your lobby. Only works if the recipient is **online**.

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

**Fields:**
- `recipientId` (required): The friend's user ID
- `lobbyCode` (required): The lobby code to join
- `lobbyName` (optional): Display name for the lobby
- `expiresAt` (optional): ISO timestamp when invite expires (default: 5 minutes from now)

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

**Note:** If the recipient is offline, you'll receive an error acknowledgment:
```json
{
  "type": "ack",
  "action": "lobby_invite",
  "success": false,
  "error": "Recipient is offline",
  "delivered": false
}
```

---

### 5. Notifications
Your game server can send notifications to connected Unity clients via REST API. This is useful for match-found alerts, friend requests, achievements, etc.

**Endpoint:**  
`POST https://aetherion-chat.onrender.com/api/notification`

**Headers:**
```
Content-Type: application/json
```

**Send to Specific Players:**
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

**Fields:**
- `userIds` (required): Array of user IDs to notify
- `notificationType` (required): Type identifier for the notification (e.g., "match_found", "friend_request", "achievement_unlocked")
- `payload` (optional): Any custom data object you want to send

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

**Broadcast to All Online Players:**  
Use this endpoint to send to everyone currently connected:

**Endpoint:**  
`POST https://aetherion-chat.onrender.com/api/notification/broadcast`

**Headers:**
```
Content-Type: application/json
```

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

**Response:**
```json
{
  "success": true,
  "sent": 150,
  "offline": 0,
  "failed": 0
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

1. **Always authenticate immediately after connecting**
   - Send the `auth` action as the first message
   - Include your `userId` and `friendIds` array
   
2. **Handle WebSocket events properly**
   ```csharp
   ws.OnOpen += () => {
       // Send auth message here
   };
   ws.OnMessage += (data) => {
       // Parse JSON and route to appropriate handler
   };
   ws.OnError += (error) => {
       // Log error and attempt reconnection
   };
   ws.OnClose += () => {
       // Attempt reconnection after delay
   };
   ```

3. **Subscribe to lobby when player joins a game**
   - Send `lobby_subscribe` when entering lobby
   - Always include the `lobbyId`

4. **Unsubscribe from lobby when player leaves**
   - Send `lobby_unsubscribe` when leaving lobby
   - Players can only be in one lobby at a time

5. **Handle reconnection gracefully**
   - Implement exponential backoff for reconnection attempts
   - Re-authenticate after reconnecting
   - Re-subscribe to lobby if applicable

6. **Parse JSON carefully**
   - Always check the `type` field to route messages
   - Handle unknown message types gracefully

7. **Use pagination for friend chat history**
   - Default limit is 50 messages
   - Use `startAfter` timestamp for loading older messages
   - Implement infinite scroll/lazy loading in UI

8. **Send ping periodically**
   - Send `ping` action every 30-60 seconds
   - Prevents connection timeout
   - Server responds with `pong`

9. **Check acknowledgments for important actions**
   - Server sends `ack` responses for most actions
   - Check `success` field in acknowledgments
   - Handle errors appropriately

---

## Connection Lifecycle Example

Here's a complete flow from connection to disconnection:

```csharp
using WebSocketSharp;
using UnityEngine;

public class ChatManager : MonoBehaviour
{
    private WebSocket ws;
    private string userId = "player123";
    private string[] friendIds = new string[] { "friend1", "friend2" };
    
    void Start()
    {
        ConnectToChatServer();
    }
    
    void ConnectToChatServer()
    {
        // 1. Connect to production server
        ws = new WebSocket("wss://aetherion-chat.onrender.com");
        
        ws.OnOpen += (sender, e) => {
            Debug.Log("Connected to chat server");
            // 2. Authenticate immediately
            AuthenticateUser();
        };
        
        ws.OnMessage += (sender, e) => {
            Debug.Log("Received: " + e.Data);
            // 3. Parse and handle messages
            HandleMessage(e.Data);
        };
        
        ws.OnError += (sender, e) => {
            Debug.LogError("WebSocket Error: " + e.Message);
        };
        
        ws.OnClose += (sender, e) => {
            Debug.Log("Disconnected from chat server");
            // Attempt reconnection after 5 seconds
            Invoke("ConnectToChatServer", 5f);
        };
        
        ws.Connect();
    }
    
    void AuthenticateUser()
    {
        var authMsg = new {
            action = "auth",
            userId = userId,
            friendIds = friendIds
        };
        ws.Send(JsonUtility.ToJson(authMsg));
    }
    
    void HandleMessage(string jsonData)
    {
        // Parse JSON and route to appropriate handler
        var msg = JsonUtility.FromJson<ChatMessage>(jsonData);
        
        switch(msg.type)
        {
            case "auth_success":
                Debug.Log("Authentication successful!");
                break;
            case "global_chat":
                // Display in global chat UI
                break;
            case "friend_chat":
                // Display in friend chat UI
                break;
            case "lobby_chat":
                // Display in lobby chat UI
                break;
            case "notification":
                // Handle notification
                break;
            // ... handle other message types
        }
    }
    
    // 4. Join lobby when in game
    public void JoinLobby(string lobbyId)
    {
        var msg = new {
            action = "lobby_subscribe",
            lobbyId = lobbyId
        };
        ws.Send(JsonUtility.ToJson(msg));
    }
    
    // 5. Leave lobby when game ends
    public void LeaveLobby()
    {
        var msg = new {
            action = "lobby_unsubscribe"
        };
        ws.Send(JsonUtility.ToJson(msg));
    }
    
    // 6. Disconnect on game exit
    void OnDestroy()
    {
        if (ws != null && ws.ReadyState == WebSocketState.Open)
        {
            ws.Close();
        }
    }
}
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

Check if the server is running and get connection statistics:

**Endpoint:**  
`GET https://aetherion-chat.onrender.com/health`

**Response:**
```json
{
  "status": "ok",
  "totalClients": 42,
  "totalLobbies": 5,
  "timestamp": "2025-11-13T10:00:00.000Z"
}
```

**Fields:**
- `status`: Server status ("ok" if running)
- `totalClients`: Number of currently connected players
- `totalLobbies`: Number of active lobby channels
- `timestamp`: Server time

---

## Testing the Connection

### Using a WebSocket Client Tool

Before implementing in Unity, test the server with a WebSocket client:

1. **Online Tool**: Use [websocketking.com](https://websocketking.com)
2. **Browser Extension**: WebSocket King or Simple WebSocket Client
3. **Command Line**: `wscat -c wss://aetherion-chat.onrender.com`

**Test Authentication:**
```json
{"action":"auth","userId":"test123","friendIds":[]}
```

**Test Global Chat:**
```json
{"action":"global_chat","message":"Hello from test!"}
```

---

## Troubleshooting

### Connection Issues

**Problem**: Cannot connect to WebSocket  
**Solutions**:
- Verify you're using `wss://` (secure) for production: `wss://aetherion-chat.onrender.com`
- Check your firewall/network settings
- Test connection with browser tool first
- Check server health: `https://aetherion-chat.onrender.com/health`

**Problem**: "Not authenticated" error  
**Solutions**:
- Always send `auth` action immediately after connection opens
- Check that `userId` field is included in auth message
- Wait for `OnOpen` event before sending auth

**Problem**: Messages not being received  
**Solutions**:
- Verify recipient is online (friend chat & invites only work with online users)
- For lobby chat: ensure you've subscribed to the lobby with `lobby_subscribe`
- Check message format matches the JSON examples exactly
- Look for `ack` responses to see if server received your message

### Common Errors

**"Recipient is offline"**
- The friend/player you're trying to message is not connected
- Friend chat messages are still saved to history for later retrieval

**"Message cannot be empty"**
- Check that `message` field is not empty or whitespace only

**"You are not subscribed to this lobby"**
- Send `lobby_subscribe` before sending `lobby_chat` messages
- Verify `lobbyId` matches in both subscribe and chat messages

**"userId is required for authentication"**
- Include `userId` field in your `auth` action
- Ensure it's not null or empty

---

## Need Help?

1. **Check server status**: Visit `https://aetherion-chat.onrender.com/health`
2. **Test with WebSocket tool**: Verify server is responding before debugging Unity code
3. **Check JSON format**: Ensure your messages match the examples exactly (case-sensitive)
4. **Review server logs**: Contact server admin if persistent issues occur
5. **Unity WebSocket library**: Ensure you're using a compatible library (WebSocketSharp recommended)
