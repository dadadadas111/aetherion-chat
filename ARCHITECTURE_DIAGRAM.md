# Lobby System Architecture Diagram

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         Unity Client                             │
│  - Send: lobby_subscribe, lobby_member_left, update_status      │
│  - Receive: lobby_roster, member_left events                    │
└───────────────────────────┬─────────────────────────────────────┘
                            │ WebSocket
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                        server.js                                 │
│  - Route actions to handlers                                    │
│  - Handle WebSocket lifecycle (connect/disconnect)              │
└─────────┬──────────────┬──────────────┬─────────────────────────┘
          │              │              │
          │              │              │
┌─────────▼─────────┐   │   ┌──────────▼──────────┐
│ ConnectionManager │   │   │ StatusUpdateHandler │
│  (in-memory only) │   │   │  - Updates status   │
│  - WS routing     │   │   │  - Calls lobby      │
│  - userId→ws map  │   │   │    handler for      │
└───────────────────┘   │   │    character change │
                        │   └─────────────────────┘
                        │
              ┌─────────▼──────────┐
              │ LobbyEventsHandler │
              │  - Join/Leave      │
              │  - Character change│
              │  - Broadcasts      │
              └─────────┬──────────┘
                        │
                        │ Reads/Writes
                        │
              ┌─────────▼──────────┐
              │   LobbyManager     │
              │  - addMember()     │
              │  - removeMember()  │
              │  - updateCharacter│
              │  - getLobbyMembers│
              └─────────┬──────────┘
                        │
                        │ Redis Operations
                        │
              ┌─────────▼──────────┐
              │       Redis        │
              │  lobby:{id} → hash │
              │  lobby:members:{id}│
              │     → set          │
              └────────────────────┘
```

## Sequence: Join Lobby

```
Client           server.js         LobbyEventsHandler    LobbyManager      Redis
  │                  │                      │                  │            │
  │ lobby_subscribe  │                      │                  │            │
  ├─────────────────>│                      │                  │            │
  │                  │  handleJoinLobby()   │                  │            │
  │                  ├─────────────────────>│                  │            │
  │                  │                      │  addMember()     │            │
  │                  │                      ├─────────────────>│            │
  │                  │                      │                  │ HSET+SADD  │
  │                  │                      │                  ├───────────>│
  │                  │                      │                  │            │
  │                  │                      │  getLobbyMembers()            │
  │                  │                      ├─────────────────>│            │
  │                  │                      │                  │ HGETALL    │
  │                  │                      │                  ├───────────>│
  │                  │                      │                  │            │
  │                  │                      │  members[]       │            │
  │                  │                      │<─────────────────┤            │
  │                  │                      │                  │            │
  │                  │  broadcastLobbyRoster(members)          │            │
  │                  │<─────────────────────┤                  │            │
  │ lobby_roster     │                      │                  │            │
  │<─────────────────┤                      │                  │            │
  │                  │                      │                  │            │
```

## Sequence: Character Change

```
Client           server.js         StatusUpdateHandler   LobbyEventsHandler  LobbyManager   Redis
  │                  │                      │                      │              │          │
  │ update_status    │                      │                      │              │          │
  ├─────────────────>│                      │                      │              │          │
  │                  │  handleStatusUpdate()│                      │              │          │
  │                  ├─────────────────────>│                      │              │          │
  │                  │                      │  handleCharacterChange()            │          │
  │                  │                      ├─────────────────────>│              │          │
  │                  │                      │                      │updateCharacter()        │
  │                  │                      │                      ├─────────────>│          │
  │                  │                      │                      │              │ HSET     │
  │                  │                      │                      │              ├─────────>│
  │                  │                      │                      │              │          │
  │                  │                      │                      │getLobbyMembers()        │
  │                  │                      │                      ├─────────────>│          │
  │                  │                      │                      │              │ HGETALL  │
  │                  │                      │                      │              ├─────────>│
  │                  │                      │                      │              │          │
  │                  │                      │  broadcastLobbyRoster()             │          │
  │                  │                      │<─────────────────────┤              │          │
  │ lobby_roster     │                      │                      │              │          │
  │<─────────────────┴──────────────────────┴──────────────────────┘              │          │
  │                                                                                │          │
```

## Sequence: Disconnect

```
Client           server.js         LobbyEventsHandler    LobbyManager      Redis
  │                  │                      │                  │            │
  │ [WS closes]      │                      │                  │            │
  ├──────────────────>│                      │                  │            │
  │                  │  handleDisconnect()  │                  │            │
  │                  ├─────────────────────>│                  │            │
  │                  │                      │  removeMember()  │            │
  │                  │                      ├─────────────────>│            │
  │                  │                      │                  │ HDEL+SREM  │
  │                  │                      │                  ├───────────>│
  │                  │                      │                  │            │
  │                  │  broadcastMemberLeft()                  │            │
  │                  │<─────────────────────┤                  │            │
  │                  │                      │                  │            │
  │                  │  broadcastLobbyRoster()                 │            │
  │                  │<─────────────────────┤                  │            │
  │                  │                      │                  │            │
```

## Component Responsibilities

### ConnectionManager
**Role:** In-memory WebSocket routing
- Maps userId → WebSocket connection
- Stores lobbyId per client (for message routing only)
- Does NOT manage lobby membership

### LobbyManager
**Role:** Redis operations for lobby state
- CRUD operations on Redis keys
- Single source of truth for lobby membership
- Returns member data for broadcasts

### LobbyEventsHandler
**Role:** Event handling and broadcasting
- Validates requests
- Calls LobbyManager to update Redis
- Reads fresh data from Redis
- Broadcasts to WebSocket clients via ConnectionManager

### StatusUpdateHandler
**Role:** Player status management
- Updates player status in Redis
- If character changed and in lobby: calls LobbyEventsHandler

## Key Pattern

Every lobby operation follows this flow:

```
1. Validate request
2. Update Redis (via LobbyManager)
3. Read fresh data from Redis (via LobbyManager)
4. Broadcast to WebSocket clients (via ConnectionManager)
```

**Never broadcast without updating Redis first.**
**Never trust in-memory state for lobby membership.**

## Redis vs In-Memory

| Data                    | Storage      | Purpose                          |
|-------------------------|--------------|----------------------------------|
| Lobby membership        | Redis        | Source of truth                  |
| Member characterId      | Redis        | Persistent state                 |
| Member username         | Redis        | Persistent state                 |
| WebSocket connections   | In-memory    | Routing messages                 |
| Client lobbyId          | In-memory    | Quick lookup for routing         |
| Client characterId      | In-memory    | Temporary until Redis update     |

## Scaling Considerations

**Current setup:**
- Single server instance
- Redis on localhost
- In-memory WebSocket routing

**Future scaling:**
- Multiple app servers → Redis pub/sub for cross-server broadcasts
- Redis cluster → Consistent hashing for lobby distribution
- Separate Redis for lobby vs status → Independent scaling
- Load balancer with sticky sessions → Route same user to same server

For now, this architecture supports thousands of concurrent users on a single server.
