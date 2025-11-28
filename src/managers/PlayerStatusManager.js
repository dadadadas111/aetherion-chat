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
   * Parse Redis connection string
   */
  parseRedisConnection(connectionString) {
    if (!connectionString) {
      return {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: process.env.REDIS_DB || 0
      };
    }

    // Parse connection string format: host:port,password=xxx,ssl=True,abortConnect=False
    const parts = connectionString.split(',');
    const hostPort = parts[0].split(':');
    
    const config = {
      host: hostPort[0],
      port: parseInt(hostPort[1]) || 6379,
      db: process.env.REDIS_DB || 0
    };

    // Parse additional parameters
    for (let i = 1; i < parts.length; i++) {
      const param = parts[i].split('=');
      const key = param[0].toLowerCase();
      const value = param[1];

      switch (key) {
        case 'password':
          config.password = value;
          break;
        case 'ssl':
          config.socket = config.socket || {};
          config.socket.tls = value.toLowerCase() === 'true';
          break;
        case 'abortconnect':
          config.socket = config.socket || {};
          config.socket.connectTimeout = value.toLowerCase() === 'false' ? 10000 : 5000;
          break;
      }
    }

    return config;
  }

  /**
   * Initialize Redis connection
   */
  async initialize() {
    try {
      const connectionString = process.env.REDIS_CONNECTION;
      const config = this.parseRedisConnection(connectionString);

      console.log('Connecting to Redis with config:', {
        host: config.host,
        port: config.port,
        ssl: config.socket?.tls || false,
        db: config.db
      });

      this.redisClient = redis.createClient(config);

      this.redisClient.on('error', (err) => {
        console.error('Redis Client Error:', err);
      });

      this.redisClient.on('connect', () => {
        console.log('Connected to Redis server');
      });

      this.redisClient.on('reconnecting', () => {
        console.log('Reconnecting to Redis server...');
      });

      this.redisClient.on('ready', () => {
        console.log('Redis client ready');
      });

      await this.redisClient.connect();
      
      // Test the connection
      await this.redisClient.ping();
      console.log('Redis connection test successful');
      
      return true;
    } catch (error) {
      console.error('Failed to initialize Redis:', error);
      
      // Try to reconnect after a delay
      setTimeout(() => {
        console.log('Attempting to reconnect to Redis...');
        this.initialize().catch(err => {
          console.error('Redis reconnection failed:', err);
        });
      }, 5000);
      
      return false;
    }
  }

  /**
   * Ensure Redis connection is available
   */
  async ensureConnection() {
    if (!this.redisClient || !this.redisClient.isOpen) {
      console.log('Redis connection not available, attempting to reconnect...');
      return await this.initialize();
    }
    return true;
  }

  /**
   * Set player status
   */
  async setPlayerStatus(userId, status, gameInfo = null) {
    if (!(await this.ensureConnection())) {
      throw new Error('Redis connection not available');
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
    if (!(await this.ensureConnection())) {
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
    if (!(await this.ensureConnection()) || !Array.isArray(userIds) || userIds.length === 0) {
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
    if (!(await this.ensureConnection())) {
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
    if (!(await this.ensureConnection())) {
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
    if (!(await this.ensureConnection())) {
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