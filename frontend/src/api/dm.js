import client from './client';

export const getOrCreateThread = (userId)      => client.post(`/dm/threads/${userId}`);
export const listThreads        = ()            => client.get('/dm/threads');
export const getThreadMessages  = (threadId)   => client.get(`/dm/threads/${threadId}`);
export const sendMessage        = (threadId, body, movie_tmdb_id) =>
  client.post(`/dm/threads/${threadId}/messages`, { body, movie_tmdb_id });
export const markRead           = (threadId)   => client.put(`/dm/threads/${threadId}/read`);
export const getUnreadCount     = ()           => client.get('/dm/unread');

export function connectDMSocket(onMessage) {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const ws    = new WebSocket(`${proto}://${window.location.host}/ws/dm`);
  ws.onmessage = (e) => { try { onMessage(JSON.parse(e.data)); } catch {} };
  return ws;
}
