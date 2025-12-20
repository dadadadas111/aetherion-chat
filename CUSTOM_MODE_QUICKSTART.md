# Custom Mode - Quick Start Guide

## What's New?

Custom mode enables 6-player team-based lobbies (3v3) with these features:
- **6 players max** (vs 3 for casual/ranked)
- **Team management** - 2 teams with 3 slots each
- **Host controls** - Shuffle teams, start match, close room
- **Member controls** - Swap between teams

---

## How to Use

### 1. Switch to Custom Mode

```javascript
// Host changes lobby mode
ws.send(JSON.stringify({
  action: 'change_mode',
  lobbyId: 'YOUR_LOBBY_ID',
  gameMode: 'Custom'
}));
```

### 2. Players Join

```javascript
// Up to 6 players can join
ws.send(JSON.stringify({
  action: 'lobby_subscribe',
  lobbyId: 'YOUR_LOBBY_ID'
}));
```

### 3. Manage Teams

```javascript
// Player swaps to opposite team
ws.send(JSON.stringify({
  action: 'swap_team',
  lobbyId: 'YOUR_LOBBY_ID',
  userId: 'PLAYER_USER_ID'
}));

// Host shuffles teams randomly
ws.send(JSON.stringify({
  action: 'random_shuffle_teams',
  lobbyId: 'YOUR_LOBBY_ID'
}));

// Get current roster
ws.send(JSON.stringify({
  action: 'get_custom_roster',
  lobbyId: 'YOUR_LOBBY_ID'
}));
```

### 4. Start Match

```javascript
// Host starts the match
// Requires at least 1 player on each team
ws.send(JSON.stringify({
  action: 'start_custom_match',
  lobbyId: 'YOUR_LOBBY_ID'
}));
```

### 5. Close Room (Optional)

```javascript
// Host closes room and returns to casual mode
ws.send(JSON.stringify({
  action: 'close_custom_room',
  lobbyId: 'YOUR_LOBBY_ID'
}));
```

---

## Events You'll Receive

### Custom Lobby Roster
Sent when roster changes (join, leave, swap, shuffle):

```json
{
  "type": "custom_lobby_roster",
  "eventType": "custom_lobby_roster",
  "lobbyId": "ABCD1234",
  "customRoster": [
    {
      "userId": "player1_uid",
      "username": "Player1",
      "teamIndex": 0,
      "slotIndex": 0,
      "isHost": true
    },
    {
      "userId": "player2_uid",
      "username": "Player2",
      "teamIndex": 1,
      "slotIndex": 0,
      "isHost": false
    }
  ]
}
```

### Team Swapped
```json
{
  "type": "team_swapped",
  "eventType": "team_swapped",
  "lobbyId": "ABCD1234",
  "userId": "player2_uid",
  "username": "Player2",
  "fromTeam": 0,
  "toTeam": 1
}
```

### Teams Shuffled
```json
{
  "type": "teams_shuffled",
  "eventType": "teams_shuffled",
  "lobbyId": "ABCD1234",
  "senderId": "host_uid",
  "senderName": "HostPlayer"
}
```

### Room Closed
```json
{
  "type": "room_closed",
  "eventType": "room_closed",
  "lobbyId": "ABCD1234",
  "reason": "Host closed the room"
}
```

### Match Start
```json
{
  "type": "lobby_event",
  "eventType": "custom_match_start",
  "lobbyId": "ABCD1234",
  "matchId": "match_1703073000000",
  "team0Count": 3,
  "team1Count": 3
}
```

---

## UI Implementation Example

### Display Team Roster

```javascript
// Listen for roster updates
ws.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'custom_lobby_roster') {
    const roster = data.customRoster;
    
    // Separate by team
    const team0 = roster.filter(p => p.teamIndex === 0);
    const team1 = roster.filter(p => p.teamIndex === 1);
    
    // Update UI
    updateTeamDisplay('team0', team0);
    updateTeamDisplay('team1', team1);
  }
});

function updateTeamDisplay(teamId, players) {
  const container = document.getElementById(teamId);
  container.innerHTML = '';
  
  // Sort by slot index
  players.sort((a, b) => a.slotIndex - b.slotIndex);
  
  players.forEach(player => {
    const playerCard = document.createElement('div');
    playerCard.className = 'player-card';
    playerCard.innerHTML = `
      <span class="${player.isHost ? 'host' : ''}">${player.username}</span>
      ${player.isHost ? '<span class="badge">HOST</span>' : ''}
    `;
    container.appendChild(playerCard);
  });
  
  // Show empty slots
  for (let i = players.length; i < 3; i++) {
    const emptySlot = document.createElement('div');
    emptySlot.className = 'player-card empty';
    emptySlot.innerHTML = '<span>Empty Slot</span>';
    container.appendChild(emptySlot);
  }
}
```

### Swap Button

```javascript
document.getElementById('swapButton').addEventListener('click', () => {
  ws.send(JSON.stringify({
    action: 'swap_team',
    lobbyId: currentLobbyId,
    userId: currentUserId
  }));
});
```

### Host Controls

```javascript
// Only show for host
if (isHost) {
  document.getElementById('hostControls').style.display = 'block';
  
  // Shuffle button
  document.getElementById('shuffleButton').addEventListener('click', () => {
    ws.send(JSON.stringify({
      action: 'random_shuffle_teams',
      lobbyId: currentLobbyId
    }));
  });
  
  // Start button
  document.getElementById('startButton').addEventListener('click', () => {
    ws.send(JSON.stringify({
      action: 'start_custom_match',
      lobbyId: currentLobbyId
    }));
  });
  
  // Close button
  document.getElementById('closeButton').addEventListener('click', () => {
    if (confirm('Close custom room and return to casual mode?')) {
      ws.send(JSON.stringify({
        action: 'close_custom_room',
        lobbyId: currentLobbyId
      }));
    }
  });
}
```

---

## Testing

Run the test suite:
```bash
node test-custom-mode.js
```

---

## Error Handling

```javascript
ws.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'ack' && !data.success) {
    // Handle errors
    switch (data.error) {
      case 'TEAM_FULL':
        alert('Cannot swap - target team is full');
        break;
      case 'INVALID_TEAM_COMPOSITION':
        alert('Both teams need at least 1 player to start');
        break;
      case 'UNAUTHORIZED':
        alert('Only the host can perform this action');
        break;
      default:
        alert('Error: ' + data.error);
    }
  }
});
```

---

## Files Modified

1. **src/managers/LobbyManager.js** - Team management methods
2. **src/handlers/CustomModeHandler.js** - New event handler
3. **src/handlers/LobbyEventsHandler.js** - Custom mode integration
4. **src/server.js** - Event routing
5. **test-custom-mode.js** - Test suite

---

## Support

For detailed documentation, see [CUSTOM_MODE_IMPLEMENTATION.md](./CUSTOM_MODE_IMPLEMENTATION.md)

For issues:
1. Check server logs for errors
2. Verify Redis connection is active
3. Ensure lobby is in custom mode
4. Verify host permissions for restricted actions
