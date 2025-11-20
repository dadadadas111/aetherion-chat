/**
 * ConnectionManager handles all connected clients and their channel subscriptions
 */
class ConnectionManager {
  constructor() {
    // Map of userId -> client connection info
    this.clients = new Map();
    
    // Map of lobbyId -> Set of userIds
    this.lobbyChannels = new Map();
  }

  /**
   * Add a new client connection
   */
  addClient(ws, userId, username) {
    this.clients.set(userId, {
      ws: ws,
      userId: userId,
      username: username,
      friendIds: new Set(),
      lobbyId: null,
      connectedAt: new Date()
    });
    console.log(`Client connected: ${userId} (${username})`);
  }

  /**
   * Remove a client connection
   */
  removeClient(userId) {
    const client = this.clients.get(userId);
    if (client) {
      const username = client.username || userId;
      // Remove from lobby channel if subscribed
      if (client.lobbyId) {
        this.unsubscribeFromLobby(userId);
      }
      this.clients.delete(userId);
      console.log(`Client disconnected: ${userId} (${username})`);
    }
  }

  /**
   * Get client by userId
   */
  getClient(userId) {
    return this.clients.get(userId);
  }

  /**
   * Set friend list for a user
   */
  setFriendList(userId, friendIds) {
    const client = this.clients.get(userId);
    if (client) {
      client.friendIds = new Set(friendIds);
    }
  }

  /**
   * Subscribe client to lobby channel
   */
  subscribeToLobby(userId, lobbyId) {
    const client = this.clients.get(userId);
    if (!client) return false;

    // Unsubscribe from previous lobby if any
    if (client.lobbyId) {
      this.unsubscribeFromLobby(userId);
    }

    // Add to lobby channel
    if (!this.lobbyChannels.has(lobbyId)) {
      this.lobbyChannels.set(lobbyId, new Set());
    }
    this.lobbyChannels.get(lobbyId).add(userId);
    client.lobbyId = lobbyId;

    console.log(`User ${userId} (${client.username}) subscribed to lobby ${lobbyId}`);
    return true;
  }

  /**
   * Unsubscribe client from lobby channel
   */
  unsubscribeFromLobby(userId) {
    const client = this.clients.get(userId);
    if (!client || !client.lobbyId) return;

    const lobbyId = client.lobbyId;
    const lobby = this.lobbyChannels.get(lobbyId);
    
    if (lobby) {
      lobby.delete(userId);
      if (lobby.size === 0) {
        this.lobbyChannels.delete(lobbyId);
      }
    }

    client.lobbyId = null;
    console.log(`User ${userId} (${client.username}) unsubscribed from lobby ${lobbyId}`);
  }

  /**
   * Get all clients in a lobby
   */
  getLobbyClients(lobbyId) {
    const userIds = this.lobbyChannels.get(lobbyId);
    if (!userIds) return [];

    const clients = [];
    for (const userId of userIds) {
      const client = this.clients.get(userId);
      if (client) {
        clients.push(client);
      }
    }
    return clients;
  }

  /**
   * Get all connected clients
   */
  getAllClients() {
    return Array.from(this.clients.values());
  }

  /**
   * Check if client is connected
   */
  isConnected(userId) {
    return this.clients.has(userId);
  }

  /**
   * Get online friends for a user
   */
  getOnlineFriends(userId) {
    const client = this.clients.get(userId);
    if (!client) return [];

    const onlineFriends = [];
    for (const friendId of client.friendIds) {
      if (this.isConnected(friendId)) {
        onlineFriends.push(friendId);
      }
    }
    return onlineFriends;
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      totalClients: this.clients.size,
      totalLobbies: this.lobbyChannels.size,
      timestamp: new Date()
    };
  }
}

module.exports = ConnectionManager;
