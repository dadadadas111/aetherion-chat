# Friend List Online Status API Documentation

## Overview

The Aetherion Chat Server now includes a comprehensive friend list online status system that tracks player status (online, offline, ingame) using Redis cache and provides real-time notifications via WebSocket.

## Features

- **Real-time Status Updates**: Players can update their status via WebSocket
- **Friend Notifications**: When a player changes status, all connected friends are notified
- **Redis Cache**: Player status and friend lists are cached in Redis for fast access
- **REST API**: HTTP endpoints for checking friend status and managing player status
- **Auto-cleanup**: Players are automatically marked offline when they disconnect

## Player Status Types

- `online` - Player is connected and available
- `offline` - Player is disconnected (default when not found in cache)
- `ingame` - Player is currently in a game

## WebSocket API

### Authentication & Initial Setup

```javascript
// Connect and authenticate
ws.send(JSON.stringify({
  action: 'auth',
  userId: 'player123',
  username: 'PlayerName',
  friendIds: ['friend1', 'friend2', 'friend3'] // Optional: initial friend list
}));

// Response
{
  type: 'auth_success',
  userId: 'player123',
  username: 'PlayerName',
  timestamp: '2025-11-28T...'
}
```

### Update Player Status

```javascript
// Update your status
ws.send(JSON.stringify({
  action: 'update_status',
  status: 'ingame', // 'online', 'offline', 'ingame'
  gameInfo: { // Optional game information
    gameMode: 'ranked',
    mapName: 'dust2',
    lobbyId: 'lobby123'
  }
}));

// Response
{
  type: 'ack',
  action: 'update_status',
  success: true,
  status: 'ingame',
  timestamp: '2025-11-28T...'
}
```

### Update Friend List

```javascript
// Update your friend list
ws.send(JSON.stringify({
  action: 'update_friend_list',
  friendIds: ['friend1', 'friend2', 'friend4'] // New friend list
}));

// Response
{
  type: 'ack',
  action: 'update_friend_list',
  success: true,
  friendCount: 3,
  timestamp: '2025-11-28T...'
}
```

### Friend Status Change Notification

When a friend changes their status, you will receive:

```javascript
{
  type: 'friend_status_changed',
  friendId: 'friend1',
  friendUsername: 'FriendName',
  status: 'ingame',
  gameInfo: {
    gameMode: 'ranked',
    mapName: 'dust2',
    lobbyId: 'lobby123'
  },
  timestamp: '2025-11-28T...'
}
```

When you receive this notification, you should call the REST API to get the updated friend list.

## REST API Endpoints

### Get Friend List with Status

Get all friends and their current online status.

```http
GET /api/friends/status?userId=player123
```

**Response:**
```json
{
  "success": true,
  "friends": [
    {
      "userId": "friend1",
      "status": "online",
      "lastSeen": "2025-11-28T10:30:00.000Z",
      "gameInfo": null
    },
    {
      "userId": "friend2",
      "status": "ingame",
      "lastSeen": "2025-11-28T10:25:00.000Z",
      "gameInfo": {
        "gameMode": "ranked",
        "mapName": "dust2",
        "lobbyId": "lobby123"
      }
    },
    {
      "userId": "friend3",
      "status": "offline",
      "lastSeen": "2025-11-27T22:15:00.000Z",
      "gameInfo": null
    }
  ],
  "count": 3,
  "timestamp": "2025-11-28T10:30:15.000Z"
}
```

### Get Specific Player Status

Get the status of a specific player.

```http
GET /api/player/status/player123
```

**Response:**
```json
{
  "success": true,
  "userId": "player123",
  "status": "ingame",
  "lastSeen": "2025-11-28T10:30:00.000Z",
  "gameInfo": {
    "gameMode": "ranked",
    "mapName": "dust2",
    "lobbyId": "lobby123"
  },
  "timestamp": "2025-11-28T10:30:15.000Z"
}
```

### Update Player Status (REST)

Update player status via REST API (useful for external game servers).

```http
POST /api/player/status/update
Content-Type: application/json

{
  "userId": "player123",
  "status": "ingame",
  "gameInfo": {
    "gameMode": "ranked",
    "mapName": "dust2",
    "lobbyId": "lobby123"
  }
}
```

**Response:**
```json
{
  "success": true,
  "status": "ingame",
  "timestamp": "2025-11-28T10:30:15.000Z"
}
```

### Clear Player Status

Force a player to offline status (useful for admin/cleanup operations).

```http
POST /api/player/status/clear
Content-Type: application/json

{
  "userId": "player123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Player status cleared",
  "timestamp": "2025-11-28T10:30:15.000Z"
}
```

### Server Health Check

Check server health including Redis connection status.

```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "redis": "connected",
  "totalClients": 15,
  "totalLobbies": 3,
  "timestamp": "2025-11-28T10:30:15.000Z"
}
```

### Server Statistics

Get detailed server statistics.

```http
GET /api/stats
```

**Response:**
```json
{
  "totalClients": 15,
  "totalLobbies": 3,
  "redis": {
    "connected": true,
    "status": "healthy"
  },
  "features": {
    "friendStatus": true,
    "chat": true,
    "notifications": true
  },
  "timestamp": "2025-11-28T10:30:15.000Z"
}
```

## Environment Variables

Configure Redis connection with these environment variables:

```bash
# Redis Configuration (Option 1: Connection String)
REDIS_CONNECTION=host:port,password=xxx,ssl=True,abortConnect=False

# Redis Configuration (Option 2: Individual settings - fallback if REDIS_CONNECTION not set)
REDIS_HOST=localhost        # Redis server host
REDIS_PORT=6379            # Redis server port  
REDIS_PASSWORD=            # Redis password (optional)
REDIS_DB=0                 # Redis database number

# Server Configuration
PORT=3000                  # Server port
```

**Note**: If `REDIS_CONNECTION` is provided, it takes precedence over individual Redis settings.

## Redis Data Structure

The system uses the following Redis keys:

- `player:status:{userId}` - Player status data (TTL: 5 minutes)
- `player:friends:{userId}` - Player's friend list (TTL: 24 hours)

## Implementation Flow

1. **Player Connects**: 
   - Authenticates via WebSocket
   - Status set to 'online' in Redis
   - Friends notified of online status

2. **Status Updates**:
   - Player sends status update via WebSocket
   - Status cached in Redis with TTL
   - All connected friends notified

3. **Friend List Updates**:
   - Player updates friend list via WebSocket
   - Friend list cached in Redis
   - Used for future status notifications

4. **Status Queries**:
   - REST API queries Redis cache
   - Returns current status or 'offline' if not cached

5. **Player Disconnects**:
   - Status set to 'offline'
   - Friends notified of offline status

## Error Handling

- Redis connection failures: System continues to work with limited functionality
- Invalid status values: Returns error with list of valid statuses
- Missing authentication: All non-auth actions require authentication first
- WebSocket errors: Automatic cleanup and friend notification on disconnect

## Performance Considerations

- Redis TTL prevents stale data (5 minutes for status, 24 hours for friend lists)
- Bulk Redis operations for multiple friend status queries
- Efficient friend notification (only to connected friends)
- Automatic cleanup on disconnect