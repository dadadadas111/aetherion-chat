require('dotenv').config();
const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
const http = require('http');

// Import configuration and managers
const { initializeFirebase } = require('./config/firebase');
const ConnectionManager = require('./managers/ConnectionManager');

// Import handlers
const GlobalChatHandler = require('./handlers/GlobalChatHandler');
const FriendChatHandler = require('./handlers/FriendChatHandler');
const LobbyChatHandler = require('./handlers/LobbyChatHandler');
const NotificationHandler = require('./handlers/NotificationHandler');
const LobbyInviteHandler = require('./handlers/LobbyInviteHandler');

// Initialize Firebase
initializeFirebase();

// Create Express app
const app = express();
app.use(cors()); // Allow all CORS
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket server
const wss = new WebSocket.Server({ server });

// Initialize managers and handlers
const connectionManager = new ConnectionManager();
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
        const friendIds = data.friendIds || [];
        
        if (!userId) {
          ws.send(JSON.stringify({ 
            type: 'error', 
            error: 'userId is required for authentication' 
          }));
          return;
        }

        connectionManager.addClient(ws, userId);
        connectionManager.setFriendList(userId, friendIds);

        ws.send(JSON.stringify({ 
          type: 'auth_success', 
          userId: userId,
          timestamp: new Date().toISOString()
        }));
        
        console.log(`User authenticated: ${userId}`);
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
        case 'global_chat':
          result = globalChatHandler.handleMessage(data, userId);
          break;

        case 'friend_chat':
          result = await friendChatHandler.handleMessage(data, userId);
          break;

        case 'lobby_subscribe':
          result = lobbyChatHandler.handleSubscribe(data, userId);
          break;

        case 'lobby_unsubscribe':
          result = lobbyChatHandler.handleUnsubscribe(data, userId);
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

  ws.on('close', () => {
    if (userId) {
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
  res.json({ 
    status: 'ok',
    ...stats
  });
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
app.get('/api/stats', (req, res) => {
  const stats = connectionManager.getStats();
  res.json(stats);
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

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing server');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
