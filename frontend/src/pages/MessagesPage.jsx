import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Navbar from '../components/ui/Navbar';
import { useAuth } from '../hooks/useAuth';
import {
  listThreads, getThreadMessages, sendMessage,
  getOrCreateThread, markRead, connectDMSocket,
} from '../api/dm';
import { getMovies } from '../api/movies';

const POSTER = 'https://image.tmdb.org/t/p/w92';
const LABEL  = { fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--lb-text-muted)' };

// ── Movie picker dropdown ─────────────────────────────────────────────────────
function MoviePicker({ onSelect, onClose }) {
  const [q, setQ]           = useState('');
  const [results, setResults] = useState([]);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const t = setTimeout(() => {
      getMovies({ search: q, limit: 6 }).then(r => setResults(r.data.movies || [])).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div style={{
      position: 'absolute', bottom: '110%', left: 0,
      background: 'var(--lb-bg-2)', border: '1px solid var(--lb-border-2)',
      borderRadius: '6px', width: 280, zIndex: 50,
      boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
    }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--lb-border)' }}>
        <input
          autoFocus
          placeholder="Search a film…"
          value={q}
          onChange={e => setQ(e.target.value)}
          style={{ width: '100%', fontSize: '13px' }}
        />
      </div>
      {results.length > 0 && (
        <div style={{ maxHeight: 220, overflowY: 'auto' }}>
          {results.map(m => (
            <button
              key={m.tmdb_id}
              onClick={() => { onSelect(m); onClose(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '8px 12px', background: 'none',
                border: 'none', cursor: 'pointer', textAlign: 'left',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--lb-bg-3)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              {m.poster_path
                ? <img src={`${POSTER}${m.poster_path}`} alt="" style={{ width: 28, height: 42, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }} />
                : <div style={{ width: 28, height: 42, background: 'var(--lb-bg-4)', borderRadius: 2, flexShrink: 0 }} />
              }
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</div>
                <div style={{ fontSize: 10, color: 'var(--lb-text-muted)' }}>{m.year}</div>
              </div>
            </button>
          ))}
        </div>
      )}
      <button onClick={onClose} style={{ width: '100%', padding: '8px', fontSize: 11, background: 'none', border: 'none', color: 'var(--lb-text-muted)', cursor: 'pointer', borderTop: '1px solid var(--lb-border)' }}>
        Cancel
      </button>
    </div>
  );
}

// ── Party link detection ──────────────────────────────────────────────────────
function isPartyLink(body) {
  return body && body.includes('/party/');
}

function extractPartyCode(body) {
  const match = body?.match(/\/party\/([A-Z0-9]{6,8})/i);
  return match ? match[1] : null;
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg, isMe }) {
  const partyCode = isPartyLink(msg.body) ? extractPartyCode(msg.body) : null;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: isMe ? 'flex-end' : 'flex-start',
      marginBottom: 10,
    }}>
      {partyCode ? (
        <div style={{
          background: isMe ? 'rgba(132,136,113,0.2)' : 'var(--lb-bg-3)',
          border: '1px solid var(--lb-border-2)', borderRadius: 8, padding: '12px 14px',
          maxWidth: 240,
        }}>
          <div style={{ fontSize: 11, color: 'var(--lb-green)', fontWeight: 700, marginBottom: 6 }}>🎬 Watch Party invite</div>
          <div style={{ fontSize: 12, color: 'var(--lb-text-muted)', marginBottom: 10 }}>Room: {partyCode}</div>
          <a href={`/party/${partyCode}`} style={{
            display: 'block', textAlign: 'center', padding: '7px 14px',
            background: 'var(--lb-green)', color: 'var(--lb-bg)',
            borderRadius: 4, fontSize: 11, fontWeight: 700, textDecoration: 'none',
            letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>Join party →</a>
        </div>
      ) : msg.movie_tmdb_id ? (
        <Link to={`/movie/${msg.movie_tmdb_id}`} style={{ textDecoration: 'none' }}>
          <div style={{
            background: isMe ? 'rgba(132,136,113,0.2)' : 'var(--lb-bg-3)',
            border: '1px solid var(--lb-border-2)',
            borderRadius: 8, padding: '8px 10px',
            display: 'flex', gap: 10, alignItems: 'center',
            maxWidth: 220, cursor: 'pointer',
          }}>
            {msg.moviePoster
              ? <img src={`${POSTER}${msg.moviePoster}`} alt="" style={{ width: 36, height: 54, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }} />
              : <div style={{ width: 36, height: 54, background: 'var(--lb-bg-4)', borderRadius: 2, flexShrink: 0 }} />
            }
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 9, color: 'var(--lb-green)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>🎬 Film</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', lineHeight: 1.3 }}>{msg.movieTitle || `#${msg.movie_tmdb_id}`}</div>
            </div>
          </div>
        </Link>
      ) : (
        <div style={{
          background: isMe ? 'var(--lb-green)' : 'var(--lb-bg-3)',
          color: isMe ? 'var(--lb-bg)' : 'var(--lb-text-bright)',
          borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          padding: '8px 14px', maxWidth: 260, fontSize: 13, lineHeight: 1.45,
        }}>
          {msg.body}
        </div>
      )}
      <div style={{ fontSize: 9, color: 'var(--lb-text-muted)', marginTop: 3 }}>
        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function MessagesPage() {
  const { user }              = useAuth();
  const [searchParams]        = useSearchParams();
  const [threads, setThreads] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput]     = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [sending, setSending] = useState(false);
  const bottomRef  = useRef(null);
  const wsRef      = useRef(null);

  const loadThreads = useCallback(async () => {
    const { data } = await listThreads();
    setThreads(data.threads || []);
  }, []);

  const shareTmdbId  = searchParams.get('share') ? parseInt(searchParams.get('share')) : null;
  const partyLinkParam = searchParams.get('partylink') || null;
  const [shareTarget, setShareTarget]   = useState(shareTmdbId);
  const [partyLink, setPartyLink]       = useState(partyLinkParam);
  const [showPartyPicker, setShowPartyPicker] = useState(!!partyLinkParam);
  const [partyFollowing, setPartyFollowing]   = useState([]);

  // Open thread by userId from URL ?with=userId
  useEffect(() => {
    const withUser = searchParams.get('with');
    if (withUser && user) {
      getOrCreateThread(withUser)
        .then(({ data }) => { setActiveId(data.threadId); loadThreads(); })
        .catch(err => {
          console.warn('Could not open DM thread:', err?.response?.data?.error || err.message);
        });
    }
  }, [searchParams, user]);

  // Load following list for party invite picker
  useEffect(() => {
    if (!partyLinkParam || !user) return;
    import('../api/activity').then(({ getFollowing }) =>
      getFollowing(user.id).then(r => setPartyFollowing(r.data.following || []))
    );
  }, [partyLinkParam, user]);

  // When a thread is opened and we have a share target, send immediately
  useEffect(() => {
    if (!activeId || !shareTarget) return;
    sendMessage(activeId, null, shareTarget)
      .then(() => { setShareTarget(null); loadThreads(); })
      .catch(() => {});
  }, [activeId, shareTarget]);

  useEffect(() => { loadThreads(); }, [loadThreads]);

  // Load messages when thread changes
  useEffect(() => {
    if (!activeId) return;
    getThreadMessages(activeId).then(({ data }) => setMessages(data.messages || []));
    markRead(activeId).catch(() => {});
  }, [activeId]);

  // Auto-scroll
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // WebSocket for real-time delivery
  useEffect(() => {
    if (!user) return;
    const ws = connectDMSocket((msg) => {
      if (msg.type === 'dm') {
        if (msg.threadId === activeId) {
          setMessages(prev => [...prev, msg.message]);
        }
        loadThreads();
      }
    });
    wsRef.current = ws;
    return () => ws.close();
  }, [user, activeId]);

  const activeThread = threads.find(t => t.id === activeId);

  const send = async (movieTmdbId = null) => {
    if (!activeId) return;
    if (!input.trim() && !movieTmdbId) return;
    setSending(true);
    try {
      await sendMessage(activeId, input.trim() || null, movieTmdbId);
      setInput('');
      // Message arrives via WS; also reload thread preview
      loadThreads();
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--lb-bg)' }}>
      <Navbar />

      {/* Party link picker modal */}
      {showPartyPicker && partyLink && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: 'var(--lb-bg-2)', border: '1px solid var(--lb-border)', borderRadius: 8, padding: 24, maxWidth: 380, width: '100%', margin: '0 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, color: 'var(--lb-text-bright)' }}>🎬 Send watch party invite</h3>
              <button onClick={() => setShowPartyPicker(false)} style={{ background: 'none', border: 'none', color: 'var(--lb-text-muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            {partyFollowing.length === 0
              ? <div style={{ color: 'var(--lb-text-muted)', fontSize: 13 }}>Follow users to invite them to your party.</div>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
                  {partyFollowing.map(u => (
                    <button key={u.id}
                      onClick={async () => {
                        const { data } = await getOrCreateThread(u.id).then(r => r);
                        await sendMessage(data.threadId, `🎬 Join my watch party: ${partyLink}`, null);
                        setShowPartyPicker(false);
                        setActiveId(data.threadId);
                        loadThreads();
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 4, border: '1px solid var(--lb-border-2)', background: 'var(--lb-bg-3)', cursor: 'pointer', textAlign: 'left' }}>
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--lb-bg-4)', border: '1px solid var(--lb-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--lb-green)', flexShrink: 0 }}>
                        {u.username.slice(0, 2).toUpperCase()}
                      </div>
                      <span style={{ fontSize: 13, color: 'var(--lb-text-bright)' }}>{u.username}</span>
                    </button>
                  ))}
                </div>
            }
          </div>
        </div>
      )}

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px var(--page-px)', display: 'flex', gap: 16, height: 'calc(100vh - 52px - 48px)' }}>

        {/* Thread list */}
        <div style={{ width: 280, flexShrink: 0, background: 'var(--lb-bg-2)', border: '1px solid var(--lb-border)', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--lb-border)' }}>
            <div style={LABEL}>Messages</div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {threads.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--lb-text-muted)', fontSize: 13 }}>
                No conversations yet.<br />
                Share a film from any movie page to start.
              </div>
            )}
            {threads.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveId(t.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 14px', background: t.id === activeId ? 'var(--lb-bg-3)' : 'none',
                  border: 'none', borderBottom: '1px solid var(--lb-border)',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', background: 'var(--lb-bg-4)',
                  border: '2px solid var(--lb-green)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--lb-green)', flexShrink: 0,
                }}>
                  {t.other_username?.slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Link to={`/user/${t.other_id}`} onClick={e => e.stopPropagation()} style={{ color: '#fff', textDecoration: 'none' }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--lb-green)'}
                      onMouseLeave={e => e.currentTarget.style.color = '#fff'}>
                      {t.other_username}
                    </Link>
                    {parseInt(t.unread_count) > 0 && (
                      <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--lb-green)', color: 'var(--lb-bg)', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {t.unread_count}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--lb-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                    {t.last_movie_tmdb_id ? '🎬 Shared a film' : (t.last_body || 'No messages yet')}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Message pane */}
        <div style={{ flex: 1, background: 'var(--lb-bg-2)', border: '1px solid var(--lb-border)', borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!activeId ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--lb-text-muted)', fontSize: 14 }}>
              Select a conversation
            </div>
          ) : (
            <>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--lb-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--lb-bg-4)', border: '2px solid var(--lb-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--lb-green)' }}>
                  {activeThread?.other_username?.slice(0, 2).toUpperCase()}
                </div>
                <Link to={`/profile?user=${activeThread?.other_id}`} style={{ fontSize: 14, fontWeight: 600, color: '#fff', textDecoration: 'none' }}>
                  {activeThread?.other_username}
                </Link>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                {messages.map(m => (
                  <MessageBubble key={m.id} msg={m} isMe={m.sender_id === user?.id} />
                ))}
                <div ref={bottomRef} />
              </div>

              <form onSubmit={e => { e.preventDefault(); send(); }}
                style={{ padding: '10px 12px', borderTop: '1px solid var(--lb-border)', display: 'flex', gap: 8, position: 'relative' }}>
                {showPicker && (
                  <MoviePicker
                    onSelect={m => send(m.tmdb_id)}
                    onClose={() => setShowPicker(false)}
                  />
                )}
                <button type="button" onClick={() => setShowPicker(p => !p)}
                  title="Share a film"
                  style={{ background: 'var(--lb-bg-3)', border: '1px solid var(--lb-border-2)', borderRadius: 6, padding: '0 12px', fontSize: 16, cursor: 'pointer', color: 'var(--lb-text)', flexShrink: 0 }}>
                  🎬
                </button>
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Write a message…"
                  disabled={sending}
                  style={{ flex: 1, fontSize: 13, borderRadius: 6 }}
                />
                <button type="submit" disabled={!input.trim() || sending}
                  style={{
                    padding: '0 18px', borderRadius: 6, border: 'none', flexShrink: 0,
                    background: 'var(--lb-green)', color: 'var(--lb-bg)',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    opacity: !input.trim() ? 0.5 : 1,
                  }}>
                  Send
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
