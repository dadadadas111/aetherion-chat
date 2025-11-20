const { getFirestore } = require('../config/firebase');

/**
 * FriendChatHandler - Handles friend chat messages
 * Sends messages between friends and saves to Firestore
 */
class FriendChatHandler {
  constructor(connectionManager) {
    this.connectionManager = connectionManager;
    this.firestore = getFirestore();
  }

  /**
   * Handle incoming friend chat message
   * @param {Object} data - Message data
   * @param {string} senderId - User ID of sender
   */
  async handleMessage(data, senderId) {
    const { recipientId, message } = data;

    if (!recipientId) {
      return { success: false, error: 'Recipient ID is required' };
    }

    if (!message || message.trim().length === 0) {
      return { success: false, error: 'Message cannot be empty' };
    }

    // Get sender and recipient info
    const senderClient = this.connectionManager.getClient(senderId);
    const recipientClient = this.connectionManager.getClient(recipientId);
    const senderName = senderClient?.username || 'Unknown';
    const recipientName = recipientClient?.username || 'Unknown';

    // Create message payload
    const messagePayload = {
      type: 'friend_chat',
      senderId: senderId,
      senderName: senderName,
      recipientId: recipientId,
      recipientName: recipientName,
      message: message,
      timestamp: new Date().toISOString()
    };

    // Save to Firestore if available
    if (this.firestore) {
      try {
        await this.saveChatHistory(senderId, senderName, recipientId, recipientName, message);
      } catch (error) {
        console.error('Error saving chat history:', error.message);
      }
    }

    // Send to recipient if online
    let sent = false;

    if (recipientClient && recipientClient.ws.readyState === 1) {
      try {
        recipientClient.ws.send(JSON.stringify(messagePayload));
        sent = true;
        console.log(`Friend chat from ${senderId} (${senderName}) to ${recipientId} (${recipientName}) delivered`);
      } catch (error) {
        console.error(`Error sending to ${recipientId}:`, error.message);
      }
    } else {
      console.log(`Recipient ${recipientId} (${recipientName}) is offline, message saved to history`);
    }

    // Also send confirmation back to sender
    if (senderClient && senderClient.ws.readyState === 1) {
      try {
        senderClient.ws.send(JSON.stringify({
          ...messagePayload,
          type: 'friend_chat_sent'
        }));
      } catch (error) {
        console.error(`Error sending confirmation to ${senderId}:`, error.message);
      }
    }

    return { success: true, delivered: sent };
  }

  /**
   * Save chat message to Firestore
   */
  async saveChatHistory(senderId, senderName, recipientId, recipientName, message) {
    if (!this.firestore) {
      throw new Error('Firestore not initialized');
    }

    // Create a conversation ID (consistent order for both participants)
    const conversationId = [senderId, recipientId].sort().join('_');

    const chatDoc = {
      conversationId: conversationId,
      senderId: senderId,
      senderName: senderName,
      recipientId: recipientId,
      recipientName: recipientName,
      message: message,
      timestamp: new Date(),
      read: false
    };

    await this.firestore.collection('friend_chats').add(chatDoc);
  }

  /**
   * Get chat history between two users with pagination
   */
  async getChatHistory(userId1, userId2, limit = 50, startAfterTimestamp = null) {
    if (!this.firestore) {
      throw new Error('Firestore not initialized');
    }

    const conversationId = [userId1, userId2].sort().join('_');

    let query = this.firestore
      .collection('friend_chats')
      .where('conversationId', '==', conversationId)
      .orderBy('timestamp', 'desc')
      .limit(limit);

    // Pagination support
    if (startAfterTimestamp) {
      const startDate = new Date(startAfterTimestamp);
      query = query.startAfter(startDate);
    }

    const snapshot = await query.get();
    const messages = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      messages.push({
        id: doc.id,
        senderId: data.senderId,
        senderName: data.senderName || 'Unknown',
        recipientId: data.recipientId,
        recipientName: data.recipientName || 'Unknown',
        message: data.message,
        timestamp: data.timestamp.toDate().toISOString(),
        read: data.read || false
      });
    });

    return messages;
  }

  /**
   * Mark messages as read
   */
  async markMessagesAsRead(userId, friendId) {
    if (!this.firestore) {
      throw new Error('Firestore not initialized');
    }

    const conversationId = [userId, friendId].sort().join('_');

    const snapshot = await this.firestore
      .collection('friend_chats')
      .where('conversationId', '==', conversationId)
      .where('recipientId', '==', userId)
      .where('read', '==', false)
      .get();

    const batch = this.firestore.batch();
    snapshot.forEach(doc => {
      batch.update(doc.ref, { read: true });
    });

    await batch.commit();
    return { updated: snapshot.size };
  }
}

module.exports = FriendChatHandler;
