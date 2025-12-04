# Character Selection - Quick Reference Card

**For Unity Client Team**

---

## 🎯 What You Need to Do

### 1. Add Character to Authentication ✓
```csharp
var authMsg = new {
    action = "auth",
    userId = playerUserId,
    username = playerUsername,
    friendIds = friendIdArray,
    characterId = currentCharacterId  // ADD THIS
};
ws.Send(JsonUtility.ToJson(authMsg));
```

---

### 2. Send Character Updates ✓
```csharp
// When player changes character/skin
public void OnCharacterChanged(string newCharacterId)
{
    var msg = new {
        action = "update_status",
        status = "online",
        characterId = newCharacterId  // ADD THIS
    };
    ws.Send(JsonUtility.ToJson(msg));
}
```

---

### 3. Handle Lobby Roster (NEW) ✓
```csharp
// Received automatically when joining lobby
void HandleLobbyRoster(string json)
{
    var roster = JsonUtility.FromJson<LobbyRosterEvent>(json);
    
    foreach (var member in roster.members)
    {
        AddMemberToUI(member.userId, member.username, member.characterId);
    }
}

[Serializable]
public class LobbyRosterEvent
{
    public string type;        // "lobby_event"
    public string eventType;   // "lobby_roster"
    public string lobbyId;
    public LobbyMember[] members;
}

[Serializable]
public class LobbyMember
{
    public string userId;
    public string username;
    public string characterId;  // Can be null
}
```

---

### 4. Handle Character Changes (NEW) ✓
```csharp
// Received when someone in lobby changes character
void HandleCharacterChanged(string json)
{
    var evt = JsonUtility.FromJson<CharacterChangedEvent>(json);
    
    UpdateMemberCharacter(evt.userId, evt.characterId);
}

[Serializable]
public class CharacterChangedEvent
{
    public string type;         // "lobby_event"
    public string eventType;    // "character_changed"
    public string userId;
    public string username;
    public string characterId;
}
```

---

### 5. Handle Member Left (NEW) ✓
```csharp
// Received when someone disconnects from lobby
void HandleMemberLeft(string json)
{
    var evt = JsonUtility.FromJson<MemberLeftEvent>(json);
    
    RemoveMemberFromUI(evt.userId);
}

[Serializable]
public class MemberLeftEvent
{
    public string type;         // "lobby_event"
    public string eventType;    // "member_left"
    public string userId;
    public string username;
}
```

---

### 6. Update Message Router ✓
```csharp
void OnWebSocketMessage(string message)
{
    var baseMsg = JsonUtility.FromJson<BaseMessage>(message);
    
    if (baseMsg.type == "lobby_event")
    {
        var lobbyEvent = JsonUtility.FromJson<LobbyEventBase>(message);
        
        switch (lobbyEvent.eventType)
        {
            case "lobby_roster":
                HandleLobbyRoster(message);
                break;
                
            case "character_changed":
                HandleCharacterChanged(message);
                break;
                
            case "member_left":
                HandleMemberLeft(message);
                break;
                
            // ... existing cases
        }
    }
}
```

---

## 📋 Testing Checklist

- [ ] Auth includes characterId
- [ ] Joining lobby receives roster with all characters
- [ ] Changing character sends update_status with characterId
- [ ] Other lobby members receive character_changed event
- [ ] New member joining sees current characters
- [ ] Member disconnecting triggers member_left event
- [ ] Null characterIds handled gracefully

---

## 🎬 Example Scenario

1. **Player A** authenticates with `characterId: "warrior"`
2. **Player A** joins lobby → receives empty roster
3. **Player B** authenticates with `characterId: "mage"`
4. **Player B** joins lobby → receives roster: `[{A, "warrior"}]`
5. **Player A** changes to `"archer"` → **Player B** receives `character_changed` event
6. **Player C** joins lobby → receives roster: `[{A, "archer"}, {B, "mage"}]`

---

## ⚠️ Important Notes

- **Roster is only sent to the joining player** (not broadcast)
- **Character changes ARE broadcast** to all lobby members (except sender)
- **characterId can be null** - handle gracefully
- **Backward compatible** - old code without characterId still works

---

## 📖 Full Documentation

See **CHARACTER_SELECTION_CHANGELOG.md** for:
- Complete code examples
- Event payload specifications
- Integration guide
- Error handling

---

## 🐛 Troubleshooting

**Roster not received?**
- Check `lobby_subscribe` was successful
- Verify event handler checks for `eventType: "lobby_roster"`

**Character changes not received?**
- Confirm both players in same lobby
- Check `update_status` includes `characterId`
- Verify handler checks for `eventType: "character_changed"`

**Getting null characters?**
- Normal if player hasn't selected character yet
- Display placeholder or default character

---

**Questions?** Ask server team or check CHARACTER_SELECTION_CHANGELOG.md
