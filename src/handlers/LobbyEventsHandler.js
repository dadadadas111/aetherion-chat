/**
 * LobbyEventsHandler - Handles lobby events with Redis as source of truth
 * All lobby state stored in Redis, broadcasts sync'd data to members
 */
class LobbyEventsHandler {
  constructor(connectionManager, lobbyManager, playerStatusManager = null, customModeHandler = null) {
    this.connectionManager = connectionManager;
    this.lobbyManager = lobbyManager;
    this.playerStatusManager = playerStatusManager;
    this.customModeHandler = customModeHandler;
    
    // Track retry timers for each lobby to ensure eventual consistency
    this.rosterRetryTimers = new Map(); // lobbyId -> [timer1, timer2, ...]
  }

  /**
   * Set custom mode handler (for dependency injection after initialization)
   */
  setCustomModeHandler(customModeHandler) {
    this.customModeHandler = customModeHandler;
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

        // Broadcast updated roster to old lobby with retry mechanism
        await this.scheduleRosterRetries(oldLobbyId);
      }

      // Update connection manager FIRST (before Redis)
      // This prevents race condition where broadcastLobbyRoster might remove
      // a user that's in Redis but not yet subscribed
      this.connectionManager.subscribeToLobby(userId, lobbyId);

      // Check if lobby is in custom mode
      const settings = await this.lobbyManager.getLobbySettings(lobbyId);
      const isCustomMode = settings && settings.gameMode === 'Custom';

      if (isCustomMode) {
        // Add to custom mode team structure
        const addResult = await this.lobbyManager.addPlayerToCustomTeam(lobbyId, userId, client.username);
        
        if (!addResult.success) {
          // If custom teams full or error, send error response
          return { success: false, error: addResult.error };
        }

        // Also add to regular lobby members for tracking
        await this.lobbyManager.addMember(
          lobbyId,
          userId,
          client.username,
          client.characterId
        );

        // Broadcast custom roster
        if (this.customModeHandler) {
          await this.customModeHandler.broadcastCustomRoster(lobbyId);
        }
      } else {
        // Regular mode - add to lobby normally
        await this.lobbyManager.addMember(
          lobbyId,
          userId,
          client.username,
          client.characterId
        );

        // Broadcast updated roster to new lobby members with retry mechanism
        await this.scheduleRosterRetries(lobbyId);
      }

      // Send current lobby settings to the new joiner after a short delay
      // Send current lobby settings to the new joiner immediately (non-blocking)
      (async () => {
        try {
          const settings = await this.lobbyManager.getLobbySettings(lobbyId);

          if (settings && Object.keys(settings).length > 0) {
            const joinerClient = this.connectionManager.getClient(userId);

            if (joinerClient && joinerClient.ws.readyState === 1) {
              // Send current game mode if set
              if (settings.gameMode) {
                const modeEvent = {
                  type: 'lobby_event',
                  eventType: 'change_mode',
                  lobbyId: lobbyId,
                  gameMode: settings.gameMode,
                  timestamp: new Date().toISOString()
                };
                joinerClient.ws.send(JSON.stringify(modeEvent));
                console.log(`Sent current mode ${settings.gameMode} to new joiner ${userId}`);
              }

              // Send current host if set
              if (settings.hostId) {
                const hostClient = this.connectionManager.getClient(settings.hostId);
                const hostEvent = {
                  type: 'lobby_event',
                  eventType: 'host_changed',
                  lobbyId: lobbyId,
                  newHostId: settings.hostId,
                  newHostName: hostClient?.username || settings.hostId,
                  timestamp: new Date().toISOString()
                };
                joinerClient.ws.send(JSON.stringify(hostEvent));
                console.log(`Sent current host ${settings.hostId} to new joiner ${userId}`);
              }

              // Send queue status if queuing
              if (settings.isQueuing === '1') {
                const queueEvent = {
                  type: 'lobby_event',
                  eventType: 'start_queue',
                  lobbyId: lobbyId,
                  gameMode: settings.queueGameMode || settings.gameMode,
                  timestamp: new Date().toISOString()
                };
                joinerClient.ws.send(JSON.stringify(queueEvent));
                console.log(`Sent queue status to new joiner ${userId}`);
              }
            }
          }
        } catch (error) {
          console.error('Error sending lobby settings to new joiner:', error);
        }
      })();

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

      // Check if lobby is in custom mode
      const settings = await this.lobbyManager.getLobbySettings(lobbyId);
      const isCustomMode = settings && settings.gameMode === 'Custom';

      if (isCustomMode) {
        // Remove from custom team structure
        await this.lobbyManager.removePlayerFromCustomTeam(lobbyId, userId);
      }

      // Remove from Redis
      await this.lobbyManager.removeMember(lobbyId, userId);

      // Notify others that member left
      this.broadcastMemberLeft(lobbyId, userId, username);

      if (isCustomMode && this.customModeHandler) {
        // Broadcast updated custom roster
        await this.customModeHandler.broadcastCustomRoster(lobbyId);
      } else {
        // Broadcast updated roster to remaining members with retry mechanism
        await this.scheduleRosterRetries(lobbyId);
      }

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

      // Broadcast updated roster with retry mechanism
      await this.scheduleRosterRetries(lobbyId);

      return true;
    } catch (error) {
      console.error('Error handling character change:', error);
      return false;
    }
  }

  /**
   * Handle avatar change in lobby
   * Just broadcasts notification - client will refresh avatar on their end
   */
  async handleAvatarChange(data, userId) {
    const { lobbyId } = data;

    if (!lobbyId) {
      return { success: false, error: 'Lobby ID is required' };
    }

    try {
      const client = this.connectionManager.getClient(userId);
      if (!client || client.lobbyId !== lobbyId) {
        return { success: false, error: 'You are not in this lobby' };
      }

      // Check if lobby is in custom mode
      const settings = await this.lobbyManager.getLobbySettings(lobbyId);
      const isCustomMode = settings && settings.gameMode === 'Custom';

      // If custom mode, refresh the roster first so clients receive roster before avatar notification
      if (isCustomMode && this.customModeHandler) {
        await this.customModeHandler.broadcastCustomRoster(lobbyId);
      }

      // Broadcast avatar change event
      const avatarEvent = {
        type: 'lobby_event',
        eventType: 'avatar_changed',
        lobbyId: lobbyId,
        userId: userId,
        username: client.username,
        timestamp: new Date().toISOString()
      };

      const payload = JSON.stringify(avatarEvent);
      const lobbyClients = this.connectionManager.getLobbyClients(lobbyId);
      let sentCount = 0;

      lobbyClients.forEach(c => {
        try {
          if (c.ws.readyState === 1) {
            c.ws.send(payload);
            sentCount++;
          }
        } catch (error) {
          console.error(`Error sending avatar change to ${c.userId}:`, error);
        }
      });

      console.log(`Notified ${sentCount} members that ${userId} changed avatar in lobby ${lobbyId}`);
      return { success: true, lobbyId, notified: sentCount };
    } catch (error) {
      console.error('Error handling avatar change:', error);
      return { success: false, error: error.message };
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

      // Sync: Only ADD missing subscribers to Redis
      // Don't remove during broadcast (too aggressive, causes race conditions)
      // Removal happens via explicit leave/disconnect/periodic cleanup
      for (const client of lobbyClients) {
        if (!redisMemberIds.has(client.userId)) {
          // Check if player is actually online before adding back
          let isOnline = true;
          if (this.playerStatusManager) {
            try {
              const status = await this.playerStatusManager.getPlayerStatus(client.userId);
              isOnline = status && status.status !== 'offline';
            } catch (err) {
              console.warn(`Could not verify status for ${client.userId}, assuming online`);
            }
          }
          
          if (isOnline) {
            console.log(`Sync: Adding ${client.userId} to Redis (subscribed but missing)`);
            await this.lobbyManager.addMember(lobbyId, client.userId, client.username, client.characterId);
          } else {
            console.log(`Sync: Skipping ${client.userId} - player is offline`);
          }
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

      const payload = JSON.stringify(rosterEvent);
      lobbyClients.forEach(client => {
        try {
          if (client.ws.readyState === 1) {
            client.ws.send(payload);
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
      const payload = JSON.stringify(memberLeftEvent);
      let sentCount = 0;

      lobbyClients.forEach(client => {
        if (client.userId === userId) return; // Don't send to leaver

        try {
          if (client.ws.readyState === 1) {
            client.ws.send(payload);
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
      // Check if lobby is in custom mode
      const settings = await this.lobbyManager.getLobbySettings(lobbyId);
      const isCustomMode = settings && settings.gameMode === 'Custom';

      if (isCustomMode) {
        // Remove from custom team structure
        await this.lobbyManager.removePlayerFromCustomTeam(lobbyId, userId);
      }

      // Remove from Redis
      await this.lobbyManager.removeMember(lobbyId, userId);

      // Notify others
      this.broadcastMemberLeft(lobbyId, userId, username);

      if (isCustomMode && this.customModeHandler) {
        // Broadcast updated custom roster
        await this.customModeHandler.broadcastCustomRoster(lobbyId);
      } else {
        // Broadcast updated roster with retry mechanism
        await this.scheduleRosterRetries(lobbyId);
      }
    } catch (error) {
      console.error('Error handling disconnect cleanup:', error);
    }
  }

  /**
   * Schedule roster retries for eventual consistency
   * Broadcasts immediately, then retries 4 more times with 2-second delays
   */
  async scheduleRosterRetries(lobbyId, retries = 5, delayMs = 2000) {
    // Clear any existing retry timers for this lobby
    this.clearRosterRetries(lobbyId);

    // Broadcast immediately (first broadcast)
    await this.broadcastLobbyRoster(lobbyId);

    // Schedule additional retries
    const timers = [];
    for (let i = 1; i < retries; i++) {
      const timer = setTimeout(async () => {
        try {
          await this.broadcastLobbyRoster(lobbyId);
          console.log(`Roster retry ${i}/${retries - 1} for lobby ${lobbyId}`);
        } catch (error) {
          console.error(`Error in roster retry ${i} for lobby ${lobbyId}:`, error);
        }
      }, delayMs * i);
      
      timers.push(timer);
    }

    // Store timers for this lobby
    this.rosterRetryTimers.set(lobbyId, timers);

    // Clear timers after all retries complete
    setTimeout(() => {
      this.clearRosterRetries(lobbyId);
    }, delayMs * retries);
  }

  /**
   * Clear pending roster retry timers for a lobby
   */
  clearRosterRetries(lobbyId) {
    const timers = this.rosterRetryTimers.get(lobbyId);
    if (timers) {
      timers.forEach(timer => clearTimeout(timer));
      this.rosterRetryTimers.delete(lobbyId);
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

      // Get current mode
      const settings = await this.lobbyManager.getLobbySettings(lobbyId);
      const oldMode = settings?.gameMode || 'Casual';

      // Update mode in Redis
      await this.lobbyManager.setLobbyMode(lobbyId, gameMode);

      // If switching TO custom mode, initialize team structure
      if (gameMode === 'Custom' && oldMode !== 'Custom') {
        await this.lobbyManager.initializeCustomTeams(lobbyId, userId, client.username);
        // Ensure lobby host is recorded so roster broadcasts can mark `isHost`
        await this.lobbyManager.setLobbyHost(lobbyId, userId);
        
        // Add all existing lobby members to custom teams
        const members = await this.lobbyManager.getLobbyMembers(lobbyId);
        for (const member of members) {
          if (member.userId !== userId) {
            await this.lobbyManager.addPlayerToCustomTeam(lobbyId, member.userId, member.username);
          }
        }
        
        // Broadcast custom roster
        if (this.customModeHandler) {
          await this.customModeHandler.broadcastCustomRoster(lobbyId);
        }
      }

      // If switching FROM custom mode, clear custom data
      if (oldMode === 'Custom' && gameMode !== 'Custom') {
        await this.lobbyManager.clearCustomMode(lobbyId);
      }

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

  /**
   * Handle lobby start queue
   */
  async handleStartQueue(data, userId) {
    const { lobbyId, gameMode } = data;

    if (!lobbyId || !gameMode) {
      return { success: false, error: 'Lobby ID and game mode are required' };
    }

    try {
      const client = this.connectionManager.getClient(userId);
      if (!client || client.lobbyId !== lobbyId) {
        return { success: false, error: 'You are not in this lobby' };
      }

      // Update queue status in Redis
      await this.lobbyManager.setLobbyQueueStatus(lobbyId, true, gameMode);

      // Broadcast start queue event
      const queueEvent = {
        type: 'lobby_event',
        eventType: 'start_queue',
        lobbyId: lobbyId,
        gameMode: gameMode,
        startedBy: userId,
        startedByName: client.username,
        timestamp: new Date().toISOString()
      };

      const lobbyClients = this.connectionManager.getLobbyClients(lobbyId);
      lobbyClients.forEach(c => {
        try {
          if (c.ws.readyState === 1) {
            c.ws.send(JSON.stringify(queueEvent));
          }
        } catch (error) {
          console.error(`Error sending start queue to ${c.userId}:`, error);
        }
      });

      console.log(`Lobby ${lobbyId} started queue for ${gameMode} by ${userId}`);
      return { success: true, lobbyId, gameMode };
    } catch (error) {
      console.error('Error handling start queue:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle lobby stop queue
   */
  async handleStopQueue(data, userId) {
    const { lobbyId } = data;

    if (!lobbyId) {
      return { success: false, error: 'Lobby ID is required' };
    }

    try {
      const client = this.connectionManager.getClient(userId);
      if (!client || client.lobbyId !== lobbyId) {
        return { success: false, error: 'You are not in this lobby' };
      }

      // Update queue status in Redis
      await this.lobbyManager.setLobbyQueueStatus(lobbyId, false);

      // Broadcast stop queue event
      const queueEvent = {
        type: 'lobby_event',
        eventType: 'stop_queue',
        lobbyId: lobbyId,
        stoppedBy: userId,
        stoppedByName: client.username,
        timestamp: new Date().toISOString()
      };

      const lobbyClients = this.connectionManager.getLobbyClients(lobbyId);
      lobbyClients.forEach(c => {
        try {
          if (c.ws.readyState === 1) {
            c.ws.send(JSON.stringify(queueEvent));
          }
        } catch (error) {
          console.error(`Error sending stop queue to ${c.userId}:`, error);
        }
      });

      console.log(`Lobby ${lobbyId} stopped queue by ${userId}`);
      return { success: true, lobbyId };
    } catch (error) {
      console.error('Error handling stop queue:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = LobbyEventsHandler;
