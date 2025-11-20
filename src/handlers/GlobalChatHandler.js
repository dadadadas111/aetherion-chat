/**
 * GlobalChatHandler - Handles global chat messages
 * Broadcasts messages to all connected clients
 */
class GlobalChatHandler {
  constructor(connectionManager) {
    this.connectionManager = connectionManager;
  }

  /**
   * Handle incoming global chat message
   * @param {Object} data - Message data
   * @param {string} senderId - User ID of sender
   */
  handleMessage(data, senderId) {
    const { message } = data;

    if (!message || message.trim().length === 0) {
      return { success: false, error: 'Message cannot be empty' };
    }

    // Get sender info
    const senderClient = this.connectionManager.getClient(senderId);
    const senderName = senderClient?.username || 'Unknown';

    // Create message payload
    const messagePayload = {
      type: 'global_chat',
      senderId: senderId,
      senderName: senderName,
      message: message,
      timestamp: new Date().toISOString()
    };

    // Broadcast to all connected clients
    const clients = this.connectionManager.getAllClients();
    let successCount = 0;

    clients.forEach(client => {
      try {
        if (client.ws.readyState === 1) { // WebSocket.OPEN
          client.ws.send(JSON.stringify(messagePayload));
          successCount++;
        }
      } catch (error) {
        console.error(`Error sending to client ${client.userId}:`, error.message);
      }
    });

    console.log(`Global chat from ${senderId} (${senderName}) broadcasted to ${successCount} clients`);
    return { success: true, recipients: successCount };
  }
}

module.exports = GlobalChatHandler;
