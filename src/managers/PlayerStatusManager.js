const redis = require('redis');
require('dotenv').config();
/**
 * PlayerStatusManager handles player online status using Redis cache
 */
class PlayerStatusManager {
    constructor() {
        this.redisClient = null;
        this.connectionString = null; // Store for retries
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
                username: process.env.REDIS_USERNAME || 'default',
                password: process.env.REDIS_PASSWORD,
                socket: {
                    host: process.env.REDIS_HOST,
                    port: process.env.REDIS_PORT,
                }
            });

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
            return false;
        }
    }

    /**
     * Check if Redis connection is available
     */
    isRedisAvailable() {
        return this.redisClient && this.redisClient.isOpen;
    }

    /**
     * Set player status
     */
    async setPlayerStatus(userId, status, gameInfo = null) {
        if (!this.isRedisAvailable()) {
            console.warn('Redis not available, skipping status update');
            return false;
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
        if (!this.isRedisAvailable()) {
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
        if (!this.isRedisAvailable() || !Array.isArray(userIds) || userIds.length === 0) {
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
        if (!this.isRedisAvailable()) {
            console.warn('Redis not available, skipping status clear');
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
        if (!this.isRedisAvailable()) {
            console.warn('Redis not available, skipping friend list update');
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
        if (!this.isRedisAvailable()) {
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