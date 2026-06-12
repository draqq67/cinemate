import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { parse as parseCookie } from 'cookie';
import jwt from 'jsonwebtoken';
import app from './app.js';
import { setupWatchPartyWS } from './routes/watchPartyRoutes.js';
import { registerDMSocket } from './routes/dmRoutes.js';

const PORT = process.env.PORT || 4000;

const server = createServer(app);
const wss      = new WebSocketServer({ noServer: true }); // party
const wssDM    = new WebSocketServer({ noServer: true }); // direct messages

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname.startsWith('/ws/party/')) {
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  } else if (url.pathname === '/ws/dm') {
    wssDM.handleUpgrade(req, socket, head, ws => wssDM.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

setupWatchPartyWS(wss);

// ── DM WebSocket: authenticate and register socket for push delivery ──────────
wssDM.on('connection', (ws, req) => {
  try {
    const cookies = parseCookie(req.headers.cookie || '');
    const token   = cookies.access_token;
    if (!token) { ws.close(4001, 'Unauthorized'); return; }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    registerDMSocket(ws, decoded.id);
    ws.send(JSON.stringify({ type: 'dm_connected' }));
  } catch {
    ws.close(4001, 'Unauthorized');
  }
});

server.listen(PORT, () => console.log(`Backend running on :${PORT}`));
