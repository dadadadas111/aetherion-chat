const DEFAULT_MATCH_TTL = 60 * 60; // 1 hour

class MatchReadyHandler {
  constructor(connectionManager, playerStatusManager) {
    this.connectionManager = connectionManager;
    this.playerStatusManager = playerStatusManager;
    this.redis = playerStatusManager.redisClient;
    this.matchStartUrl = process.env.MATCH_START_URL || 'https://aetherion.dash.id.vn/api/Matches/start';
  }

  _playersKey(matchId) {
    return `match:players:${matchId}`;
  }

  _metaKey(matchId) {
    return `match:meta:${matchId}`;
  }

  _startKey(matchId) {
    return `match:start:${matchId}`;
  }

  async handleRegister(data, callerUserId) {
    if (!this.redis || !this.redis.isOpen) {
      return { success: false, error: 'Match system not ready (redis unavailable)' };
    }

    try {
      const matchId = data.matchId;
      const playerId = callerUserId; // authoritative
      const matchSize = parseInt(data.matchSize, 10) || null;
      const isReady = !!data.isready;
      const map = data.map || 1;
      const matchMode = data.matchMode || null;

      if (!matchId || !playerId || !matchSize) {
        return { success: false, error: 'matchId, playerId and matchSize are required' };
      }

      const playersKey = this._playersKey(matchId);
      const metaKey = this._metaKey(matchId);
      const startKey = this._startKey(matchId);

      // Accept team from client ('A' or 'B')
      const team = (data.team || '').toString().toUpperCase();
      const allowedTeams = ['A', 'B'];

      const entry = {
        isReady: isReady,
        matchMode: matchMode,
        map: map,
        matchSize: matchSize,
        team: allowedTeams.includes(team) ? team : null,
        updatedAt: new Date().toISOString()
      };

      // Save/update player entry
      await this.redis.hSet(playersKey, playerId, JSON.stringify(entry));
      await this.redis.expire(playersKey, DEFAULT_MATCH_TTL);

      // Ensure meta exists (first writer wins)
      const meta = { matchSize: matchSize, matchMode: matchMode };
      await this.redis.set(metaKey, JSON.stringify(meta), { NX: true, EX: DEFAULT_MATCH_TTL });

      // Read all players
      const all = await this.redis.hGetAll(playersKey);
      const playerIds = Object.keys(all || {});

      const players = playerIds.map(pid => {
        try { return { playerId: pid, ...(JSON.parse(all[pid] || '{}')) }; } catch (e) { return { playerId: pid }; }
      });

      // Determine current match size from meta (fallback to provided)
      let metaRaw = await this.redis.get(metaKey);
      let metaObj = metaRaw ? JSON.parse(metaRaw) : { matchSize };
      const currentMatchSize = parseInt(metaObj.matchSize, 10) || matchSize;

      const registeredCount = players.length;

      const allReady = players.length > 0 && players.every(p => !!p.isReady);

      // Default not-ready startAt: 1 minute from now (if not decided yet)
      let startAt = await this.redis.get(startKey);

      let deltaTimeTillStart = startAt ? Number(startAt) - Date.now() : null;

      console.log(`[MatchReadyHandler] matchId=${matchId} registeredCount=${registeredCount}/${currentMatchSize} allReady=${allReady} startAt=${deltaTimeTillStart}`);

      if (registeredCount >= currentMatchSize && allReady) {
        // Everyone registered and ready -> set start to 10s from now (only once)
        const decidedAt = Date.now() + 2000;
        const setRes = await this.redis.set(startKey, String(decidedAt), { NX: true, EX: DEFAULT_MATCH_TTL });
        if (setRes === 'OK') {
          startAt = String(decidedAt);
          // We are the winner; trigger external match start request
          try {
            // build payload
            const payload = {
              matchId: matchId,
              name: data.name || `match-${matchId}`,
              mode: metaObj.matchMode || matchMode || '',
              map: map || 0,
              players: players.map(p => ({ userId: p.playerId, team: p.team || null }))
            };
            // log the payload
            console.log('Sending match start request with payload:', payload);
            if (matchMode != "Custom")
              await this._sendMatchStartRequest(payload);
          } catch (e) {
            console.error('Error sending match start request:', e);
          }
        } else {
          // another writer may have set it; read again
          startAt = await this.redis.get(startKey);
          // build payload
          const payload = {
            matchId: matchId,
            name: data.name || `match-${matchId}`,
            mode: metaObj.matchMode || matchMode || '',
            map: map || 0,
            players: players.map(p => ({ userId: p.playerId, team: p.team || null }))
          };
          // log the payload
          console.log('Sending match start request with payload:', payload);
          // can send multiple times. api supports idempotency
          if (matchMode != "Custom")
            await this._sendMatchStartRequest(payload);
        }
      } else {
        // Not everyone ready - ensure default start exists (1 minute) so clients see something
        if (!startAt) {
          const defaultAt = Date.now() + 30 * 1000;
          await this.redis.set(startKey, String(defaultAt), { NX: true, EX: DEFAULT_MATCH_TTL });
          startAt = String(defaultAt);
        }
      }

      const resp = {
        success: true,
        matchId,
        registeredCount,
        matchSize: currentMatchSize,
        isMatchReady: (registeredCount >= currentMatchSize && allReady),
        matchWillStartAt: (registeredCount >= currentMatchSize && allReady) ? Number(Date.now() + 5000) : startAt,
        players,
        map,
        matchMode
      };

      // Notify connected players about status change
      for (const p of players) {
        const client = this.connectionManager.getClient(p.playerId);
        if (client && client.ws && client.ws.readyState === 1) {
          try {
            client.ws.send(JSON.stringify({
              type: 'match_status',
              matchId: matchId,
              isMatchReady: resp.isMatchReady,
              matchWillStartAt: resp.matchWillStartAt,
              players: players,
              timestamp: new Date().toISOString()
            }));
          } catch (e) {
            // ignore send errors per-client
          }
        }
      }

      return resp;
    } catch (error) {
      console.error('MatchReadyHandler.handleRegister error:', error);
      return { success: false, error: error.message };
    }
  }

  async _sendMatchStartRequest(payload) {
    try {
      const urlStr = this.matchStartUrl;
      const urlObj = new URL(urlStr);
      const isHttps = urlObj.protocol === 'https:';
      const httpLib = isHttps ? require('https') : require('http');

      const data = JSON.stringify(payload);

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + (urlObj.search || ''),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      };

      return await new Promise((resolve, reject) => {
        const req = httpLib.request(options, (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString();
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ statusCode: res.statusCode, body });
            } else {
              reject(new Error(`Match start API returned ${res.statusCode}: ${body}`));
            }
          });
        });

        req.on('error', (err) => reject(err));
        req.write(data);
        req.end();
      });
    } catch (error) {
      console.error('Failed to send match start request', error);
      throw error;
    }
  }

  async handleGetStatus(data) {
    if (!this.redis || !this.redis.isOpen) {
      return { success: false, error: 'Match system not ready (redis unavailable)' };
    }

    try {
      const matchId = data.matchId;
      if (!matchId) return { success: false, error: 'matchId is required' };

      const playersKey = this._playersKey(matchId);
      const metaKey = this._metaKey(matchId);
      const startKey = this._startKey(matchId);

      const all = await this.redis.hGetAll(playersKey);
      const playerIds = Object.keys(all || {});
      const players = playerIds.map(pid => {
        try { return { playerId: pid, ...(JSON.parse(all[pid] || '{}')) }; } catch (e) { return { playerId: pid }; }
      });

      const metaRaw = await this.redis.get(metaKey);
      const metaObj = metaRaw ? JSON.parse(metaRaw) : {};
      const currentMatchSize = parseInt(metaObj.matchSize, 10) || null;

      const startAt = await this.redis.get(startKey);

      const registeredCount = players.length;
      const allReady = players.length > 0 && players.every(p => !!p.isReady);

      return {
        success: true,
        matchId,
        registeredCount,
        matchSize: currentMatchSize,
        isMatchReady: (registeredCount >= (currentMatchSize || 0) && allReady),
        matchWillStartAt: startAt ? Number(startAt) : null,
        players
      };
    } catch (error) {
      console.error('MatchReadyHandler.handleGetStatus error:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = MatchReadyHandler;
