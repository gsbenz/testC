const http = require('http');
const WebSocket = require('ws');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

const rooms = new Map();

wss.on('connection', (ws) => {
  ws.rooms = new Set();

  ws.on('message', (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }

    if (!data.type) return;

    switch (data.type) {
      case 'join':
        if (typeof data.room !== 'string') return;
        joinRoom(ws, data.room);
        break;

      case 'leave':
        if (typeof data.room !== 'string') return;
        leaveRoom(ws, data.room);
        break;

      case 'message':
        if (!data.room || !data.content || !data.sender) return;
        broadcastMessage(ws, data.room, data);
        break;

      case 'reaction':
        if (!data.room || !data.target || !data.emoji || !data.sender) return;
        broadcastReaction(ws, data.room, data);
        break;

      default:
        ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
    }
  });

  ws.on('close', () => {
    ws.rooms.forEach(roomName => {
      leaveRoom(ws, roomName);
    });
  });
});

function joinRoom(ws, roomName) {
  if (!rooms.has(roomName)) {
    rooms.set(roomName, new Set());
  }
  rooms.get(roomName).add(ws);
  ws.rooms.add(roomName);
  ws.send(JSON.stringify({ type: 'system', content: `Joined room: ${roomName}` }));
}

function leaveRoom(ws, roomName) {
  if (rooms.has(roomName)) {
    rooms.get(roomName).delete(ws);
    if (rooms.get(roomName).size === 0) {
      rooms.delete(roomName);
    }
  }
  ws.rooms.delete(roomName);
  ws.send(JSON.stringify({ type: 'system', content: `Left room: ${roomName}` }));
}

function broadcastMessage(senderWs, roomName, message) {
  if (!rooms.has(roomName)) return;
  const payload = {
    type: 'message',
    room: roomName,
    sender: message.sender,
    content: message.content,
    timestamp: message.timestamp || Date.now(),
    reply: message.reply || null
  };
  rooms.get(roomName).forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(payload));
    }
  });
}

function broadcastReaction(senderWs, roomName, reaction) {
  if (!rooms.has(roomName)) return;
  const payload = {
    type: 'reaction',
    room: roomName,
    sender: reaction.sender,
    emoji: reaction.emoji,
    target: reaction.target,
    timestamp: reaction.timestamp || Date.now()
  };
  rooms.get(roomName).forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(payload));
    }
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WebSocket server listening on port ${PORT}`);
});
