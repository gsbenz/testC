const http = require('http');
const WebSocket = require('ws');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

const rooms = new Map(); // Map<roomName, Set<WebSocket>>
const typingUsers = {};  // { roomName: Set<username> }

wss.on('connection', (ws) => {
  ws.rooms = new Set();
  ws.username = null;

  ws.on('message', (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }

    switch (data.type) {
      
      case 'join':
        if (validateFields(data, 'room', 'sender')) {
          ws.username = data.sender;
          joinRoom(ws, data.room);
        }
        break;

      case 'leave':
        if (validateFields(data, 'room')) {
          leaveRoom(ws, data.room);
        }
        break;
        
      case 'message':
        if (validateFields(data, 'room', 'content') && ws.rooms.has(data.room)) {
          broadcastToRoom(data.room, {
            type: 'message',
            room: data.room,
            sender: ws.username,
            content: data.content,
            timestamp: data.timestamp || Date.now(),
            reply: data.reply || null
          });
        }
        break;

      case 'reaction':
        if (validateFields(data, 'room', 'target', 'emoji') && ws.rooms.has(data.room)) {
          broadcastToRoom(data.room, {
            type: 'reaction',
            room: data.room,
            sender: ws.username,
            target: data.target,
            emoji: data.emoji,
            timestamp: data.timestamp || Date.now()
          });
        }
        break;

      case 'presence_request':
        if (validateFields(data, 'room') && ws.rooms.has(data.room)) {
          broadcastPresence(data.room);
        }
        break;

      case 'typing': {
        const room = data.room;
        const user = ws.username;

        if (!room || !user || !ws.rooms.has(room)) break;

        if (!typingUsers[room]) typingUsers[room] = new Set();

        if (data.typing) {
          typingUsers[room].add(user);
        } else {
          typingUsers[room].delete(user);
        }

        broadcastToRoom(room, {
          type: 'typing',
          room,
          typingUsers: Array.from(typingUsers[room])
        });
        break;
      }

      default:
        ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
    }
  });

  ws.on('close', () => {
    try {
      for (const room of ws.rooms) {
        leaveRoom(ws, room);
      }
      ws.rooms.clear(); // clear socket's room references
      ws.username = null; // reset username
    } catch (error) {
      console.error('Error handling close event:', error);
    }
  });
});

// Validate required string fields
function validateFields(data, ...fields) {
  return fields.every(f => typeof data[f] === 'string');
}

// Join a room
function joinRoom(ws, roomName) {
  if (!rooms.has(roomName)) rooms.set(roomName, new Set());

  const existingUser = [...rooms.get(roomName)].find(
    client => client.username?.toLowerCase() === ws.username?.toLowerCase()
  );
  if (existingUser) {
    ws.send(JSON.stringify({ type: 'error', reason: 'duplicate_login',
    content: 'Someone is already logged in with this username.'
    }));
    ws.close();
    return;
  } 
    
  rooms.get(roomName).add(ws);
  ws.rooms.add(roomName);

  // Notify others that a user joined (excluding the user themselves)
  broadcastToRoom(roomName, {
    type: 'user_joined',
    room: roomName,
    sender: ws.username
  }, ws); // <- EXCLUDE this socket

  broadcastPresence(roomName);
}

// Leave a room
function leaveRoom(ws, roomName) {
  if (rooms.has(roomName)) {
    rooms.get(roomName).delete(ws);
    if (rooms.get(roomName).size === 0) rooms.delete(roomName);
  }
  ws.rooms.delete(roomName);

  // Clean up typing indicators
  if (typingUsers[roomName]) {
    typingUsers[roomName].delete(ws.username);
    if (typingUsers[roomName].size === 0) {
      delete typingUsers[roomName];
    } else {
      broadcastToRoom(roomName, {
        type: 'typing',
        room: roomName,
        typingUsers: Array.from(typingUsers[roomName])
      });
    }
  }

  // Notify others
  broadcastToRoom(roomName, {
    type: 'user_left',
    room: roomName,
    sender: ws.username
  }, ws);

  broadcastPresence(roomName);
}

// Broadcast to a specific room
function broadcastToRoom(roomName, data) {
  const payload = JSON.stringify(data);
  if (!rooms.has(roomName)) return;

  for (const client of rooms.get(roomName)) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// Send user presence list to the room
function broadcastPresence(roomName) {
  if (!rooms.has(roomName)) return;

  const users = [...rooms.get(roomName)]
    .map(ws => ws.username)
    .filter(Boolean);

  broadcastToRoom(roomName, {
    type: 'presence',
    room: roomName,
    users
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
});
