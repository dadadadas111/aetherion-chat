# Aetherion Chat Server

A lightweight, real-time chat server for online games built with Node.js, WebSocket, and Firebase Firestore.

## Features

- ✅ **Global Chat** - Broadcast messages to all connected players
- ✅ **Friend Chat** - Private messaging with history persistence
- ✅ **Lobby Chat** - Channel-based chat for game lobbies
- ✅ **Lobby Invitations** - Invite friends to join your game
- ✅ **Notifications** - Server-to-client push notifications
- ✅ **Username Support** - Display names included in all messages (no extra queries needed)
- ✅ **REST API** - HTTP endpoints for chat history and notifications
- ✅ **Firebase Integration** - Persistent chat history with Firestore
- ✅ **CORS Enabled** - Works with any client origin

---

## Quick Start

> **Note:** Version 2.0 introduces username support. All clients must include `username` in authentication. See [CHANGELOG.md](./CHANGELOG.md) for migration details.

### Prerequisites
- Node.js 16+ installed
- Firebase project (for friend chat history - optional)

### Installation

1. **Clone or extract the project**

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**

Edit the `.env` file with your configuration:

```env
# Server port
PORT=3000

# Firebase service account JSON (for friend chat history)
FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"your-project",...}'
```

> **Note**: Firebase is optional. The server will work without it, but friend chat history won't be saved.

4. **Start the server**
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

The server will start on:
- **WebSocket**: `ws://localhost:3000`
- **HTTP API**: `http://localhost:3000`

---

## Project Structure

```
aetherion-chat/
├── src/
│   ├── server.js                    # Main server entry point
│   ├── config/
│   │   └── firebase.js              # Firebase configuration
│   ├── managers/
│   │   └── ConnectionManager.js     # Client connection management
│   └── handlers/
│       ├── GlobalChatHandler.js     # Global chat logic
│       ├── FriendChatHandler.js     # Friend chat + Firestore
│       ├── LobbyChatHandler.js      # Lobby chat channels
│       ├── LobbyInviteHandler.js    # Lobby invitations
│       └── NotificationHandler.js   # Push notifications
├── package.json
├── .env
├── How_to_use.md                    # Unity integration guide
└── README.md
```

---

## Architecture

### WebSocket Connection Flow
1. Client connects to WebSocket server
2. Client sends `auth` action with `userId` and `friendIds`
3. Server registers client and subscribes to channels
4. Client can send/receive messages in real-time
5. On disconnect, client is removed from all channels

### Message Routing
All messages use JSON format with an `action` field:
```json
{
  "action": "global_chat",
  "message": "Hello world!"
}
```

The server routes the action to the appropriate handler.

### Channel Management
- **Global Channel**: All connected clients (automatic)
- **Friend Channels**: Peer-to-peer messaging between friends
- **Lobby Channels**: Dynamic channels based on `lobbyId`

---

## API Endpoints

### WebSocket (ws://localhost:3000)
Real-time bidirectional communication. See [How_to_use.md](./How_to_use.md) for full protocol.

**Actions:**
- `auth` - Authenticate user
- `global_chat` - Send global message
- `friend_chat` - Send private message
- `lobby_subscribe` - Join lobby channel
- `lobby_unsubscribe` - Leave lobby channel
- `lobby_chat` - Send lobby message
- `lobby_invite` - Send lobby invitation
- `lobby_invite_response` - Respond to invitation
- `ping` - Keep-alive

### REST API (http://localhost:3000)

#### Health Check
```
GET /health
```
Returns server status and connection statistics.

#### Send Notification
```
POST /api/notification
Content-Type: application/json

{
  "userIds": ["player1", "player2"],
  "notificationType": "match_found",
  "payload": { "matchId": "123" }
}
```

#### Broadcast Notification
```
POST /api/notification/broadcast
Content-Type: application/json

{
  "notificationType": "maintenance",
  "payload": { "message": "Server restart in 5 min" }
}
```

#### Get Friend Chat History
```
GET /api/friend-chat/history?userId=player1&friendId=player2&limit=50
```
Returns paginated chat history from Firestore.

#### Mark Messages as Read
```
POST /api/friend-chat/mark-read
Content-Type: application/json

{
  "userId": "player1",
  "friendId": "player2"
}
```

#### Server Statistics
```
GET /api/stats
```
Returns connection and lobby statistics.

---

## Firebase Setup (Optional)

Friend chat history requires Firebase Firestore. If you don't configure Firebase, the server will run without chat history persistence.

### Get Firebase Service Account

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Project Settings** > **Service Accounts**
4. Click **Generate New Private Key**
5. Copy the entire JSON content
6. Set it as the `FIREBASE_SERVICE_ACCOUNT` environment variable in `.env`

### Firestore Structure

The server creates a collection called `friend_chats` with documents:

```json
{
  "conversationId": "player1_player2",
  "senderId": "player1",
  "recipientId": "player2",
  "message": "Hello!",
  "timestamp": "2025-11-13T10:00:00.000Z",
  "read": false
}
```

**Indexes**: Create a composite index on `conversationId` (ASC) + `timestamp` (DESC)

---

## Deployment

### Deploy to Any Node.js Host

1. Upload the entire project folder
2. Set environment variables on your hosting platform
3. Run `npm install --production`
4. Start with `npm start`

### Environment Variables for Production
```env
PORT=3000
FIREBASE_SERVICE_ACCOUNT='your-firebase-json'
NODE_ENV=production
```

### Recommended Hosts
- **Heroku**: Easy deployment with free tier
- **Railway**: Modern hosting with auto-deploy
- **DigitalOcean**: VPS with full control
- **AWS EC2**: Scalable cloud hosting
- **Google Cloud Run**: Serverless container hosting

---

## Unity Integration

See **[How_to_use.md](./How_to_use.md)** for complete Unity integration guide.

**Quick Example:**
```csharp
WebSocket ws = new WebSocket("ws://your-server:3000");
ws.Connect();

// Authenticate (username required)
string authMsg = JsonUtility.ToJson(new {
    action = "auth",
    userId = "player123",
    username = "CoolPlayer123",
    friendIds = new string[] { "friend1", "friend2" }
});
ws.Send(authMsg);

// Send global chat
string chatMsg = JsonUtility.ToJson(new {
    action = "global_chat",
    message = "Hello everyone!"
});
ws.Send(chatMsg);
```

---

## Monitoring

### Server Logs
The server logs all important events:
- Client connections/disconnections
- Message broadcasts
- Errors and warnings

### Health Endpoint
Check server health: `GET http://localhost:3000/health`

```json
{
  "status": "ok",
  "totalClients": 42,
  "totalLobbies": 5,
  "timestamp": "2025-11-13T10:00:00.000Z"
}
```

---

## Scaling Considerations

For high-traffic games, consider:

1. **Redis Adapter** - Sync WebSocket state across multiple server instances
2. **Load Balancer** - Distribute connections across servers
3. **Message Queue** - Buffer notifications with RabbitMQ/Redis
4. **Database Sharding** - Split Firestore by user ID ranges
5. **CDN** - Serve static assets from edge locations

---

## Troubleshooting

### WebSocket connection fails
- Check firewall allows port 3000
- Verify server is running (`GET /health`)
- Use `ws://` not `wss://` (unless using SSL)

### Firebase not working
- Verify `FIREBASE_SERVICE_ACCOUNT` is valid JSON
- Check Firebase project has Firestore enabled
- Create composite index in Firestore console

### Messages not delivered
- Ensure client is authenticated (`auth` action sent)
- Check recipient is online for friend/invite messages
- Verify lobby subscription for lobby chat

---

## License

ISC

## Support

For Unity integration questions, see [How_to_use.md](./How_to_use.md)

---

**Built with ❤️ for Aetherion**
