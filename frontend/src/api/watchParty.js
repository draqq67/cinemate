import client from './client';

export const createRoom = (tmdbId)   => client.post('/party', { tmdbId });
export const getRoom    = (code)     => client.get(`/party/${code}`);
export const endRoom    = (code)     => client.delete(`/party/${code}`);

export function connectPartyWS(roomCode, handlers) {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${window.location.host}/ws/party/${roomCode}`);

  ws.onopen    = ()      => handlers.onOpen?.();
  ws.onclose   = (e)     => handlers.onClose?.(e);
  ws.onerror   = (e)     => handlers.onError?.(e);
  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handlers.onMessage?.(msg);
    } catch {}
  };

  return {
    send: (msg) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg)),
    close: ()   => ws.close(),
    ws,
  };
}
