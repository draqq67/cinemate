import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/ui/Navbar';
import { useAuth } from '../hooks/useAuth';
import { getRoom, endRoom, connectPartyWS } from '../api/watchParty';
import client from '../api/client';

const BACKDROP = 'https://image.tmdb.org/t/p/w780';

const LABEL = {
  fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--lb-text-muted)',
};

export default function WatchPartyPage() {
  const { code } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [onlineMembers, setOnlineMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [streamUrl, setStreamUrl] = useState(null);
  const [subtitles, setSubtitles] = useState([]);
  const [selectedSub, setSelectedSub] = useState(null);
  const [showSubMenu, setShowSubMenu] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [connected, setConnected] = useState(false);

  const videoRef   = useRef(null);
  const wsRef      = useRef(null);
  const chatEndRef = useRef(null);
  const hlsRef     = useRef(null);

  // Load room data
  useEffect(() => {
    getRoom(code)
      .then(async r => {
        setRoom(r.data.room);
        setMessages(r.data.messages);
        setOnlineMembers(r.data.online_members);
        // Fetch stream URL if available
        if (r.data.room.jellyfin_id) {
          try {
            const s = await client.get(`/movies/${r.data.room.tmdb_id}/stream-url`);
            setStreamUrl(s.data.streamUrl);
            setSubtitles(s.data.subtitles || []);
          } catch {}
        }
      })
      .catch(e => setError(e.response?.data?.error || 'Room not found'))
      .finally(() => setLoading(false));
  }, [code]);

  // Video setup
  useEffect(() => {
    if (!streamUrl || !videoRef.current) return;
    const video = videoRef.current;

    if (streamUrl.includes('.m3u8')) {
      import('hls.js').then(({ default: Hls }) => {
        if (Hls.isSupported()) {
          const hls = new Hls();
          hlsRef.current = hls;
          hls.loadSource(streamUrl);
          hls.attachMedia(video);
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = streamUrl;
        }
      });
    } else {
      video.src = streamUrl;
    }

    return () => { hlsRef.current?.destroy(); };
  }, [streamUrl]);

  // Activate selected subtitle track
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const t = setTimeout(() => {
      for (let i = 0; i < video.textTracks.length; i++) {
        const track = video.textTracks[i];
        track.mode = (selectedSub && track.label === selectedSub.label) ? 'showing' : 'disabled';
      }
    }, 80);
    return () => clearTimeout(t);
  }, [selectedSub]);

  // WebSocket
  useEffect(() => {
    if (!room) return;

    const ws = connectPartyWS(code, {
      onOpen:  ()    => setConnected(true),
      onClose: ()    => setConnected(false),
      onMessage: (msg) => {
        switch (msg.type) {
          case 'welcome':
            setIsHost(msg.is_host);
            break;
          case 'chat':
            setMessages(ms => [...ms, { username: msg.username, body: msg.body, created_at: msg.ts }]);
            break;
          case 'join':
            setOnlineMembers(ms => [...new Set([...ms, msg.username])]);
            setMessages(ms => [...ms, { username: '—', body: `${msg.username} joined`, created_at: new Date().toISOString(), system: true }]);
            break;
          case 'leave':
            setOnlineMembers(ms => ms.filter(u => u !== msg.username));
            setMessages(ms => [...ms, { username: '—', body: `${msg.username} left`, created_at: new Date().toISOString(), system: true }]);
            break;
          case 'sync':
            if (videoRef.current && !isHost) {
              const video = videoRef.current;
              if (Math.abs(video.currentTime - msg.position) > 2) {
                video.currentTime = msg.position;
              }
              msg.is_playing ? video.play().catch(() => {}) : video.pause();
            }
            break;
          case 'room_ended':
            alert('The host ended this watch party.');
            navigate('/');
            break;
        }
      },
    });
    wsRef.current = ws;

    // Ping keepalive
    const ping = setInterval(() => ws.send({ type: 'ping' }), 30000);
    return () => { clearInterval(ping); ws.close(); };
  }, [room, code, isHost, navigate]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Host video event handlers
  const handlePlay = useCallback(() => {
    if (!isHost || !videoRef.current) return;
    wsRef.current?.send({ type: 'sync', position: videoRef.current.currentTime, is_playing: true });
  }, [isHost]);

  const handlePause = useCallback(() => {
    if (!isHost || !videoRef.current) return;
    wsRef.current?.send({ type: 'sync', position: videoRef.current.currentTime, is_playing: false });
  }, [isHost]);

  const handleSeeked = useCallback(() => {
    if (!isHost || !videoRef.current) return;
    wsRef.current?.send({ type: 'sync', position: videoRef.current.currentTime, is_playing: !videoRef.current.paused });
  }, [isHost]);

  const sendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    wsRef.current?.send({ type: 'chat', body: chatInput.trim() });
    setChatInput('');
  };

  const handleEndRoom = async () => {
    if (!confirm('End this watch party for everyone?')) return;
    await endRoom(code);
    navigate('/');
  };

  if (loading) return (
    <><Navbar /><div style={{ textAlign: 'center', padding: '80px', color: 'var(--lb-text)' }}>Loading room…</div></>
  );

  if (error) return (
    <><Navbar /><div style={{ textAlign: 'center', padding: '80px', color: 'var(--lb-danger)' }}>{error}</div></>
  );

  return (
    <>
      <Navbar />
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>

        {/* Main column */}
        <div style={{ flex: '1 1 640px', minWidth: 0 }}>

          {/* Room header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <div style={{ ...LABEL, marginBottom: '2px' }}>
                Watch Party · Room <span style={{ color: 'var(--lb-text-2)', fontFamily: 'monospace', letterSpacing: '0.15em' }}>{code}</span>
              </div>
              <h2 style={{ margin: 0, color: 'var(--lb-text-bright)', fontSize: '18px' }}>{room.title}</h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '3px',
                background: connected ? 'rgba(0,224,84,0.12)' : 'rgba(248,113,113,0.12)',
                color: connected ? 'var(--lb-green)' : 'var(--lb-danger)',
              }}>
                {connected ? '● Live' : '○ Connecting'}
              </span>
              {isHost && (
                <button onClick={handleEndRoom} style={{
                  padding: '5px 12px', borderRadius: '3px', border: '1px solid rgba(248,113,113,0.3)',
                  background: 'rgba(248,113,113,0.1)', color: '#f87171',
                  fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                }}>End party</button>
              )}
            </div>
          </div>

          {/* Video player */}
          <div style={{ background: '#000', borderRadius: '6px', overflow: 'hidden', position: 'relative', aspectRatio: '16/9' }}>
            {streamUrl ? (
              <video
                ref={videoRef}
                controls={isHost}
                crossOrigin="anonymous"
                style={{ width: '100%', height: '100%', display: 'block' }}
                onPlay={handlePlay}
                onPause={handlePause}
                onSeeked={handleSeeked}
              >
                {selectedSub && (
                  <track
                    key={selectedSub.url}
                    kind="subtitles"
                    label={selectedSub.label}
                    srcLang={selectedSub.language}
                    src={selectedSub.url}
                    default
                  />
                )}
              </video>
            ) : (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: '12px',
              }}>
                {room.backdrop_path && (
                  <img src={`${BACKDROP}${room.backdrop_path}`} alt=""
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.2 }} />
                )}
                <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.4 }}>▶</div>
                  <div style={{ color: 'var(--lb-text-2)', fontWeight: 600 }}>{room.title}</div>
                  <div style={{ color: 'var(--lb-text-muted)', fontSize: '12px', marginTop: '6px' }}>
                    {room.jellyfin_id ? 'Stream not available' : 'Not yet streamable — upload a video file in the admin panel'}
                  </div>
                  <Link to={`/movie/${room.tmdb_id}`} style={{
                    display: 'inline-block', marginTop: '16px', padding: '7px 16px',
                    background: 'var(--lb-bg-3)', color: 'var(--lb-text)', borderRadius: '4px',
                    textDecoration: 'none', fontSize: '12px',
                  }}>View movie page</Link>
                </div>
              </div>
            )}
          </div>

          {streamUrl && (
            <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {!isHost && (
                <div style={{ flex: 1, padding: '8px 14px', background: 'var(--lb-bg-2)', borderRadius: '4px', fontSize: '12px', color: 'var(--lb-text-muted)' }}>
                  ◎ Synchronized by the host — your controls are disabled.
                </div>
              )}
              {subtitles.length > 0 && (
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <button
                    onClick={() => setShowSubMenu(m => !m)}
                    style={{
                      padding: '7px 14px', borderRadius: '4px',
                      border: `1px solid ${selectedSub ? 'var(--lb-green)' : 'var(--lb-border-2)'}`,
                      background: selectedSub ? 'rgba(0,224,84,0.08)' : 'var(--lb-bg-2)',
                      color: selectedSub ? 'var(--lb-green)' : 'var(--lb-text)',
                      fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                      letterSpacing: '0.05em', textTransform: 'uppercase',
                    }}
                  >
                    CC {selectedSub ? `· ${selectedSub.label}` : ''}
                  </button>
                  {showSubMenu && (
                    <div style={{
                      position: 'absolute', bottom: '110%', left: 0,
                      background: 'rgba(18,18,18,0.97)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '6px', minWidth: 190,
                      padding: '6px 0',
                      boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
                      zIndex: 50,
                    }}>
                      <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', padding: '4px 14px 6px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Subtitles
                      </div>
                      {[null, ...subtitles].map(sub => (
                        <button
                          key={sub ? sub.url : '__off'}
                          onClick={() => { setSelectedSub(sub); setShowSubMenu(false); }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            width: '100%', padding: '7px 14px',
                            background: 'none', border: 'none',
                            color: (selectedSub?.url === sub?.url || (!selectedSub && !sub)) ? '#fff' : 'rgba(255,255,255,0.5)',
                            fontSize: 13, cursor: 'pointer', textAlign: 'left',
                          }}
                        >
                          <span style={{
                            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                            background: (selectedSub?.url === sub?.url || (!selectedSub && !sub)) ? '#fff' : 'transparent',
                            border: '1px solid rgba(255,255,255,0.35)',
                          }} />
                          {sub ? `${sub.label} (${sub.language})` : 'Off'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Online members */}
          <div style={{ background: 'var(--lb-bg-2)', border: '1px solid var(--lb-border)', borderRadius: '6px', padding: '14px 16px' }}>
            <div style={{ ...LABEL, marginBottom: '10px' }}>Watching ({onlineMembers.length})</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {onlineMembers.map(u => (
                <span key={u} style={{
                  fontSize: '11px', fontWeight: 600, padding: '3px 9px', borderRadius: '12px',
                  background: u === room.host_username ? 'rgba(0,224,84,0.12)' : 'var(--lb-bg-3)',
                  color: u === room.host_username ? 'var(--lb-green)' : 'var(--lb-text-2)',
                }}>
                  {u}{u === room.host_username ? ' ♦' : ''}
                </span>
              ))}
              {onlineMembers.length === 0 && <span style={{ fontSize: '12px', color: 'var(--lb-text-muted)' }}>Just you</span>}
            </div>
          </div>

          {/* Invite */}
          <div style={{ background: 'var(--lb-bg-2)', border: '1px solid var(--lb-border)', borderRadius: '6px', padding: '14px 16px' }}>
            <div style={{ ...LABEL, marginBottom: '8px' }}>Invite friends</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input readOnly value={window.location.href} style={{ flex: 1, fontSize: '11px', minWidth: 0 }} onClick={e => e.target.select()} />
              <button onClick={() => navigator.clipboard?.writeText(window.location.href)} style={{
                padding: '5px 10px', borderRadius: '3px', border: 'none', flexShrink: 0,
                background: 'var(--lb-bg-3)', color: 'var(--lb-text)', cursor: 'pointer', fontSize: '11px',
              }}>Copy</button>
            </div>
          </div>

          {/* Chat */}
          <div style={{ background: 'var(--lb-bg-2)', border: '1px solid var(--lb-border)', borderRadius: '6px', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 300, maxHeight: 460 }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--lb-border)' }}>
              <div style={LABEL}>Live chat</div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {messages.map((m, i) => (
                <div key={i} style={{ fontSize: '12px', lineHeight: 1.4 }}>
                  {m.system ? (
                    <span style={{ color: 'var(--lb-text-muted)', fontStyle: 'italic' }}>{m.body}</span>
                  ) : (
                    <>
                      <span style={{ fontWeight: 700, color: m.username === user?.username ? 'var(--lb-green)' : 'var(--lb-text-2)' }}>{m.username}: </span>
                      <span style={{ color: 'var(--lb-text)' }}>{m.body}</span>
                    </>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={sendChat} style={{ padding: '10px 12px', borderTop: '1px solid var(--lb-border)', display: 'flex', gap: '8px' }}>
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Say something…"
                disabled={!connected}
                style={{ flex: 1, fontSize: '12px', padding: '6px 10px', minWidth: 0 }}
              />
              <button type="submit" disabled={!chatInput.trim() || !connected} style={{
                padding: '6px 12px', borderRadius: '3px', border: 'none', flexShrink: 0,
                background: 'var(--lb-green)', color: 'var(--lb-bg)',
                fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                opacity: !chatInput.trim() || !connected ? 0.5 : 1,
              }}>Send</button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
