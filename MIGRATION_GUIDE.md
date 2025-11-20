# Migration Guide: v1.x to v2.0

This guide will help you migrate your Unity client from Aetherion Chat Server v1.x to v2.0.

## Overview of Changes

Version 2.0 introduces **username support** as a core feature. This eliminates the need for separate username lookups and provides a better user experience by including display names directly in all chat messages.

---

## Breaking Changes

### 1. Authentication Now Requires Username

**What Changed:**  
The `auth` action now requires a `username` field in addition to `userId`.

**Migration Steps:**

#### Before (v1.x)
```csharp
var authMessage = new {
    action = "auth",
    userId = playerId,
    friendIds = GetFriendIds()
};
ws.Send(JsonUtility.ToJson(authMessage));
```

#### After (v2.0)
```csharp
var authMessage = new {
    action = "auth",
    userId = playerId,
    username = playerDisplayName,  // ← ADD THIS
    friendIds = GetFriendIds()
};
ws.Send(JsonUtility.ToJson(authMessage));
```

**Where to Get Username:**
- From your game's player profile data
- From your authentication system
- From Unity PlayerPrefs if stored locally
- From your game server's user API

---

### 2. Message Models Need Username Fields

**What Changed:**  
All incoming message types now include sender/recipient display names.

**Migration Steps:**

#### Update Your Message Classes

**Global Chat:**
```csharp
[System.Serializable]
public class GlobalChatMessage
{
    public string type;
    public string senderId;
    public string senderName;  // ← ADD THIS
    public string message;
    public string timestamp;
}
```

**Friend Chat:**
```csharp
[System.Serializable]
public class FriendChatMessage
{
    public string type;
    public string senderId;
    public string senderName;      // ← ADD THIS
    public string recipientId;
    public string recipientName;   // ← ADD THIS
    public string message;
    public string timestamp;
}
```

**Lobby Chat:**
```csharp
[System.Serializable]
public class LobbyChatMessage
{
    public string type;
    public string lobbyId;
    public string senderId;
    public string senderName;  // ← ADD THIS
    public string message;
    public string timestamp;
}
```

**Lobby Invite:**
```csharp
[System.Serializable]
public class LobbyInviteMessage
{
    public string type;
    public string senderId;
    public string senderName;  // ← ADD THIS
    public string lobbyCode;
    public string lobbyName;
    public string expiresAt;
    public string timestamp;
}
```

**Lobby Invite Response:**
```csharp
[System.Serializable]
public class LobbyInviteResponse
{
    public string type;
    public string responderId;
    public string responderName;  // ← ADD THIS
    public string lobbyCode;
    public bool accepted;
    public string timestamp;
}
```

**Authentication Success:**
```csharp
[System.Serializable]
public class AuthSuccessMessage
{
    public string type;
    public string userId;
    public string username;  // ← ADD THIS
    public string timestamp;
}
```

---

### 3. UI Code Should Display Usernames

**What Changed:**  
You should now display `senderName` instead of `senderId` in your UI.

**Migration Steps:**

#### Before (v1.x)
```csharp
void OnGlobalChatReceived(GlobalChatMessage msg)
{
    // Had to look up username from userId
    string displayName = GetUsernameFromId(msg.senderId);
    chatUI.AddMessage(displayName, msg.message);
}

string GetUsernameFromId(string userId)
{
    // Required separate API call or local cache lookup
    return userDatabase.GetUsername(userId);
}
```

#### After (v2.0)
```csharp
void OnGlobalChatReceived(GlobalChatMessage msg)
{
    // Username is already included!
    chatUI.AddMessage(msg.senderName, msg.message);
}

// No longer need GetUsernameFromId() function!
```

---

### 4. Friend Chat History API Returns Usernames

**What Changed:**  
The `/api/friend-chat/history` endpoint now includes `senderName` and `recipientName` fields.

**Migration Steps:**

#### Update Your History Response Model

```csharp
[System.Serializable]
public class FriendChatHistoryMessage
{
    public string id;
    public string senderId;
    public string senderName;      // ← ADD THIS
    public string recipientId;
    public string recipientName;   // ← ADD THIS
    public string message;
    public string timestamp;
    public bool read;
}

[System.Serializable]
public class FriendChatHistoryResponse
{
    public bool success;
    public List<FriendChatHistoryMessage> messages;
    public int count;
}
```

#### Update Your History Display Code

```csharp
void DisplayChatHistory(List<FriendChatHistoryMessage> messages)
{
    foreach (var msg in messages)
    {
        // Use senderName directly (no lookup needed)
        bool isMyMessage = msg.senderId == myUserId;
        string displayName = isMyMessage ? "You" : msg.senderName;
        
        chatHistoryUI.AddMessage(displayName, msg.message, msg.timestamp);
    }
}
```

---

## Step-by-Step Migration Checklist

### ✅ Step 1: Update Authentication
- [ ] Add username field to your player data structure
- [ ] Retrieve username from your game server or profile system
- [ ] Update auth message to include `username` field
- [ ] Test authentication with new format

### ✅ Step 2: Update Message Models
- [ ] Add `senderName` to GlobalChatMessage
- [ ] Add `senderName` and `recipientName` to FriendChatMessage
- [ ] Add `senderName` to LobbyChatMessage
- [ ] Add `senderName` to LobbyInviteMessage
- [ ] Add `responderName` to LobbyInviteResponse
- [ ] Add `username` to AuthSuccessMessage

### ✅ Step 3: Update UI Code
- [ ] Replace `senderId` display with `senderName` in chat UI
- [ ] Update global chat display
- [ ] Update friend chat display
- [ ] Update lobby chat display
- [ ] Update invite notification display

### ✅ Step 4: Update Chat History
- [ ] Update history API response model
- [ ] Update history display code to use usernames
- [ ] Test chat history loading and display

### ✅ Step 5: Clean Up (Optional)
- [ ] Remove old username lookup functions
- [ ] Remove username cache/database if no longer needed
- [ ] Simplify code that was handling username resolution

### ✅ Step 6: Testing
- [ ] Test authentication success/failure
- [ ] Test sending and receiving global chat
- [ ] Test sending and receiving friend chat
- [ ] Test lobby chat
- [ ] Test lobby invites
- [ ] Test chat history with usernames
- [ ] Test with multiple users

---

## Example: Complete Migration

Here's a complete before/after example of a typical chat manager:

### Before (v1.x)

```csharp
public class ChatManager : MonoBehaviour
{
    private WebSocket ws;
    private Dictionary<string, string> usernameCache = new Dictionary<string, string>();
    
    void Authenticate()
    {
        var auth = new { action = "auth", userId = playerId, friendIds = friends };
        ws.Send(JsonUtility.ToJson(auth));
    }
    
    void OnGlobalChatReceived(string jsonData)
    {
        var msg = JsonUtility.FromJson<GlobalChatMessage>(jsonData);
        
        // Need to look up username
        string username = GetUsername(msg.senderId);
        globalChatUI.AddMessage(username, msg.message);
    }
    
    string GetUsername(string userId)
    {
        if (!usernameCache.ContainsKey(userId))
        {
            // Make API call to fetch username
            StartCoroutine(FetchUsername(userId));
            return "Loading...";
        }
        return usernameCache[userId];
    }
    
    IEnumerator FetchUsername(string userId)
    {
        // Complex async username fetching logic...
    }
}
```

### After (v2.0)

```csharp
public class ChatManager : MonoBehaviour
{
    private WebSocket ws;
    // No more username cache needed!
    
    void Authenticate()
    {
        var auth = new { 
            action = "auth", 
            userId = playerId, 
            username = playerName,  // ← Added
            friendIds = friends 
        };
        ws.Send(JsonUtility.ToJson(auth));
    }
    
    void OnGlobalChatReceived(string jsonData)
    {
        var msg = JsonUtility.FromJson<GlobalChatMessage>(jsonData);
        
        // Username is already included!
        globalChatUI.AddMessage(msg.senderName, msg.message);
    }
    
    // GetUsername() and FetchUsername() functions removed!
}
```

**Code Reduction:** ~50 lines removed, cleaner architecture! 🎉

---

## Common Issues and Solutions

### Issue 1: "username is required for authentication" Error

**Cause:** Sending auth without username field  
**Solution:** Add `username` to your auth message (see Step 1)

### Issue 2: senderName is null or "Unknown"

**Cause:** Sender wasn't authenticated with username  
**Solution:** Ensure all clients are using v2.0 authentication

### Issue 3: Old chat history doesn't have usernames

**Cause:** Messages from v1.x don't have username data  
**Solution:** 
- Usernames will show as "Unknown" for old messages
- New messages will have proper usernames
- Consider clearing old history (optional)

### Issue 4: Can't deserialize messages

**Cause:** Message models missing new fields  
**Solution:** Update all message models as shown in Step 2

---

## Testing Your Migration

### Test Checklist

1. **Authentication Test**
   ```
   ✓ Connect to server
   ✓ Send auth with username
   ✓ Receive auth_success with username
   ✓ No error messages
   ```

2. **Global Chat Test**
   ```
   ✓ Send global message
   ✓ Receive with senderName
   ✓ Display shows correct username
   ```

3. **Friend Chat Test**
   ```
   ✓ Send friend message
   ✓ Receive with senderName and recipientName
   ✓ Display shows correct usernames
   ```

4. **Chat History Test**
   ```
   ✓ Load history via API
   ✓ All messages have usernames
   ✓ Display shows historical usernames
   ```

5. **Lobby Features Test**
   ```
   ✓ Lobby chat shows senderName
   ✓ Invites show senderName
   ✓ Invite responses show responderName
   ```

---

## Benefits After Migration

✅ **Simplified Code** - No more username lookup functions  
✅ **Better Performance** - No extra API calls for usernames  
✅ **Improved UX** - Instant username display in chat  
✅ **Cleaner Architecture** - Less complexity in your chat system  
✅ **Historical Context** - Chat history preserves usernames  

---

## Need Help?

- Check [CHANGELOG.md](./CHANGELOG.md) for detailed changes
- Review [How_to_use.md](./How_to_use.md) for updated API documentation
- Test your changes with the health endpoint: `https://aetherion-chat.onrender.com/health`

---

**Migration Time Estimate:** 1-2 hours for typical implementation

Good luck with your migration! 🚀
