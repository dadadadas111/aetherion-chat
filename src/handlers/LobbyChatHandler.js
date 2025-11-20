/**
 * LobbyChatHandler - Handles lobby-specific chat messages
 * Broadcasts messages to all clients in the same lobby
 */
class LobbyChatHandler {
  constructor(connectionManager) {
    this.connectionManager = connectionManager;
  }

  /**
   * Handle lobby subscription
   */
  handleSubscribe(data, userId) {
    const { lobbyId } = data;

    if (!lobbyId) {
      return { success: false, error: 'Lobby ID is required' };
    }

    const result = this.connectionManager.subscribeToLobby(userId, lobbyId);
    
    if (result) {
      return { success: true, lobbyId: lobbyId };
    } else {
      return { success: false, error: 'Failed to subscribe to lobby' };
    }
  }

  /**
   * Handle lobby unsubscription
   */
  handleUnsubscribe(data, userId) {
    this.connectionManager.unsubscribeFromLobby(userId);
    return { success: true };
  }

  /**
   * Handle incoming lobby chat message
   */
  handleMessage(data, senderId) {
    const { lobbyId, message } = data;

    if (!lobbyId) {
      return { success: false, error: 'Lobby ID is required' };
    }

    if (!message || message.trim().length === 0) {
      return { success: false, error: 'Message cannot be empty' };
    }

    // Verify sender is in the lobby
    const senderClient = this.connectionManager.getClient(senderId);
    if (!senderClient || senderClient.lobbyId !== lobbyId) {
      return { success: false, error: 'You are not subscribed to this lobby' };
    }

    const senderName = senderClient.username || 'Unknown';

    // Create message payload
    const messagePayload = {
      type: 'lobby_chat',
      lobbyId: lobbyId,
      senderId: senderId,
      senderName: senderName,
      message: message,
      timestamp: new Date().toISOString()
    };

    // Broadcast to all clients in the lobby
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

    console.log(`Lobby chat from ${senderId} (${senderName}) in lobby ${lobbyId} sent to ${successCount} clients`);
    return { success: true, recipients: successCount };
  }
}

module.exports = LobbyChatHandler;
