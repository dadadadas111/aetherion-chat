/**
 * LobbyManager - Manages lobby state in Redis cache
 * Single source of truth for all lobby data
 */
class LobbyManager {
  constructor(redisClient) {
    this.redisClient = redisClient;
    
    this.REDIS_KEYS = {
      LOBBY: 'lobby:',           // lobby:{lobbyId} -> lobby data
      LOBBY_MEMBERS: 'lobby:members:'  // lobby:members:{lobbyId} -> Set of userIds
    };
    
    this.LOBBY_TTL = 3600; // 1 hour
  }

  /**
   * Check if Redis is available
   */
  isRedisAvailable() {
    return this.redisClient && this.redisClient.isOpen;
  }

  /**
   * Add member to lobby
   */
  async addMember(lobbyId, userId, username, characterId = null) {
    if (!this.isRedisAvailable()) {
      console.warn('Redis not available');
      return false;
    }

    try {
      const memberKey = `${this.REDIS_KEYS.LOBBY_MEMBERS}${lobbyId}`;
      
      // Add user to lobby members set
      await this.redisClient.sAdd(memberKey, userId);
      
      // Set TTL on members set
      await this.redisClient.expire(memberKey, this.LOBBY_TTL);
      
      // Store member info
      const memberData = {
        userId,
        username,
        characterId,
        joinedAt: new Date().toISOString()
      };
      
      await this.redisClient.hSet(
        `${this.REDIS_KEYS.LOBBY}${lobbyId}`,
        userId,
        JSON.stringify(memberData)
      );
      
      // Set TTL on lobby data
      await this.redisClient.expire(`${this.REDIS_KEYS.LOBBY}${lobbyId}`, this.LOBBY_TTL);
      
      console.log(`Added ${userId} (${username}) to lobby ${lobbyId}`);
      return true;
    } catch (error) {
      console.error('Error adding member to lobby:', error);
      return false;
    }
  }

  /**
   * Remove member from lobby
   */
  async removeMember(lobbyId, userId) {
    if (!this.isRedisAvailable()) {
      return false;
    }

    try {
      const memberKey = `${this.REDIS_KEYS.LOBBY_MEMBERS}${lobbyId}`;
      const lobbyKey = `${this.REDIS_KEYS.LOBBY}${lobbyId}`;
      
      // Remove from members set
      await this.redisClient.sRem(memberKey, userId);
      
      // Remove member data
      await this.redisClient.hDel(lobbyKey, userId);
      
      console.log(`Removed ${userId} from lobby ${lobbyId}`);
      
      // Check if lobby is now empty and clean up
      const remainingMembers = await this.redisClient.sCard(memberKey);
      
      if (remainingMembers === 0) {
        await this.redisClient.del(memberKey);
        await this.redisClient.del(lobbyKey);
        console.log(`Cleaned up empty lobby ${lobbyId}`);
      }
      
      return true;
    } catch (error) {
      console.error('Error removing member from lobby:', error);
      return false;
    }
  }

  /**
   * Update member's character
   */
  async updateMemberCharacter(lobbyId, userId, characterId) {
    if (!this.isRedisAvailable()) {
      return false;
    }

    try {
      // Get current member data
      const memberJson = await this.redisClient.hGet(`${this.REDIS_KEYS.LOBBY}${lobbyId}`, userId);
      
      if (!memberJson) {
        console.warn(`Member ${userId} not found in lobby ${lobbyId}`);
        return false;
      }

      const memberData = JSON.parse(memberJson);
      memberData.characterId = characterId;
      memberData.updatedAt = new Date().toISOString();
      
      // Update member data
      await this.redisClient.hSet(
        `${this.REDIS_KEYS.LOBBY}${lobbyId}`,
        userId,
        JSON.stringify(memberData)
      );
      
      console.log(`Updated ${userId} character to ${characterId} in lobby ${lobbyId}`);
      return true;
    } catch (error) {
      console.error('Error updating member character:', error);
      return false;
    }
  }

  /**
   * Get all members in a lobby
   */
  async getLobbyMembers(lobbyId) {
    if (!this.isRedisAvailable()) {
      return [];
    }

    try {
      // Get all member data
      const membersData = await this.redisClient.hGetAll(`${this.REDIS_KEYS.LOBBY}${lobbyId}`);
      
      if (!membersData || Object.keys(membersData).length === 0) {
        return [];
      }

      // Parse member data
      const members = Object.values(membersData).map(json => {
        try {
          return JSON.parse(json);
        } catch (error) {
          console.error('Error parsing member data:', error);
          return null;
        }
      }).filter(m => m !== null);

      return members;
    } catch (error) {
      console.error('Error getting lobby members:', error);
      return [];
    }
  }

  /**
   * Get member IDs in a lobby
   */
  async getLobbyMemberIds(lobbyId) {
    if (!this.isRedisAvailable()) {
      return [];
    }

    try {
      const memberIds = await this.redisClient.sMembers(`${this.REDIS_KEYS.LOBBY_MEMBERS}${lobbyId}`);
      return memberIds || [];
    } catch (error) {
      console.error('Error getting lobby member IDs:', error);
      return [];
    }
  }

  /**
   * Check if user is in lobby
   */
  async isUserInLobby(lobbyId, userId) {
    if (!this.isRedisAvailable()) {
      return false;
    }

    try {
      const isMember = await this.redisClient.sIsMember(`${this.REDIS_KEYS.LOBBY_MEMBERS}${lobbyId}`, userId);
      return isMember;
    } catch (error) {
      console.error('Error checking lobby membership:', error);
      return false;
    }
  }

  /**
   * Get all active lobby IDs
   */
  async getAllLobbyIds() {
    if (!this.isRedisAvailable()) {
      return [];
    }

    try {
      const keys = await this.redisClient.keys(`${this.REDIS_KEYS.LOBBY_MEMBERS}*`);
      const lobbyIds = keys.map(key => key.replace(this.REDIS_KEYS.LOBBY_MEMBERS, ''));
      return lobbyIds;
    } catch (error) {
      console.error('Error getting lobby IDs:', error);
      return [];
    }
  }

  /**
   * Clean up empty lobbies
   */
  async cleanupEmptyLobbies() {
    if (!this.isRedisAvailable()) {
      return;
    }

    try {
      const lobbyIds = await this.getAllLobbyIds();
      
      for (const lobbyId of lobbyIds) {
        const memberIds = await this.getLobbyMemberIds(lobbyId);
        
        if (memberIds.length === 0) {
          // Delete empty lobby
          await this.redisClient.del(`${this.REDIS_KEYS.LOBBY}${lobbyId}`);
          await this.redisClient.del(`${this.REDIS_KEYS.LOBBY_MEMBERS}${lobbyId}`);
          await this.redisClient.del(`lobby:settings:${lobbyId}`);
          console.log(`Cleaned up empty lobby ${lobbyId}`);
        }
      }
    } catch (error) {
      console.error('Error cleaning up lobbies:', error);
    }
  }

  /**
   * Set lobby game mode
   */
  async setLobbyMode(lobbyId, gameMode) {
    if (!this.isRedisAvailable()) {
      return false;
    }

    try {
      await this.redisClient.hSet(`lobby:settings:${lobbyId}`, 'gameMode', gameMode);
      await this.redisClient.expire(`lobby:settings:${lobbyId}`, this.LOBBY_TTL);
      console.log(`Set lobby ${lobbyId} mode to ${gameMode}`);
      return true;
    } catch (error) {
      console.error('Error setting lobby mode:', error);
      return false;
    }
  }

  /**
   * Set lobby host
   */
  async setLobbyHost(lobbyId, hostId) {
    if (!this.isRedisAvailable()) {
      return false;
    }

    try {
      await this.redisClient.hSet(`lobby:settings:${lobbyId}`, 'hostId', hostId);
      await this.redisClient.expire(`lobby:settings:${lobbyId}`, this.LOBBY_TTL);
      console.log(`Set lobby ${lobbyId} host to ${hostId}`);
      return true;
    } catch (error) {
      console.error('Error setting lobby host:', error);
      return false;
    }
  }

  /**
   * Get lobby settings
   */
  async getLobbySettings(lobbyId) {
    if (!this.isRedisAvailable()) {
      return null;
    }

    try {
      const settings = await this.redisClient.hGetAll(`lobby:settings:${lobbyId}`);
      return settings || {};
    } catch (error) {
      console.error('Error getting lobby settings:', error);
      return null;
    }
  }

  /**
   * Set lobby queue status
   */
  async setLobbyQueueStatus(lobbyId, isQueuing, gameMode = null) {
    if (!this.isRedisAvailable()) {
      return false;
    }

    try {
      await this.redisClient.hSet(`lobby:settings:${lobbyId}`, 'isQueuing', isQueuing ? '1' : '0');
      if (gameMode) {
        await this.redisClient.hSet(`lobby:settings:${lobbyId}`, 'queueGameMode', gameMode);
      }
      await this.redisClient.expire(`lobby:settings:${lobbyId}`, this.LOBBY_TTL);
      console.log(`Set lobby ${lobbyId} queue status to ${isQueuing}${gameMode ? ` (${gameMode})` : ''}`);
      return true;
    } catch (error) {
      console.error('Error setting lobby queue status:', error);
      return false;
    }
  }

  /**
   * Initialize custom mode team structure for lobby
   */
  async initializeCustomTeams(lobbyId, hostId, hostUsername) {
    if (!this.isRedisAvailable()) {
      return false;
    }

    try {
      const teams = {
        0: {
          slots: [
            { slotIndex: 0, userId: hostId, username: hostUsername },
            { slotIndex: 1, userId: null, username: null },
            { slotIndex: 2, userId: null, username: null }
          ]
        },
        1: {
          slots: [
            { slotIndex: 0, userId: null, username: null },
            { slotIndex: 1, userId: null, username: null },
            { slotIndex: 2, userId: null, username: null }
          ]
        }
      };

      await this.redisClient.hSet(
        `lobby:custom:${lobbyId}`,
        'teams',
        JSON.stringify(teams)
      );
      await this.redisClient.expire(`lobby:custom:${lobbyId}`, this.LOBBY_TTL);
      
      console.log(`Initialized custom teams for lobby ${lobbyId}`);
      return true;
    } catch (error) {
      console.error('Error initializing custom teams:', error);
      return false;
    }
  }

  /**
   * Get custom mode team structure
   */
  async getCustomTeams(lobbyId) {
    if (!this.isRedisAvailable()) {
      return null;
    }

    try {
      const teamsJson = await this.redisClient.hGet(`lobby:custom:${lobbyId}`, 'teams');
      if (!teamsJson) {
        return null;
      }
      return JSON.parse(teamsJson);
    } catch (error) {
      console.error('Error getting custom teams:', error);
      return null;
    }
  }

  /**
   * Set custom mode team structure
   */
  async setCustomTeams(lobbyId, teams) {
    if (!this.isRedisAvailable()) {
      return false;
    }

    try {
      await this.redisClient.hSet(
        `lobby:custom:${lobbyId}`,
        'teams',
        JSON.stringify(teams)
      );
      await this.redisClient.expire(`lobby:custom:${lobbyId}`, this.LOBBY_TTL);
      return true;
    } catch (error) {
      console.error('Error setting custom teams:', error);
      return false;
    }
  }

  /**
   * Add player to custom mode team
   */
  async addPlayerToCustomTeam(lobbyId, userId, username, teamIndex = null) {
    if (!this.isRedisAvailable()) {
      return { success: false, error: 'Redis not available' };
    }

    try {
      let teams = await this.getCustomTeams(lobbyId);
      
      if (!teams) {
        return { success: false, error: 'Custom teams not initialized' };
      }

      // If no team specified, find first available slot
      if (teamIndex === null) {
        // Try team 0 first, then team 1
        for (let t = 0; t <= 1; t++) {
          const emptySlot = teams[t].slots.find(slot => slot.userId === null);
          if (emptySlot) {
            emptySlot.userId = userId;
            emptySlot.username = username;
            await this.setCustomTeams(lobbyId, teams);
            return { success: true, teamIndex: t, slotIndex: emptySlot.slotIndex };
          }
        }
        return { success: false, error: 'Lobby is full (6/6 players)' };
      }

      // Add to specific team
      if (teamIndex !== 0 && teamIndex !== 1) {
        return { success: false, error: 'Invalid team index' };
      }

      const team = teams[teamIndex];
      const emptySlot = team.slots.find(slot => slot.userId === null);
      
      if (!emptySlot) {
        return { success: false, error: `Team ${teamIndex} is full` };
      }

      emptySlot.userId = userId;
      emptySlot.username = username;
      
      await this.setCustomTeams(lobbyId, teams);
      
      return { success: true, teamIndex, slotIndex: emptySlot.slotIndex };
    } catch (error) {
      console.error('Error adding player to custom team:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Remove player from custom mode team
   */
  async removePlayerFromCustomTeam(lobbyId, userId) {
    if (!this.isRedisAvailable()) {
      return false;
    }

    try {
      const teams = await this.getCustomTeams(lobbyId);
      
      if (!teams) {
        return false;
      }

      // Find and remove player from teams
      for (let teamIndex = 0; teamIndex <= 1; teamIndex++) {
        const team = teams[teamIndex];
        const slot = team.slots.find(s => s.userId === userId);
        
        if (slot) {
          slot.userId = null;
          slot.username = null;
          await this.setCustomTeams(lobbyId, teams);
          console.log(`Removed ${userId} from team ${teamIndex} in lobby ${lobbyId}`);
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('Error removing player from custom team:', error);
      return false;
    }
  }

  /**
   * Get player's team assignment in custom mode
   */
  async getPlayerTeamAssignment(lobbyId, userId) {
    if (!this.isRedisAvailable()) {
      return null;
    }

    try {
      const teams = await this.getCustomTeams(lobbyId);
      
      if (!teams) {
        return null;
      }

      for (let teamIndex = 0; teamIndex <= 1; teamIndex++) {
        const team = teams[teamIndex];
        const slot = team.slots.find(s => s.userId === userId);
        
        if (slot) {
          return { teamIndex, slotIndex: slot.slotIndex };
        }
      }

      return null;
    } catch (error) {
      console.error('Error getting player team assignment:', error);
      return null;
    }
  }

  /**
   * Swap player to opposite team in custom mode
   */
  async swapPlayerTeam(lobbyId, userId) {
    if (!this.isRedisAvailable()) {
      return { success: false, error: 'Redis not available' };
    }

    try {
      const teams = await this.getCustomTeams(lobbyId);
      
      if (!teams) {
        return { success: false, error: 'Custom teams not initialized' };
      }

      // Find player's current team
      let currentTeam = null;
      let currentSlot = null;
      
      for (let teamIndex = 0; teamIndex <= 1; teamIndex++) {
        const team = teams[teamIndex];
        const slot = team.slots.find(s => s.userId === userId);
        
        if (slot) {
          currentTeam = teamIndex;
          currentSlot = slot;
          break;
        }
      }

      if (currentTeam === null) {
        return { success: false, error: 'Player not found in any team' };
      }

      // Find opposite team
      const targetTeam = currentTeam === 0 ? 1 : 0;
      const targetTeamData = teams[targetTeam];
      
      // Find empty slot in target team
      const emptySlot = targetTeamData.slots.find(slot => slot.userId === null);
      
      if (!emptySlot) {
        return { success: false, error: 'TEAM_FULL', message: 'Target team is full' };
      }

      // Move player
      const username = currentSlot.username;
      currentSlot.userId = null;
      currentSlot.username = null;
      
      emptySlot.userId = userId;
      emptySlot.username = username;
      
      await this.setCustomTeams(lobbyId, teams);
      
      return { 
        success: true, 
        fromTeam: currentTeam, 
        toTeam: targetTeam,
        slotIndex: emptySlot.slotIndex
      };
    } catch (error) {
      console.error('Error swapping player team:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get custom lobby roster in client-friendly format
   */
  async getCustomRoster(lobbyId, hostId) {
    if (!this.isRedisAvailable()) {
      return [];
    }

    try {
      const teams = await this.getCustomTeams(lobbyId);
      
      if (!teams) {
        return [];
      }

      const roster = [];
      
      for (let teamIndex = 0; teamIndex <= 1; teamIndex++) {
        const team = teams[teamIndex];
        
        for (const slot of team.slots) {
          if (slot.userId) {
            roster.push({
              userId: slot.userId,
              username: slot.username,
              teamIndex: teamIndex,
              slotIndex: slot.slotIndex,
              isHost: slot.userId === hostId
            });
          }
        }
      }

      return roster;
    } catch (error) {
      console.error('Error getting custom roster:', error);
      return [];
    }
  }

  /**
   * Clear custom mode data (when switching back to casual/ranked)
   */
  async clearCustomMode(lobbyId) {
    if (!this.isRedisAvailable()) {
      return false;
    }

    try {
      await this.redisClient.del(`lobby:custom:${lobbyId}`);
      console.log(`Cleared custom mode data for lobby ${lobbyId}`);
      return true;
    } catch (error) {
      console.error('Error clearing custom mode:', error);
      return false;
    }
  }
}

module.exports = LobbyManager;
