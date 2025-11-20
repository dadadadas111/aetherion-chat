/**
 * LobbyInviteHandler - Handles lobby invitations between players
 * Allows players to invite friends to join their game lobby
 */
class LobbyInviteHandler {
  constructor(connectionManager) {
    this.connectionManager = connectionManager;
  }

  /**
   * Handle lobby invite from one player to another
   */
  handleInvite(data, senderId) {
    const { recipientId, lobbyCode, lobbyName, expiresAt } = data;

    if (!recipientId) {
      return { success: false, error: 'Recipient ID is required' };
    }

    if (!lobbyCode) {
      return { success: false, error: 'Lobby code is required' };
    }

    // Get sender and recipient info
    const senderClient = this.connectionManager.getClient(senderId);
    const senderName = senderClient?.username || 'Unknown';

    // Create invite payload
    const invitePayload = {
      type: 'lobby_invite',
      senderId: senderId,
      senderName: senderName,
      lobbyCode: lobbyCode,
      lobbyName: lobbyName || 'Game Lobby',
      expiresAt: expiresAt || new Date(Date.now() + 5 * 60 * 1000).toISOString(), // Default 5 min expiry
      timestamp: new Date().toISOString()
    };

    // Send to recipient if online
    const recipientClient = this.connectionManager.getClient(recipientId);
    
    if (!recipientClient) {
      return { success: false, error: 'Recipient is offline', delivered: false };
    }

    const recipientName = recipientClient.username || 'Unknown';

    try {
      if (recipientClient.ws.readyState === 1) { // WebSocket.OPEN
        recipientClient.ws.send(JSON.stringify(invitePayload));
        console.log(`Lobby invite from ${senderId} (${senderName}) to ${recipientId} (${recipientName}) (lobby: ${lobbyCode})`);
        return { success: true, delivered: true };
      } else {
        return { success: false, error: 'Recipient connection not ready', delivered: false };
      }
    } catch (error) {
      console.error(`Error sending invite to ${recipientId}:`, error.message);
      return { success: false, error: 'Failed to send invite', delivered: false };
    }
  }

  /**
   * Handle invite response (accept/decline)
   */
  handleInviteResponse(data, responderId) {
    const { senderId, lobbyCode, accepted } = data;

    if (!senderId) {
      return { success: false, error: 'Sender ID is required' };
    }

    if (!lobbyCode) {
      return { success: false, error: 'Lobby code is required' };
    }

    // Get responder info
    const responderClient = this.connectionManager.getClient(responderId);
    const responderName = responderClient?.username || 'Unknown';

    // Create response payload
    const responsePayload = {
      type: 'lobby_invite_response',
      responderId: responderId,
      responderName: responderName,
      lobbyCode: lobbyCode,
      accepted: accepted === true,
      timestamp: new Date().toISOString()
    };

    // Send response back to original sender
    const senderClient = this.connectionManager.getClient(senderId);
    
    if (!senderClient) {
      return { success: false, error: 'Original sender is offline', delivered: false };
    }

    const senderName = senderClient.username || 'Unknown';

    try {
      if (senderClient.ws.readyState === 1) {
        senderClient.ws.send(JSON.stringify(responsePayload));
        console.log(`Invite response from ${responderId} (${responderName}) to ${senderId} (${senderName}): ${accepted ? 'accepted' : 'declined'}`);
        return { success: true, delivered: true };
      } else {
        return { success: false, error: 'Sender connection not ready', delivered: false };
      }
    } catch (error) {
      console.error(`Error sending response to ${senderId}:`, error.message);
      return { success: false, error: 'Failed to send response', delivered: false };
    }
  }
}

module.exports = LobbyInviteHandler;
