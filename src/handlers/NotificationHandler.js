/**
 * NotificationHandler - Handles server-to-client notifications
 * Allows external game servers to send notifications to connected clients
 */
class NotificationHandler {
  constructor(connectionManager) {
    this.connectionManager = connectionManager;
  }

  /**
   * Send notification to specific user(s)
   * This is called from the HTTP API endpoint
   */
  sendNotification(data) {
    const { userIds, notificationType, payload } = data;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return { success: false, error: 'userIds array is required' };
    }

    if (!notificationType) {
      return { success: false, error: 'notificationType is required' };
    }

    // Create notification payload
    const notificationPayload = {
      type: 'notification',
      notificationType: notificationType,
      payload: payload || {},
      timestamp: new Date().toISOString()
    };

    const results = {
      sent: [],
      offline: [],
      failed: []
    };

    userIds.forEach(userId => {
      const client = this.connectionManager.getClient(userId);
      
      if (!client) {
        results.offline.push(userId);
        return;
      }

      try {
        if (client.ws.readyState === 1) { // WebSocket.OPEN
          client.ws.send(JSON.stringify(notificationPayload));
          results.sent.push(userId);
        } else {
          results.offline.push(userId);
        }
      } catch (error) {
        console.error(`Error sending notification to ${userId}:`, error.message);
        results.failed.push(userId);
      }
    });

    console.log(`Notification sent: ${results.sent.length} success, ${results.offline.length} offline, ${results.failed.length} failed`);
    
    return { 
      success: true, 
      sent: results.sent.length,
      offline: results.offline.length,
      failed: results.failed.length,
      details: results
    };
  }

  /**
   * Broadcast notification to all connected users
   */
  broadcastNotification(data) {
    const { notificationType, payload } = data;

    if (!notificationType) {
      return { success: false, error: 'notificationType is required' };
    }

    const notificationPayload = {
      type: 'notification',
      notificationType: notificationType,
      payload: payload || {},
      timestamp: new Date().toISOString()
    };

    const clients = this.connectionManager.getAllClients();
    let successCount = 0;

    clients.forEach(client => {
      try {
        if (client.ws.readyState === 1) {
          client.ws.send(JSON.stringify(notificationPayload));
          successCount++;
        }
      } catch (error) {
        console.error(`Error sending notification to ${client.userId}:`, error.message);
      }
    });

    console.log(`Broadcast notification sent to ${successCount} clients`);
    return { success: true, recipients: successCount };
  }
}

module.exports = NotificationHandler;
