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
}

module.exports = LobbyManager;
