const redis = require('redis');

/**
 * PlayerStatusManager handles player online status using Redis cache
 */
class PlayerStatusManager {
  constructor() {
    this.redisClient = null;
    this.REDIS_KEYS = {
      PLAYER_STATUS: 'player:status:',
      PLAYER_FRIENDS: 'player:friends:'
    };
    this.STATUS = {
      ONLINE: 'online',
      OFFLINE: 'offline',
      INGAME: 'ingame'
    };
    this.STATUS_TTL = 300; // 5 minutes TTL for status
  }

  /**
   * Initialize Redis connection
   */
  async initialize() {
    try {
      this.redisClient = redis.createClient({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: process.env.REDIS_DB || 0
      });

      this.redisClient.on('error', (err) => {
        console.error('Redis Client Error:', err);
      });

      this.redisClient.on('connect', () => {
        console.log('Connected to Redis server');
      });

      await this.redisClient.connect();
      return true;
    } catch (error) {
      console.error('Failed to initialize Redis:', error);
      return false;
    }
  }

  /**
   * Set player status
   */
  async setPlayerStatus(userId, status, gameInfo = null) {
    if (!this.redisClient) {
      throw new Error('Redis client not initialized');
    }

    if (!Object.values(this.STATUS).includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    try {
      const statusData = {
        status: status,
        lastSeen: new Date().toISOString(),
        gameInfo: gameInfo
      };

      await this.redisClient.setEx(
        `${this.REDIS_KEYS.PLAYER_STATUS}${userId}`,
        this.STATUS_TTL,
        JSON.stringify(statusData)
      );

      console.log(`Player ${userId} status set to: ${status}`);
      return true;
    } catch (error) {
      console.error('Error setting player status:', error);
      return false;
    }
  }

  /**
   * Get player status
   */
  async getPlayerStatus(userId) {
    if (!this.redisClient) {
      return { status: this.STATUS.OFFLINE, lastSeen: null, gameInfo: null };
    }

    try {
      const statusData = await this.redisClient.get(`${this.REDIS_KEYS.PLAYER_STATUS}${userId}`);
      
      if (!statusData) {
        return { status: this.STATUS.OFFLINE, lastSeen: null, gameInfo: null };
      }

      return JSON.parse(statusData);
    } catch (error) {
      console.error('Error getting player status:', error);
      return { status: this.STATUS.OFFLINE, lastSeen: null, gameInfo: null };
    }
  }

  /**
   * Get multiple players status
   */
  async getMultiplePlayerStatus(userIds) {
    if (!this.redisClient || !Array.isArray(userIds) || userIds.length === 0) {
      return {};
    }

    try {
      const keys = userIds.map(userId => `${this.REDIS_KEYS.PLAYER_STATUS}${userId}`);
      const statusDataList = await this.redisClient.mGet(keys);
      
      const result = {};
      userIds.forEach((userId, index) => {
        const statusData = statusDataList[index];
        if (statusData) {
          try {
            result[userId] = JSON.parse(statusData);
          } catch (parseError) {
            console.error(`Error parsing status for user ${userId}:`, parseError);
            result[userId] = { status: this.STATUS.OFFLINE, lastSeen: null, gameInfo: null };
          }
        } else {
          result[userId] = { status: this.STATUS.OFFLINE, lastSeen: null, gameInfo: null };
        }
      });

      return result;
    } catch (error) {
      console.error('Error getting multiple player status:', error);
      return {};
    }
  }

  /**
   * Clear player status (set to offline)
   */
  async clearPlayerStatus(userId) {
    if (!this.redisClient) {
      return false;
    }

    try {
      await this.redisClient.del(`${this.REDIS_KEYS.PLAYER_STATUS}${userId}`);
      console.log(`Player ${userId} status cleared`);
      return true;
    } catch (error) {
      console.error('Error clearing player status:', error);
      return false;
    }
  }

  /**
   * Set player's friend list in cache
   */
  async setPlayerFriends(userId, friendIds) {
    if (!this.redisClient) {
      return false;
    }

    try {
      await this.redisClient.setEx(
        `${this.REDIS_KEYS.PLAYER_FRIENDS}${userId}`,
        86400, // 24 hours TTL for friend list
        JSON.stringify(friendIds)
      );

      return true;
    } catch (error) {
      console.error('Error setting player friends:', error);
      return false;
    }
  }

  /**
   * Get player's friend list from cache
   */
  async getPlayerFriends(userId) {
    if (!this.redisClient) {
      return [];
    }

    try {
      const friendsData = await this.redisClient.get(`${this.REDIS_KEYS.PLAYER_FRIENDS}${userId}`);
      
      if (!friendsData) {
        return [];
      }

      return JSON.parse(friendsData);
    } catch (error) {
      console.error('Error getting player friends:', error);
      return [];
    }
  }

  /**
   * Get friend list with their online status
   */
  async getFriendListWithStatus(userId) {
    try {
      const friendIds = await this.getPlayerFriends(userId);
      
      if (friendIds.length === 0) {
        return [];
      }

      const friendStatusMap = await this.getMultiplePlayerStatus(friendIds);
      
      const friendList = friendIds.map(friendId => ({
        userId: friendId,
        ...friendStatusMap[friendId]
      }));

      return friendList;
    } catch (error) {
      console.error('Error getting friend list with status:', error);
      return [];
    }
  }

  /**
   * Close Redis connection
   */
  async close() {
    if (this.redisClient) {
      await this.redisClient.disconnect();
      console.log('Redis connection closed');
    }
  }

  /**
   * Check if Redis is connected
   */
  isConnected() {
    return this.redisClient && this.redisClient.isOpen;
  }
}

module.exports = PlayerStatusManager;