/**
 * LobbyEventsHandler - Handles lobby events with Redis as source of truth
 * All lobby state stored in Redis, broadcasts sync'd data to members
 */
class LobbyEventsHandler {
  constructor(connectionManager, lobbyManager) {
    this.connectionManager = connectionManager;
    this.lobbyManager = lobbyManager;
  }

  /**
   * Handle user joining lobby
   */
  async handleJoinLobby(data, userId) {
    const { lobbyId } = data;
    console.log(`Handling join lobby for user ${userId} to lobby ${lobbyId}`);
    if (!lobbyId) {
      return { success: false, error: 'Lobby ID is required' };
    }

    const client = this.connectionManager.getClient(userId);
    if (!client) {
      return { success: false, error: 'Client not found' };
    }

    try {
      // If user is already in another lobby, leave it first
      const oldLobbyId = client.lobbyId;
      if (oldLobbyId && oldLobbyId !== lobbyId) {
        console.log(`User ${userId} leaving old lobby ${oldLobbyId} before joining ${lobbyId}`);

        // Update connection manager
        this.connectionManager.unsubscribeFromLobby(userId);

        // Remove from old lobby in Redis
        await this.lobbyManager.removeMember(oldLobbyId, userId);

        // Notify old lobby members
        this.broadcastMemberLeft(oldLobbyId, userId, client.username);

        // Broadcast updated roster to old lobby
        await this.broadcastLobbyRoster(oldLobbyId);
      }

      // Add to new lobby in Redis
      await this.lobbyManager.addMember(
        lobbyId,
        userId,
        client.username,
        client.characterId
      );

      // Update connection manager
      this.connectionManager.subscribeToLobby(userId, lobbyId);

      // Broadcast updated roster to new lobby members
      await this.broadcastLobbyRoster(lobbyId);

      return {
        success: true,
        lobbyId: lobbyId
      };
    } catch (error) {
      console.error('Error handling join lobby:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle user leaving lobby
   */
  async handleLeaveLobby(data, userId) {
    const { lobbyId } = data;

    if (!lobbyId) {
      return { success: false, error: 'Lobby ID is required' };
    }

    try {
      const client = this.connectionManager.getClient(userId);
      const username = client?.username || userId;

      // Update connection manager
      this.connectionManager.unsubscribeFromLobby(userId);

      // Remove from Redis
      await this.lobbyManager.removeMember(lobbyId, userId);

      // Notify others that member left
      this.broadcastMemberLeft(lobbyId, userId, username);

      // Broadcast updated roster to remaining members
      await this.broadcastLobbyRoster(lobbyId);

      return {
        success: true,
        lobbyId: lobbyId
      };
    } catch (error) {
      console.error('Error handling leave lobby:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle character change in lobby
   */
  async handleCharacterChange(lobbyId, userId, characterId) {
    try {
      // Check if user is in lobby
      const isInLobby = await this.lobbyManager.isUserInLobby(lobbyId, userId);

      if (!isInLobby) {
        return false;
      }

      // Update in Redis
      await this.lobbyManager.updateMemberCharacter(lobbyId, userId, characterId);

      // Broadcast updated roster
      await this.broadcastLobbyRoster(lobbyId);

      return true;
    } catch (error) {
      console.error('Error handling character change:', error);
      return false;
    }
  }

  /**
   * Broadcast lobby roster to all members (from Redis)
   * Syncs Redis with active subscribers - prioritizes subscribers
   */
  async broadcastLobbyRoster(lobbyId) {
    try {
      // Get active subscribers from connection manager
      const lobbyClients = this.connectionManager.getLobbyClients(lobbyId);
      const subscriberIds = new Set(lobbyClients.map(c => c.userId));

      // Get members from Redis
      const redisMembers = await this.lobbyManager.getLobbyMembers(lobbyId);
      const redisMemberIds = new Set(redisMembers.map(m => m.userId));

      // Sync: Remove from Redis if not subscribed
      for (const redisMember of redisMembers) {
        if (!subscriberIds.has(redisMember.userId)) {
          console.log(`Sync: Removing ${redisMember.userId} from Redis (not subscribed)`);
          await this.lobbyManager.removeMember(lobbyId, redisMember.userId);
        }
      }

      // Sync: Add to Redis if subscribed but not in Redis
      for (const client of lobbyClients) {
        if (!redisMemberIds.has(client.userId)) {
          console.log(`Sync: Adding ${client.userId} to Redis (subscribed but missing)`);
          await this.lobbyManager.addMember(lobbyId, client.userId, client.username, client.characterId);
        }
      }

      // Get fresh synced data from Redis
      const members = await this.lobbyManager.getLobbyMembers(lobbyId);

      if (members.length === 0) {
        return;
      }

      // Create roster event
      const rosterEvent = {
        type: 'lobby_event',
        eventType: 'lobby_roster',
        lobbyId: lobbyId,
        members: members.map(m => ({
          userId: m.userId,
          username: m.username,
          characterId: m.characterId
        })),
        timestamp: new Date().toISOString()
      };

      // Broadcast to all subscribers
      let sentCount = 0;

      lobbyClients.forEach(client => {
        try {
          if (client.ws.readyState === 1) {
            client.ws.send(JSON.stringify(rosterEvent));
            sentCount++;
          }
        } catch (error) {
          console.error(`Error sending roster to ${client.userId}:`, error.message);
        }
      });

      console.log(`Broadcast roster for lobby ${lobbyId} to ${sentCount} members (${members.length} in Redis)`);
    } catch (error) {
      console.error('Error broadcasting lobby roster:', error);
    }
  }

  /**
   * Broadcast member left event
   */
  broadcastMemberLeft(lobbyId, userId, username) {
    try {
      const memberLeftEvent = {
        type: 'lobby_event',
        eventType: 'member_left',
        lobbyId: lobbyId,
        userId: userId,
        username: username,
        timestamp: new Date().toISOString()
      };

      const lobbyClients = this.connectionManager.getLobbyClients(lobbyId);
      let sentCount = 0;

      lobbyClients.forEach(client => {
        if (client.userId === userId) return; // Don't send to leaver

        try {
          if (client.ws.readyState === 1) {
            client.ws.send(JSON.stringify(memberLeftEvent));
            sentCount++;
          }
        } catch (error) {
          console.error(`Error sending member_left to ${client.userId}:`, error.message);
        }
      });

      console.log(`Notified ${sentCount} members that ${userId} left lobby ${lobbyId}`);
    } catch (error) {
      console.error('Error broadcasting member left:', error);
    }
  }

  /**
   * Periodic cleanup - remove lobbies with no active subscribers
   */
  async cleanupInactiveLobbies() {
    try {
      const lobbyIds = await this.lobbyManager.getAllLobbyIds();
      let cleanedCount = 0;

      for (const lobbyId of lobbyIds) {
        // Check if lobby has any active subscribers
        const subscribers = this.connectionManager.getLobbyClients(lobbyId);
        
        if (subscribers.length === 0) {
          // No subscribers, remove all members from Redis
          const members = await this.lobbyManager.getLobbyMembers(lobbyId);
          
          for (const member of members) {
            await this.lobbyManager.removeMember(lobbyId, member.userId);
          }
          
          cleanedCount++;
          console.log(`Cleaned up inactive lobby ${lobbyId} (0 subscribers)`);
        }
      }

      if (cleanedCount > 0) {
        console.log(`Periodic cleanup: removed ${cleanedCount} inactive lobbies`);
      }
    } catch (error) {
      console.error('Error cleaning up inactive lobbies:', error);
    }
  }

  /**
   * Handle disconnect - cleanup lobby if user was in one
   */
  async handleDisconnect(userId, lobbyId, username) {
    if (!lobbyId) return;

    try {
      // Remove from Redis
      await this.lobbyManager.removeMember(lobbyId, userId);

      // Notify others
      this.broadcastMemberLeft(lobbyId, userId, username);

      // Broadcast updated roster
      await this.broadcastLobbyRoster(lobbyId);
    } catch (error) {
      console.error('Error handling disconnect cleanup:', error);
    }
  }

  /**
   * Handle lobby game mode change
   */
  async handleChangeMode(data, userId) {
    const { lobbyId, gameMode } = data;

    if (!lobbyId || !gameMode) {
      return { success: false, error: 'Lobby ID and game mode are required' };
    }

    try {
      const client = this.connectionManager.getClient(userId);
      if (!client || client.lobbyId !== lobbyId) {
        return { success: false, error: 'You are not in this lobby' };
      }

      // Update mode in Redis
      await this.lobbyManager.setLobbyMode(lobbyId, gameMode);

      // Broadcast mode change event
      const modeEvent = {
        type: 'lobby_event',
        eventType: 'change_mode',
        lobbyId: lobbyId,
        gameMode: gameMode,
        changedBy: userId,
        changedByName: client.username,
        timestamp: new Date().toISOString()
      };

      const lobbyClients = this.connectionManager.getLobbyClients(lobbyId);
      lobbyClients.forEach(c => {
        try {
          if (c.ws.readyState === 1) {
            c.ws.send(JSON.stringify(modeEvent));
          }
        } catch (error) {
          console.error(`Error sending mode change to ${c.userId}:`, error);
        }
      });

      console.log(`Lobby ${lobbyId} mode changed to ${gameMode} by ${userId}`);
      return { success: true, lobbyId, gameMode };
    } catch (error) {
      console.error('Error handling mode change:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle lobby host change
   */
  async handleChangeHost(data, userId) {
    const { lobbyId, newHostId } = data;

    if (!lobbyId || !newHostId) {
      return { success: false, error: 'Lobby ID and new host ID are required' };
    }

    try {
      const client = this.connectionManager.getClient(userId);
      if (!client || client.lobbyId !== lobbyId) {
        return { success: false, error: 'You are not in this lobby' };
      }

      // Check if new host is in the lobby
      const newHostClient = this.connectionManager.getClient(newHostId);
      if (!newHostClient || newHostClient.lobbyId !== lobbyId) {
        return { success: false, error: 'New host is not in this lobby' };
      }

      // Update host in Redis
      await this.lobbyManager.setLobbyHost(lobbyId, newHostId);

      // Broadcast host change event
      const hostEvent = {
        type: 'lobby_event',
        eventType: 'change_host',
        lobbyId: lobbyId,
        newHostId: newHostId,
        newHostName: newHostClient.username,
        changedBy: userId,
        changedByName: client.username,
        timestamp: new Date().toISOString()
      };

      const lobbyClients = this.connectionManager.getLobbyClients(lobbyId);
      lobbyClients.forEach(c => {
        try {
          if (c.ws.readyState === 1) {
            c.ws.send(JSON.stringify(hostEvent));
          }
        } catch (error) {
          console.error(`Error sending host change to ${c.userId}:`, error);
        }
      });

      console.log(`Lobby ${lobbyId} host changed to ${newHostId} by ${userId}`);
      return { success: true, lobbyId, newHostId };
    } catch (error) {
      console.error('Error handling host change:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = LobbyEventsHandler;
