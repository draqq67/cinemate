import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import app from './app.js';
import { setupWatchPartyWS } from './routes/watchPartyRoutes.js';

const PORT = process.env.PORT || 4000;

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/ws/party/')) {
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

setupWatchPartyWS(wss);

server.listen(PORT, () => console.log(`Backend running on :${PORT}`));
