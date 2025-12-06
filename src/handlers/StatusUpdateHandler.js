/**
 * StatusUpdateHandler manages player status updates and friend notifications
 */
class StatusUpdateHandler {
  constructor(connectionManager, playerStatusManager, lobbyEventsHandler = null) {
    this.connectionManager = connectionManager;
    this.playerStatusManager = playerStatusManager;
    this.lobbyEventsHandler = lobbyEventsHandler;
  }

  /**
   * Handle player status update
   */
  async handleStatusUpdate(data, userId) {
    try {
      const { status, gameInfo, characterId } = data;
      
      if (!status) {
        return { 
          success: false, 
          error: 'Status is required' 
        };
      }

      // Validate status
      const validStatuses = ['online', 'offline', 'ingame'];
      if (!validStatuses.includes(status)) {
        return { 
          success: false, 
          error: `Invalid status. Valid statuses: ${validStatuses.join(', ')}` 
        };
      }

      // Update player status in Redis
      const success = await this.playerStatusManager.setPlayerStatus(userId, status, gameInfo, characterId);
      
      if (!success) {
        return { 
          success: false, 
          error: 'Failed to update status in cache' 
        };
      }

      // Update character ID in connection manager
      const client = this.connectionManager.getClient(userId);
      if (client && characterId !== undefined) {
        client.characterId = characterId;
      }

      // If user is in a lobby and character changed, update Redis and broadcast
      if (this.lobbyEventsHandler && client && client.lobbyId && characterId !== undefined) {
        await this.lobbyEventsHandler.handleCharacterChange(client.lobbyId, userId, characterId);
      }

      // Get the user's friends and notify them about the status change
      await this.notifyFriendsOfStatusChange(userId, status, gameInfo, characterId);

      return { 
        success: true, 
        status: status,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error handling status update:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  /**
   * Notify friends about status change
   */
  async notifyFriendsOfStatusChange(userId, status, gameInfo = null, characterId = null) {
    try {
      // Get the user's friend list from Redis cache
      const friendIds = await this.playerStatusManager.getPlayerFriends(userId);
      
      if (friendIds.length === 0) {
        return;
      }

      // Get user info for the notification
      const userClient = this.connectionManager.getClient(userId);
      const username = userClient ? userClient.username : userId;

      // Prepare notification message
      const notification = {
        type: 'friend_status_changed',
        friendId: userId,
        friendUsername: username,
        status: status,
        gameInfo: gameInfo,
        characterId: characterId,
        timestamp: new Date().toISOString()
      };

      // Send notification to all connected friends
      let notifiedCount = 0;
      for (const friendId of friendIds) {
        const friendClient = this.connectionManager.getClient(friendId);
        
        if (friendClient && friendClient.ws.readyState === 1) { // WebSocket.OPEN = 1
          try {
            friendClient.ws.send(JSON.stringify(notification));
            notifiedCount++;
          } catch (error) {
            console.error(`Error sending notification to friend ${friendId}:`, error);
          }
        }
      }

      console.log(`Notified ${notifiedCount} friends about ${userId}'s status change to ${status}`);
    } catch (error) {
      console.error('Error notifying friends of status change:', error);
    }
  }



  /**
   * Handle player going offline (cleanup)
   */
  async handlePlayerOffline(userId) {
    try {
      // Set status to offline in Redis
      await this.playerStatusManager.setPlayerStatus(userId, 'offline');
      
      // Notify friends about offline status
      await this.notifyFriendsOfStatusChange(userId, 'offline');
      
      console.log(`Player ${userId} marked as offline`);
    } catch (error) {
      console.error('Error handling player offline:', error);
    }
  }

  /**
   * Handle friend list update
   */
  async handleFriendListUpdate(data, userId) {
    try {
      const { friendIds } = data;
      
      if (!Array.isArray(friendIds)) {
        return { 
          success: false, 
          error: 'friendIds must be an array' 
        };
      }

      // Update friend list in both connection manager and Redis cache
      this.connectionManager.setFriendList(userId, friendIds);
      await this.playerStatusManager.setPlayerFriends(userId, friendIds);

      return { 
        success: true, 
        friendCount: friendIds.length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error handling friend list update:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }
}

module.exports = StatusUpdateHandler;