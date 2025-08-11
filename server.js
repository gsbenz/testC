const http = require('http');
const WebSocket = require('ws');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

const rooms = new Map(); // Map<roomName, Set<WebSocket>>

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

    switch (data.type) {
      case 'join':
        if (typeof data.room === 'string') joinRoom(ws, data.room);
        break;

      case 'leave':
        if (typeof data.room === 'string') leaveRoom(ws, data.room);
        break;

      case 'message':
        if (data.room && data.content && data.sender) {
          broadcastToRoom(data.room, {
            type: 'message',
            room: data.room,
            sender: data.sender,
            content: data.content,
            timestamp: data.timestamp || Date.now(),
            reply: data.reply || null
          });
        }
        break;

      case 'reaction':
        if (data.room && data.target && data.emoji && data.sender) {
          broadcastToRoom(data.room, {
            type: 'reaction',
            room: data.room,
            sender: data.sender,
            target: data.target,
            emoji: data.emoji,
            timestamp: data.timestamp || Date.now()
          });
        }
        break;

      default:
        ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
    }
  });

  ws.on('close', () => {
    for (const room of ws.rooms) {
      leaveRoom(ws, room);
    }
  });
});

function joinRoom(ws, roomName) {
  if (!rooms.has(roomName)) rooms.set(roomName, new Set());
  rooms.get(roomName).add(ws);
  ws.rooms.add(roomName);
  ws.send(JSON.stringify({ type: 'system', content: `Joined room: ${roomName}` }));
}

function leaveRoom(ws, roomName) {
  if (rooms.has(roomName)) {
    rooms.get(roomName).delete(ws);
    if (rooms.get(roomName).size === 0) rooms.delete(roomName);
  }
  ws.rooms.delete(roomName);
  ws.send(JSON.stringify({ type: 'system', content: `Left room: ${roomName}` }));
}

function broadcastToRoom(roomName, data) {
  const payload = JSON.stringify(data);
  if (!rooms.has(roomName)) return;

  for (const client of rooms.get(roomName)) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
});
