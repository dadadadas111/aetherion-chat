/**
 * LobbyChatHandler - Handles lobby-specific chat messages
 * Broadcasts messages to all clients in the same lobby
 */
class LobbyChatHandler {
  constructor(connectionManager, lobbyManager = null, lobbyEventsHandler = null) {
    this.connectionManager = connectionManager;
    this.lobbyManager = lobbyManager;
    this.lobbyEventsHandler = lobbyEventsHandler;
  }

  /**
   * Handle lobby subscription
   */
  async handleSubscribe(data, userId) {
    const { lobbyId } = data;

    if (!lobbyId) {
      return { success: false, error: 'Lobby ID is required' };
    }

    // Prefer centralized lobby flow when available
    if (this.lobbyEventsHandler) {
      try {
        return await this.lobbyEventsHandler.handleJoinLobby({ lobbyId }, userId);
      } catch (err) {
        console.error('Error joining lobby via lobbyEventsHandler:', err);
        return { success: false, error: 'Failed to join lobby' };
      }
    }

    // Fallback: legacy in-memory subscribe + best-effort Redis add
    const client = this.connectionManager.getClient(userId);
    if (!client) return { success: false, error: 'Client not found' };

    const result = this.connectionManager.subscribeToLobby(userId, lobbyId);

    if (result) {
      // If we have a lobbyManager, try to add the member in Redis too
      if (this.lobbyManager) {
        try {
          await this.lobbyManager.addMember(lobbyId, userId, client.username, client.characterId);
        } catch (err) {
          console.warn('Failed to add member to Redis during subscribe fallback:', err.message || err);
        }
      }
      return { success: true, lobbyId: lobbyId };
    } else {
      return { success: false, error: 'Failed to subscribe to lobby' };
    }
  }

  /**
   * Handle lobby unsubscription
   */
  async handleUnsubscribe(data, userId) {
    const client = this.connectionManager.getClient(userId);
    const lobbyId = (data && data.lobbyId) || client?.lobbyId;

    if (!lobbyId) {
      // Nothing to do
      this.connectionManager.unsubscribeFromLobby(userId);
      return { success: true };
    }

    // Prefer centralized handling when available
    if (this.lobbyEventsHandler) {
      try {
        return await this.lobbyEventsHandler.handleLeaveLobby({ lobbyId }, userId);
      } catch (err) {
        console.error('Error leaving lobby via lobbyEventsHandler:', err);
        return { success: false, error: 'Failed to leave lobby' };
      }
    }

    // Fallback: legacy unsubscribe + best-effort Redis removal
    this.connectionManager.unsubscribeFromLobby(userId);

    if (this.lobbyManager) {
      try {
        await this.lobbyManager.removeMember(lobbyId, userId);
      } catch (err) {
        console.warn('Failed to remove member from Redis during unsubscribe fallback:', err.message || err);
      }
    }

    return { success: true };
  }

  /**
   * Handle incoming lobby chat message
   */
  async handleMessage(data, senderId) {
    const { lobbyId, senderName, message } = data;
    let name = senderName;

    console.log(`LobbyChatHandler: Received message from ${senderId} for lobby ${lobbyId}`);

    if (!lobbyId) {
      return { success: false, error: 'Lobby ID is required' };
    }

    if (!message || message.trim().length === 0) {
      return { success: false, error: 'Message cannot be empty' };
    }

    // Verify sender is in the lobby (use connection manager as the source of truth for active connections)
    const senderClient = this.connectionManager.getClient(senderId);
    if (!senderClient || senderClient.lobbyId !== lobbyId) {
      return { success: false, error: 'You are not subscribed to this lobby' };
    }

    if (!senderName || senderName.trim().length === 0) {
      name = senderClient.username || 'Unknown';
    }
    // const senderName = senderClient.username || 'Unknown';

    // Create message payload
    const messagePayload = {
      type: 'lobby_chat',
      lobbyId: lobbyId,
      senderId: senderId,
      senderName: senderName,
      message: message,
      timestamp: new Date().toISOString()
    };

    // Broadcast to all active subscribers
    const lobbyClients = this.connectionManager.getLobbyClients(lobbyId);
    let successCount = 0;

    lobbyClients.forEach(client => {
      try {
        if (client.ws.readyState === 1) { // WebSocket.OPEN
          client.ws.send(JSON.stringify(messagePayload));
          successCount++;
        }
      } catch (error) {
        console.error(`Error sending to client ${client.userId}:`, error.message);
      }
    });

    // Optional: persist chat to somewhere (not implemented) or integrate with lobbyEventsHandler
    console.log(`Lobby chat from ${senderId} (${senderName}) in lobby ${lobbyId} sent to ${successCount} clients`);
    return { success: true, recipients: successCount };
  }
}

module.exports = LobbyChatHandler;
