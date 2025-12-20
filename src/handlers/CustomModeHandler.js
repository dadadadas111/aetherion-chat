/**
 * CustomModeHandler - Handles custom mode specific events (6-player team-based lobbies)
 */
class CustomModeHandler {
  constructor(connectionManager, lobbyManager) {
    this.connectionManager = connectionManager;
    this.lobbyManager = lobbyManager;
  }

  /**
   * Verify that sender is the lobby host
   */
  async verifyHost(lobbyId, userId) {
    const settings = await this.lobbyManager.getLobbySettings(lobbyId);
    if (!settings || settings.hostId !== userId) {
      return false;
    }
    return true;
  }

  /**
   * Verify that lobby is in custom mode
   */
  async verifyCustomMode(lobbyId) {
    const settings = await this.lobbyManager.getLobbySettings(lobbyId);
    if (!settings || settings.gameMode !== 'Custom') {
      return false;
    }
    return true;
  }

  /**
   * Handle swap team request
   */
  async handleSwapTeam(data, userId) {
    const { lobbyId } = data;

    if (!lobbyId) {
      return { success: false, error: 'Lobby ID is required' };
    }

    try {
      // Verify client is in lobby
      const client = this.connectionManager.getClient(userId);
      if (!client || client.lobbyId !== lobbyId) {
        return { success: false, error: 'You are not in this lobby' };
      }

      // Verify custom mode
      if (!(await this.verifyCustomMode(lobbyId))) {
        return { success: false, error: 'Lobby is not in custom mode' };
      }

      // Perform swap
      const swapResult = await this.lobbyManager.swapPlayerTeam(lobbyId, userId);

      if (!swapResult.success) {
        return swapResult;
      }

      // Broadcast team swapped event
      const swapEvent = {
        type: 'team_swapped',
        eventType: 'team_swapped',
        lobbyId: lobbyId,
        userId: userId,
        username: client.username,
        fromTeam: swapResult.fromTeam,
        toTeam: swapResult.toTeam,
        timestamp: new Date().toISOString()
      };

      this.broadcastToLobby(lobbyId, swapEvent);

      // Broadcast updated roster
      await this.broadcastCustomRoster(lobbyId);

      console.log(`[CustomMode] ${userId} swapped from team ${swapResult.fromTeam} to team ${swapResult.toTeam} in lobby ${lobbyId}`);
      return { success: true, ...swapResult };
    } catch (error) {
      console.error('[CustomMode] Error handling swap team:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle start custom match
   */
  async handleStartCustomMatch(data, userId) {
    const { lobbyId } = data;

    if (!lobbyId) {
      return { success: false, error: 'Lobby ID is required' };
    }

    try {
      // Verify client is host
      if (!(await this.verifyHost(lobbyId, userId))) {
        return { success: false, error: 'UNAUTHORIZED', message: 'Only host can start the match' };
      }

      // Verify custom mode
      if (!(await this.verifyCustomMode(lobbyId))) {
        return { success: false, error: 'Lobby is not in custom mode' };
      }

      // Get team data
      const teams = await this.lobbyManager.getCustomTeams(lobbyId);
      if (!teams) {
        return { success: false, error: 'Custom teams not initialized' };
      }

      // Count players in each team
      const team0Players = teams[0].slots.filter(slot => slot.userId !== null);
      const team1Players = teams[1].slots.filter(slot => slot.userId !== null);

      // Validate team composition
      if (team0Players.length === 0 || team1Players.length === 0) {
        return { 
          success: false, 
          error: 'INVALID_TEAM_COMPOSITION',
          message: 'Both teams need at least 1 player'
        };
      }

      // Broadcast match start event
      const matchStartEvent = {
        type: 'lobby_event',
        eventType: 'custom_match_start',
        lobbyId: lobbyId,
        matchId: `match_${Date.now()}`, // Generate match ID
        team0Count: team0Players.length,
        team1Count: team1Players.length,
        timestamp: new Date().toISOString()
      };

      this.broadcastToLobby(lobbyId, matchStartEvent);

      console.log(`[CustomMode] Custom match started in lobby ${lobbyId} - Team 0: ${team0Players.length}, Team 1: ${team1Players.length}`);
      return { 
        success: true, 
        lobbyId,
        matchId: matchStartEvent.matchId,
        team0Count: team0Players.length,
        team1Count: team1Players.length
      };
    } catch (error) {
      console.error('[CustomMode] Error handling start custom match:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle random shuffle teams
   */
  async handleRandomShuffle(data, userId) {
    const { lobbyId } = data;

    if (!lobbyId) {
      return { success: false, error: 'Lobby ID is required' };
    }

    try {
      // Verify client is host
      if (!(await this.verifyHost(lobbyId, userId))) {
        return { success: false, error: 'UNAUTHORIZED', message: 'Only host can shuffle teams' };
      }

      // Verify custom mode
      if (!(await this.verifyCustomMode(lobbyId))) {
        return { success: false, error: 'Lobby is not in custom mode' };
      }

      const client = this.connectionManager.getClient(userId);
      
      // Get current teams
      const teams = await this.lobbyManager.getCustomTeams(lobbyId);
      if (!teams) {
        return { success: false, error: 'Custom teams not initialized' };
      }

      // Collect all players except host (dedupe by userId to avoid duplicates)
      const allPlayersMap = new Map();
      for (let teamIndex = 0; teamIndex <= 1; teamIndex++) {
        for (const slot of teams[teamIndex].slots) {
          if (slot.userId && slot.userId !== userId) {
            if (!allPlayersMap.has(slot.userId)) {
              allPlayersMap.set(slot.userId, { userId: slot.userId, username: slot.username });
            }
          }
        }
      }
      const allPlayers = Array.from(allPlayersMap.values());

      // Shuffle players
      this.shuffleArray(allPlayers);

      // Clear all slots
      for (let teamIndex = 0; teamIndex <= 1; teamIndex++) {
        for (const slot of teams[teamIndex].slots) {
          slot.userId = null;
          slot.username = null;
        }
      }

      // Find host's current position and keep them there
      const hostAssignment = await this.lobbyManager.getPlayerTeamAssignment(lobbyId, userId);
      if (hostAssignment) {
        teams[hostAssignment.teamIndex].slots[hostAssignment.slotIndex].userId = userId;
        teams[hostAssignment.teamIndex].slots[hostAssignment.slotIndex].username = client.username;
      } else {
        // If host not found, put them in team 0 slot 0
        teams[0].slots[0].userId = userId;
        teams[0].slots[0].username = client.username;
      }

      // Distribute shuffled players between teams
      let currentTeam = 0;
      for (const player of allPlayers) {
        // Find first empty slot in current team
        let placed = false;
        const team = teams[currentTeam];
        
        for (const slot of team.slots) {
          if (slot.userId === null) {
            slot.userId = player.userId;
            slot.username = player.username;
            placed = true;
            break;
          }
        }

        // If team is full, try other team
        if (!placed) {
          const otherTeam = currentTeam === 0 ? 1 : 0;
          const otherTeamData = teams[otherTeam];
          
          for (const slot of otherTeamData.slots) {
            if (slot.userId === null) {
              slot.userId = player.userId;
              slot.username = player.username;
              placed = true;
              break;
            }
          }
        }

        // Alternate teams for balance
        currentTeam = currentTeam === 0 ? 1 : 0;
      }

      // Save shuffled teams
      await this.lobbyManager.setCustomTeams(lobbyId, teams);

      // Broadcast teams shuffled event
      const shuffleEvent = {
        type: 'teams_shuffled',
        eventType: 'teams_shuffled',
        lobbyId: lobbyId,
        senderId: userId,
        senderName: client.username,
        timestamp: new Date().toISOString()
      };

      this.broadcastToLobby(lobbyId, shuffleEvent);

      // Broadcast updated roster
      await this.broadcastCustomRoster(lobbyId);

      console.log(`[CustomMode] Teams shuffled in lobby ${lobbyId} by ${userId}`);
      return { success: true, lobbyId };
    } catch (error) {
      console.error('[CustomMode] Error handling random shuffle:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle close custom room
   */
  async handleCloseRoom(data, userId) {
    const { lobbyId } = data;

    if (!lobbyId) {
      return { success: false, error: 'Lobby ID is required' };
    }

    try {
      // Verify client is host
      if (!(await this.verifyHost(lobbyId, userId))) {
        return { success: false, error: 'UNAUTHORIZED', message: 'Only host can close the room' };
      }

      // Verify custom mode
      if (!(await this.verifyCustomMode(lobbyId))) {
        return { success: false, error: 'Lobby is not in custom mode' };
      }

      // Broadcast room closed event to all members
      const closeEvent = {
        type: 'room_closed',
        eventType: 'room_closed',
        lobbyId: lobbyId,
        reason: 'Host closed the room',
        timestamp: new Date().toISOString()
      };

      this.broadcastToLobby(lobbyId, closeEvent);

      // Get all members
      const members = await this.lobbyManager.getLobbyMembers(lobbyId);

      // Remove all non-host members
      for (const member of members) {
        if (member.userId !== userId) {
          await this.lobbyManager.removeMember(lobbyId, member.userId);
          this.connectionManager.unsubscribeFromLobby(member.userId);
        }
      }

      // Clear custom mode data
      await this.lobbyManager.clearCustomMode(lobbyId);

      // Change mode back to Casual
      await this.lobbyManager.setLobbyMode(lobbyId, 'Casual');

      // Broadcast mode change to host
      const modeEvent = {
        type: 'lobby_event',
        eventType: 'change_mode',
        lobbyId: lobbyId,
        gameMode: 'Casual',
        timestamp: new Date().toISOString()
      };

      const hostClient = this.connectionManager.getClient(userId);
      if (hostClient && hostClient.ws.readyState === 1) {
        hostClient.ws.send(JSON.stringify(modeEvent));
      }

      console.log(`[CustomMode] Custom room ${lobbyId} closed by host ${userId}`);
      return { success: true, lobbyId };
    } catch (error) {
      console.error('[CustomMode] Error handling close room:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle get custom roster request
   */
  async handleGetCustomRoster(data, userId) {
    const { lobbyId } = data;

    if (!lobbyId) {
      return { success: false, error: 'Lobby ID is required' };
    }

    try {
      // Verify client is in lobby
      const client = this.connectionManager.getClient(userId);
      if (!client || client.lobbyId !== lobbyId) {
        return { success: false, error: 'You are not in this lobby' };
      }

      // Verify custom mode
      if (!(await this.verifyCustomMode(lobbyId))) {
        return { success: false, error: 'Lobby is not in custom mode' };
      }

      // Send roster to requesting client
      await this.sendCustomRosterToClient(lobbyId, userId);

      return { success: true };
    } catch (error) {
      console.error('Error handling get custom roster:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Broadcast custom roster to all lobby members
   */
  async broadcastCustomRoster(lobbyId) {
    try {
      const settings = await this.lobbyManager.getLobbySettings(lobbyId);
      const hostId = settings?.hostId || null;
      console.log(`[CustomMode] Debug: settings for ${lobbyId}:`, settings);
      console.log(`[CustomMode] Debug: resolved hostId=${hostId}`);

      const roster = await this.lobbyManager.getCustomRoster(lobbyId, hostId);

      // Build a map of member characterIds from Redis as a fallback
      const members = await this.lobbyManager.getLobbyMembers(lobbyId);
      const memberCharMap = new Map();
      for (const m of members) {
        memberCharMap.set(m.userId, m.characterId || null);
      }

      // Augment roster entries with characterId (prefer live connection value)
      const augmentedRoster = roster.map(r => {
        const client = this.connectionManager.getClient(r.userId);
        const characterId = client?.characterId ?? memberCharMap.get(r.userId) ?? null;
        const isHostFlag = r.userId === hostId;
        return {
          userId: r.userId,
          username: r.username,
          teamIndex: r.teamIndex,
          slotIndex: r.slotIndex,
          isHost: isHostFlag,
          isSpectator: !!r.isSpectator,
          characterId
        };
      });

      const rosterEvent = {
        type: 'custom_lobby_roster',
        eventType: 'custom_lobby_roster',
        lobbyId: lobbyId,
        customRoster: augmentedRoster,
        timestamp: new Date().toISOString()
      };

      this.broadcastToLobby(lobbyId, rosterEvent);
      console.log(`[CustomMode] Broadcast custom roster for lobby ${lobbyId} (${augmentedRoster.length} players)`);
    } catch (error) {
      console.error('[CustomMode] Error broadcasting custom roster:', error);
    }
  }

  /**
   * Send custom roster to specific client
   */
  async sendCustomRosterToClient(lobbyId, userId) {
    try {
      const settings = await this.lobbyManager.getLobbySettings(lobbyId);
      const hostId = settings?.hostId || null;

      const roster = await this.lobbyManager.getCustomRoster(lobbyId, hostId);

      // Build member char map fallback
      const members = await this.lobbyManager.getLobbyMembers(lobbyId);
      const memberCharMap = new Map();
      for (const m of members) {
        memberCharMap.set(m.userId, m.characterId || null);
      }

      const augmentedRoster = roster.map(r => {
        const client = this.connectionManager.getClient(r.userId);
        const characterId = client?.characterId ?? memberCharMap.get(r.userId) ?? null;
        const isHostFlag = r.userId === hostId;
        return {
          userId: r.userId,
          username: r.username,
          teamIndex: r.teamIndex,
          slotIndex: r.slotIndex,
          isHost: isHostFlag,
          isSpectator: !!r.isSpectator,
          characterId
        };
      });

      const rosterEvent = {
        type: 'custom_lobby_roster',
        eventType: 'custom_lobby_roster',
        lobbyId: lobbyId,
        customRoster: augmentedRoster,
        timestamp: new Date().toISOString()
      };

      const client = this.connectionManager.getClient(userId);
      if (client && client.ws.readyState === 1) {
        client.ws.send(JSON.stringify(rosterEvent));
        console.log(`[CustomMode] Sent custom roster to ${userId} in lobby ${lobbyId} (${augmentedRoster.length} players)`);
      }
    } catch (error) {
      console.error('[CustomMode] Error sending custom roster to client:', error);
    }
  }

  /**
   * Broadcast event to all lobby members
   */
  broadcastToLobby(lobbyId, event) {
    const lobbyClients = this.connectionManager.getLobbyClients(lobbyId);
    let sentCount = 0;

    lobbyClients.forEach(client => {
      try {
        if (client.ws.readyState === 1) {
          client.ws.send(JSON.stringify(event));
          sentCount++;
        }
      } catch (error) {
        console.error(`[CustomMode] Error broadcasting to ${client.userId}:`, error);
      }
    });

    console.log(`[CustomMode] Broadcast ${event.eventType} to ${sentCount} members in lobby ${lobbyId}`);
  }

  /**
   * Fisher-Yates shuffle algorithm
   */
  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
}

module.exports = CustomModeHandler;
