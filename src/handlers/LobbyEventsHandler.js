/**
 * LobbyEventsHandler - Handles lobby events (queue, mode changes, host changes)
 * Broadcasts events to all subscribed lobby members except the sender
 */
class LobbyEventsHandler {
  constructor(connectionManager) {
    this.connectionManager = connectionManager;
    
    // Event type constants
    this.EVENT_TYPES = {
      START_QUEUE: 'start_queue',
      STOP_QUEUE: 'stop_queue',
      CHANGE_MODE: 'change_mode',
      CHANGE_HOST: 'change_host'
    };

    // Valid game modes
    this.GAME_MODES = ['Casual', 'Ranked', 'Custom'];

    // Rate limiting: track events per user
    this.eventCounts = new Map(); // userId -> { count, resetTime }
    this.RATE_LIMIT = 10; // Max events per minute
    this.RATE_WINDOW = 60 * 1000; // 1 minute
  }

  /**
   * Check rate limit for a user
   */
  checkRateLimit(userId) {
    const now = Date.now();
    const userLimit = this.eventCounts.get(userId);

    if (!userLimit || now > userLimit.resetTime) {
      // Reset or initialize
      this.eventCounts.set(userId, {
        count: 1,
        resetTime: now + this.RATE_WINDOW
      });
      return true;
    }

    if (userLimit.count >= this.RATE_LIMIT) {
      return false;
    }

    userLimit.count++;
    return true;
  }

  /**
   * Broadcast lobby event to all subscribed members except sender
   */
  broadcastLobbyEvent(lobbyId, senderId, eventType, additionalData = {}) {
    const senderClient = this.connectionManager.getClient(senderId);
    const senderName = senderClient?.username || 'Unknown';

    // Create event payload
    const eventPayload = {
      type: 'lobby_event',
      timestamp: new Date().toISOString(),
      eventType: eventType,
      lobbyId: lobbyId,
      senderId: senderId,
      senderName: senderName,
      ...additionalData
    };

    // Get all clients in the lobby
    const lobbyClients = this.connectionManager.getLobbyClients(lobbyId);
    let successCount = 0;

    lobbyClients.forEach(client => {
      // Don't send back to sender
      if (client.userId === senderId) {
        return;
      }

      try {
        if (client.ws.readyState === 1) { // WebSocket.OPEN
          client.ws.send(JSON.stringify(eventPayload));
          successCount++;
        }
      } catch (error) {
        console.error(`Error sending lobby event to client ${client.userId}:`, error.message);
      }
    });

    console.log(`Lobby event "${eventType}" from ${senderId} (${senderName}) in lobby ${lobbyId} sent to ${successCount} members`);
    return successCount;
  }

  /**
   * Send lobby roster to all members in the lobby
   * Contains all lobby members with their character selections
   */
  sendLobbyRoster(lobbyId, recipientUserId = null) {
    try {
      // Get all clients in the lobby
      const lobbyClients = this.connectionManager.getLobbyClients(lobbyId);
      
      if (lobbyClients.length === 0) {
        return false;
      }

      // Build roster with all member info
      const members = lobbyClients.map(client => ({
        userId: client.userId,
        username: client.username,
        characterId: client.characterId || null
      }));

      // Create roster event payload
      const rosterEvent = {
        type: 'lobby_event',
        eventType: 'lobby_roster',
        lobbyId: lobbyId,
        members: members,
        timestamp: new Date().toISOString()
      };

      const rosterJson = JSON.stringify(rosterEvent);
      let sentCount = 0;

      // Send to specific recipient or all members
      if (recipientUserId) {
        const recipientClient = this.connectionManager.getClient(recipientUserId);
        if (recipientClient && recipientClient.ws.readyState === 1) {
          recipientClient.ws.send(rosterJson);
          sentCount = 1;
          console.log(`Sent lobby roster to ${recipientUserId} for lobby ${lobbyId} (${members.length} members)`);
        }
      } else {
        // Broadcast to all lobby members
        lobbyClients.forEach(client => {
          try {
            if (client.ws.readyState === 1) {
              client.ws.send(rosterJson);
              sentCount++;
            }
          } catch (error) {
            console.error(`Error sending roster to ${client.userId}:`, error.message);
          }
        });
        console.log(`Broadcast lobby roster for ${lobbyId} to ${sentCount} members (${members.length} in roster)`);
      }

      return sentCount > 0;
    } catch (error) {
      console.error(`Error sending lobby roster:`, error);
      return false;
    }
  }

  /**
   * Broadcast roster to all lobbies (periodic sync)
   */
  broadcastAllLobbyRosters() {
    try {
      const lobbies = this.connectionManager.getAllLobbies();
      let lobbyCount = 0;

      lobbies.forEach(lobbyId => {
        const success = this.sendLobbyRoster(lobbyId);
        if (success) lobbyCount++;
      });

      if (lobbyCount > 0) {
        console.log(`Periodic roster sync: updated ${lobbyCount} lobbies`);
      }
    } catch (error) {
      console.error('Error in periodic roster broadcast:', error);
    }
  }

  /**
   * Handle start queue event
   */
  handleStartQueue(data, senderId) {
    const { lobbyId, gameMode } = data;

    // Validation
    if (!lobbyId) {
      return { success: false, error: 'Lobby ID is required' };
    }

    if (!gameMode) {
      return { success: false, error: 'Game mode is required' };
    }

    if (!this.GAME_MODES.includes(gameMode)) {
      return { success: false, error: `Invalid game mode. Must be one of: ${this.GAME_MODES.join(', ')}` };
    }

    // Check if sender is in the lobby
    const senderClient = this.connectionManager.getClient(senderId);
    if (!senderClient || senderClient.lobbyId !== lobbyId) {
      return { success: false, error: 'You are not subscribed to this lobby' };
    }

    // Rate limiting
    if (!this.checkRateLimit(senderId)) {
      return { success: false, error: 'Rate limit exceeded. Please wait before sending more events.' };
    }

    // Broadcast to lobby members
    const recipientCount = this.broadcastLobbyEvent(lobbyId, senderId, this.EVENT_TYPES.START_QUEUE, {
      gameMode: gameMode
    });

    return { 
      success: true, 
      lobbyId: lobbyId,
      eventType: 'start_queue',
      recipients: recipientCount 
    };
  }

  /**
   * Handle stop queue event
   */
  handleStopQueue(data, senderId) {
    const { lobbyId } = data;

    // Validation
    if (!lobbyId) {
      return { success: false, error: 'Lobby ID is required' };
    }

    // Check if sender is in the lobby
    const senderClient = this.connectionManager.getClient(senderId);
    if (!senderClient || senderClient.lobbyId !== lobbyId) {
      return { success: false, error: 'You are not subscribed to this lobby' };
    }

    // Rate limiting
    if (!this.checkRateLimit(senderId)) {
      return { success: false, error: 'Rate limit exceeded. Please wait before sending more events.' };
    }

    // Broadcast to lobby members
    const recipientCount = this.broadcastLobbyEvent(lobbyId, senderId, this.EVENT_TYPES.STOP_QUEUE);

    return { 
      success: true, 
      lobbyId: lobbyId,
      eventType: 'stop_queue',
      recipients: recipientCount 
    };
  }

  /**
   * Handle change mode event
   */
  handleChangeMode(data, senderId) {
    const { lobbyId, gameMode } = data;

    // Validation
    if (!lobbyId) {
      return { success: false, error: 'Lobby ID is required' };
    }

    if (!gameMode) {
      return { success: false, error: 'Game mode is required' };
    }

    if (!this.GAME_MODES.includes(gameMode)) {
      return { success: false, error: `Invalid game mode. Must be one of: ${this.GAME_MODES.join(', ')}` };
    }

    // Check if sender is in the lobby
    const senderClient = this.connectionManager.getClient(senderId);
    if (!senderClient || senderClient.lobbyId !== lobbyId) {
      return { success: false, error: 'You are not subscribed to this lobby' };
    }

    // Rate limiting
    if (!this.checkRateLimit(senderId)) {
      return { success: false, error: 'Rate limit exceeded. Please wait before sending more events.' };
    }

    // Broadcast to lobby members
    const recipientCount = this.broadcastLobbyEvent(lobbyId, senderId, this.EVENT_TYPES.CHANGE_MODE, {
      gameMode: gameMode
    });

    return { 
      success: true, 
      lobbyId: lobbyId,
      eventType: 'change_mode',
      recipients: recipientCount 
    };
  }

  /**
   * Handle change host event (future feature)
   */
  handleChangeHost(data, senderId) {
    const { lobbyId, newHostId } = data;

    // Validation
    if (!lobbyId) {
      return { success: false, error: 'Lobby ID is required' };
    }

    if (!newHostId) {
      return { success: false, error: 'New host ID is required' };
    }

    // Check if sender is in the lobby
    const senderClient = this.connectionManager.getClient(senderId);
    if (!senderClient || senderClient.lobbyId !== lobbyId) {
      return { success: false, error: 'You are not subscribed to this lobby' };
    }

    // Get new host info
    const newHostClient = this.connectionManager.getClient(newHostId);
    if (!newHostClient) {
      return { success: false, error: 'New host is not online or not in lobby' };
    }

    if (newHostClient.lobbyId !== lobbyId) {
      return { success: false, error: 'New host is not in this lobby' };
    }

    const newHostName = newHostClient.username || 'Unknown';

    // Rate limiting
    if (!this.checkRateLimit(senderId)) {
      return { success: false, error: 'Rate limit exceeded. Please wait before sending more events.' };
    }

    // Broadcast to lobby members
    const recipientCount = this.broadcastLobbyEvent(lobbyId, senderId, this.EVENT_TYPES.CHANGE_HOST, {
      newHostId: newHostId,
      newHostName: newHostName
    });

    return { 
      success: true, 
      lobbyId: lobbyId,
      eventType: 'change_host',
      newHostId: newHostId,
      newHostName: newHostName,
      recipients: recipientCount 
    };
  }

  /**
   * Handle member explicitly leaving lobby (client-initiated)
   */
  handleMemberLeft(data, senderId) {
    const { lobbyId } = data;

    // Validation
    if (!lobbyId) {
      return { success: false, error: 'Lobby ID is required' };
    }

    // Check if sender is in the lobby
    const senderClient = this.connectionManager.getClient(senderId);
    if (!senderClient || senderClient.lobbyId !== lobbyId) {
      return { success: false, error: 'You are not in this lobby' };
    }

    const senderName = senderClient.username || 'Unknown';

    // Broadcast to other lobby members BEFORE unsubscribing
    const recipientCount = this.broadcastMemberLeft(lobbyId, senderId, senderName);

    // Unsubscribe the sender from the lobby
    this.connectionManager.unsubscribeFromLobby(senderId);

    // Send updated roster to remaining members
    this.sendLobbyRoster(lobbyId);

    return {
      success: true,
      lobbyId: lobbyId,
      eventType: 'member_left',
      recipients: recipientCount
    };
  }

  /**
   * Broadcast when a member leaves the lobby (disconnect or explicit leave)
   */
  broadcastMemberLeft(lobbyId, userId, username) {
    try {
      // Create member left event payload
      const memberLeftEvent = {
        type: 'lobby_event',
        eventType: 'member_left',
        lobbyId: lobbyId,
        userId: userId,
        username: username,
        timestamp: new Date().toISOString()
      };

      // Get all remaining clients in the lobby
      const lobbyClients = this.connectionManager.getLobbyClients(lobbyId);
      let notifiedCount = 0;

      lobbyClients.forEach(client => {
        // Don't send back to the person leaving
        if (client.userId === userId) {
          return;
        }

        try {
          if (client.ws.readyState === 1) { // WebSocket.OPEN
            client.ws.send(JSON.stringify(memberLeftEvent));
            notifiedCount++;
          }
        } catch (error) {
          console.error(`Error sending member_left to client ${client.userId}:`, error.message);
        }
      });

      console.log(`Notified ${notifiedCount} lobby members that ${userId} (${username}) left lobby ${lobbyId}`);
      return notifiedCount;
    } catch (error) {
      console.error('Error broadcasting member left:', error);
      return 0;
    }
  }

  /**
   * Clean up rate limit tracking for disconnected users
   */
  cleanupRateLimit(userId) {
    this.eventCounts.delete(userId);
  }
}

module.exports = LobbyEventsHandler;
