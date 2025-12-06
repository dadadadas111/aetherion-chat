require('dotenv').config();
const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
const http = require('http');

// Import configuration and managers
const { initializeFirebase } = require('./config/firebase');
const ConnectionManager = require('./managers/ConnectionManager');
const PlayerStatusManager = require('./managers/PlayerStatusManager');
const LobbyManager = require('./managers/LobbyManager');

// Import handlers
const GlobalChatHandler = require('./handlers/GlobalChatHandler');
const FriendChatHandler = require('./handlers/FriendChatHandler');
const LobbyChatHandler = require('./handlers/LobbyChatHandler');
const NotificationHandler = require('./handlers/NotificationHandler');
const LobbyInviteHandler = require('./handlers/LobbyInviteHandler');
const StatusUpdateHandler = require('./handlers/StatusUpdateHandler');
const LobbyEventsHandler = require('./handlers/LobbyEventsHandler');

// Initialize Firebase
initializeFirebase();

// Initialize managers
const connectionManager = new ConnectionManager();
const playerStatusManager = new PlayerStatusManager();

// Handlers - will be initialized after Redis
let lobbyManager = null;
let lobbyEventsHandler = null;
let statusUpdateHandler = null;

// Initialize Redis connection
playerStatusManager.initialize().then(success => {
  if (success) {
    console.log('Player status manager initialized successfully');
    
    // Initialize lobby manager with Redis client
    lobbyManager = new LobbyManager(playerStatusManager.redisClient);
    
    // Initialize handlers that depend on lobby manager
    lobbyEventsHandler = new LobbyEventsHandler(connectionManager, lobbyManager);
    statusUpdateHandler = new StatusUpdateHandler(connectionManager, playerStatusManager, lobbyEventsHandler);
    
    console.log('Lobby manager and handlers initialized successfully');
  } else {
    console.warn('Player status manager failed to initialize - status features will be limited');
  }
}).catch(error => {
  console.error('Error initializing player status manager:', error);
});

// Create Express app
const app = express();
app.use(cors()); // Allow all CORS
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket server
const wss = new WebSocket.Server({ server });

// Initialize handlers that don't need Redis
const globalChatHandler = new GlobalChatHandler(connectionManager);
const friendChatHandler = new FriendChatHandler(connectionManager);
const lobbyChatHandler = new LobbyChatHandler(connectionManager);
const notificationHandler = new NotificationHandler(connectionManager);
const lobbyInviteHandler = new LobbyInviteHandler(connectionManager);

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  let userId = null;
  
  console.log('New WebSocket connection');

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      const { action } = data;

      // Handle authentication
      if (action === 'auth') {
        userId = data.userId;
        const username = data.username;
        const friendIds = data.friendIds || [];
        const characterId = data.characterId || null;
        
        if (!userId) {
          ws.send(JSON.stringify({ 
            type: 'error', 
            error: 'userId is required for authentication' 
          }));
          return;
        }

        if (!username) {
          ws.send(JSON.stringify({ 
            type: 'error', 
            error: 'username is required for authentication' 
          }));
          return;
        }

        connectionManager.addClient(ws, userId, username, characterId);
        connectionManager.setFriendList(userId, friendIds);
        
        // Cache friend list in Redis and set initial online status with character
        await playerStatusManager.setPlayerFriends(userId, friendIds);
        await playerStatusManager.setPlayerStatus(userId, 'online', null, characterId);

        ws.send(JSON.stringify({ 
          type: 'auth_success', 
          userId: userId,
          username: username,
          timestamp: new Date().toISOString()
        }));
        
        // Notify friends that this user is now online
        await statusUpdateHandler.notifyFriendsOfStatusChange(userId, 'online');
        
        console.log(`User authenticated: ${userId} (${username})`);
        return;
      }

      // Require authentication for all other actions
      if (!userId) {
        ws.send(JSON.stringify({ 
          type: 'error', 
          error: 'Not authenticated. Send auth message first.' 
        }));
        return;
      }

      // Route messages to appropriate handlers
      let result;

      switch (action) {
        case 'update_status':
          if (!statusUpdateHandler) {
            result = { success: false, error: 'Status system not ready' };
          } else {
            result = await statusUpdateHandler.handleStatusUpdate(data, userId);
          }
          break;

        case 'update_friend_list':
          if (!statusUpdateHandler) {
            result = { success: false, error: 'Status system not ready' };
          } else {
            result = await statusUpdateHandler.handleFriendListUpdate(data, userId);
          }
          break;

        case 'global_chat':
          result = globalChatHandler.handleMessage(data, userId);
          break;

        case 'friend_chat':
          result = await friendChatHandler.handleMessage(data, userId);
          break;

        case 'lobby_subscribe':
          if (!lobbyEventsHandler) {
            result = { success: false, error: 'Lobby system not ready' };
          } else {
            result = await lobbyEventsHandler.handleJoinLobby(data, userId);
          }
          break;

        case 'lobby_unsubscribe':
        case 'lobby_member_left':
          if (!lobbyEventsHandler) {
            result = { success: false, error: 'Lobby system not ready' };
          } else {
            result = await lobbyEventsHandler.handleLeaveLobby(data, userId);
          }
          break;

        case 'lobby_chat':
          result = lobbyChatHandler.handleMessage(data, userId);
          break;

        case 'lobby_invite':
          result = lobbyInviteHandler.handleInvite(data, userId);
          break;

        case 'lobby_invite_response':
          result = lobbyInviteHandler.handleInviteResponse(data, userId);
          break;

        case 'lobby_change_mode':
          if (!lobbyEventsHandler) {
            result = { success: false, error: 'Lobby system not ready' };
          } else {
            result = await lobbyEventsHandler.handleChangeMode(data, userId);
          }
          break;

        case 'lobby_change_host':
          if (!lobbyEventsHandler) {
            result = { success: false, error: 'Lobby system not ready' };
          } else {
            result = await lobbyEventsHandler.handleChangeHost(data, userId);
          }
          break;

        case 'lobby_start_queue':
          if (!lobbyEventsHandler) {
            result = { success: false, error: 'Lobby system not ready' };
          } else {
            result = await lobbyEventsHandler.handleStartQueue(data, userId);
          }
          break;

        case 'lobby_stop_queue':
          if (!lobbyEventsHandler) {
            result = { success: false, error: 'Lobby system not ready' };
          } else {
            result = await lobbyEventsHandler.handleStopQueue(data, userId);
          }
          break;

        case 'ping':
          result = { type: 'pong', timestamp: new Date().toISOString() };
          ws.send(JSON.stringify(result));
          return;

        default:
          result = { success: false, error: `Unknown action: ${action}` };
      }

      // Send result back to sender if it's an acknowledgment
      if (result && !result.broadcast) {
        ws.send(JSON.stringify({ 
          type: 'ack', 
          action: action,
          ...result 
        }));
      }

    } catch (error) {
      console.error('Error handling message:', error);
      ws.send(JSON.stringify({ 
        type: 'error', 
        error: error.message 
      }));
    }
  });

  ws.on('close', async () => {
    if (userId) {
      // Get client info before removing
      const client = connectionManager.getClient(userId);
      const wasInLobby = client?.lobbyId;
      const username = client?.username || userId;
      
      // If player was in a lobby, cleanup in Redis and notify others
      if (wasInLobby && lobbyEventsHandler) {
        await lobbyEventsHandler.handleDisconnect(userId, wasInLobby, username);
      }
      
      // Handle player going offline
      if (statusUpdateHandler) {
        await statusUpdateHandler.handlePlayerOffline(userId);
      }
      connectionManager.removeClient(userId);
    }
    console.log('WebSocket connection closed');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// REST API Endpoints

// Health check
app.get('/health', (req, res) => {
  const stats = connectionManager.getStats();
  const redisConnected = playerStatusManager.isConnected();
  res.json({ 
    status: 'ok',
    redis: redisConnected ? 'connected' : 'disconnected',
    ...stats
  });
});

// Get friend list with online status
app.get('/api/friends/status', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ 
        error: 'userId is required' 
      });
    }

    const friendListWithStatus = await playerStatusManager.getFriendListWithStatus(userId);

    res.json({ 
      success: true, 
      friends: friendListWithStatus,
      count: friendListWithStatus.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching friend list status:', error);
    res.status(500).json({ 
      error: error.message 
    });
  }
});

// Get specific player status
app.get('/api/player/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const playerStatus = await playerStatusManager.getPlayerStatus(userId);

    res.json({ 
      success: true, 
      userId: userId,
      ...playerStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching player status:', error);
    res.status(500).json({ 
      error: error.message 
    });
  }
});

// Clear player status (set to offline)
app.post('/api/player/status/clear', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ 
        error: 'userId is required' 
      });
    }

    const success = await playerStatusManager.clearPlayerStatus(userId);
    
    if (success) {
      // Notify friends about the status change
      await statusUpdateHandler.notifyFriendsOfStatusChange(userId, 'offline');
      
      res.json({ 
        success: true,
        message: 'Player status cleared',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({ 
        success: false,
        error: 'Failed to clear player status' 
      });
    }
  } catch (error) {
    console.error('Error clearing player status:', error);
    res.status(500).json({ 
      error: error.message 
    });
  }
});

// Update player status via REST API
app.post('/api/player/status/update', async (req, res) => {
  try {
    const { userId, status, gameInfo } = req.body;

    if (!userId || !status) {
      return res.status(400).json({ 
        error: 'userId and status are required' 
      });
    }

    const result = await statusUpdateHandler.handleStatusUpdate({ status, gameInfo }, userId);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error updating player status:', error);
    res.status(500).json({ 
      error: error.message 
    });
  }
});

// Send notification (for external game server)
app.post('/api/notification', (req, res) => {
  const { userIds, notificationType, payload } = req.body;

  const result = notificationHandler.sendNotification({ userIds, notificationType, payload });
  
  if (result.success) {
    res.json(result);
  } else {
    res.status(400).json(result);
  }
});

// Broadcast notification to all users
app.post('/api/notification/broadcast', (req, res) => {
  const { notificationType, payload } = req.body;

  const result = notificationHandler.broadcastNotification({ notificationType, payload });
  
  if (result.success) {
    res.json(result);
  } else {
    res.status(400).json(result);
  }
});

// Get friend chat history
app.get('/api/friend-chat/history', async (req, res) => {
  try {
    const { userId, friendId, limit, startAfter } = req.query;

    if (!userId || !friendId) {
      return res.status(400).json({ 
        error: 'userId and friendId are required' 
      });
    }

    const messages = await friendChatHandler.getChatHistory(
      userId, 
      friendId, 
      parseInt(limit) || 50,
      startAfter
    );

    res.json({ 
      success: true, 
      messages: messages,
      count: messages.length
    });
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ 
      error: error.message 
    });
  }
});

// Mark friend chat messages as read
app.post('/api/friend-chat/mark-read', async (req, res) => {
  try {
    const { userId, friendId } = req.body;

    if (!userId || !friendId) {
      return res.status(400).json({ 
        error: 'userId and friendId are required' 
      });
    }

    const result = await friendChatHandler.markMessagesAsRead(userId, friendId);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({ 
      error: error.message 
    });
  }
});

// Get server statistics
app.get('/api/stats', async (req, res) => {
  try {
    const stats = connectionManager.getStats();
    const redisConnected = playerStatusManager.isConnected();
    
    res.json({
      ...stats,
      redis: {
        connected: redisConnected,
        status: redisConnected ? 'healthy' : 'disconnected'
      },
      features: {
        friendStatus: redisConnected,
        chat: true,
        notifications: true
      }
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ 
      error: error.message 
    });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
const WS_PORT = process.env.WS_PORT || PORT;

server.listen(WS_PORT, () => {
  console.log(`===========================================`);
  console.log(`Aetherion Chat Server running on port ${WS_PORT}`);
  console.log(`WebSocket: ws://localhost:${WS_PORT}`);
  console.log(`HTTP API: http://localhost:${WS_PORT}`);
  console.log(`===========================================`);
});

// Periodic lobby cleanup (every 10 minutes)
const CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minutes
const cleanupTimer = setInterval(async () => {
  if (lobbyEventsHandler) {
    await lobbyEventsHandler.cleanupInactiveLobbies();
  }
}, CLEANUP_INTERVAL);

console.log(`Lobby cleanup enabled (every ${CLEANUP_INTERVAL / 60000} minutes)`);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing server');
  
  // Clear cleanup timer
  clearInterval(cleanupTimer);
  
  // Close Redis connection
  try {
    await playerStatusManager.close();
  } catch (error) {
    console.error('Error closing Redis connection:', error);
  }
  
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing server');
  
  // Clear cleanup timer
  clearInterval(cleanupTimer);
  
  // Close Redis connection
  try {
    await playerStatusManager.close();
  } catch (error) {
    console.error('Error closing Redis connection:', error);
  }
  
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
