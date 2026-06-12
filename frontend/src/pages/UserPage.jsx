import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../components/ui/Navbar';
import { useAuth } from '../hooks/useAuth';
import client from '../api/client';
import { toggleFollow, getFollowStatus, getFollowers, getFollowing } from '../api/activity';
import { getOrCreateThread } from '../api/dm';

const POSTER = 'https://image.tmdb.org/t/p/w185';
const LABEL  = { fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--lb-text-muted)' };
const CARD   = { background: 'var(--lb-bg-2)', border: '1px solid var(--lb-border)', borderRadius: '6px', padding: '20px 24px' };

function UserListItem({ u, currentUserId }) {
  const [flw, setFlw] = useState(null);
  useEffect(() => {
    if (!currentUserId || currentUserId === u.id) return;
    getFollowStatus(u.id).then(r => setFlw(r.data.following)).catch(() => {});
  }, [u.id, currentUserId]);

  const toggle = async () => {
    const { data } = await toggleFollow(u.id);
    setFlw(data.following);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--lb-border)' }}>
      <Link to={`/user/${u.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, textDecoration: 'none' }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--lb-bg-3)', border: '2px solid var(--lb-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--lb-green)', flexShrink: 0 }}>
          {u.username.slice(0, 2).toUpperCase()}
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{u.username}</span>
      </Link>
      {currentUserId && currentUserId !== u.id && flw !== null && (
        <button onClick={toggle} style={{
          padding: '4px 12px', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer',
          border: `1px solid ${flw ? 'var(--lb-border-2)' : 'var(--lb-green)'}`,
          background: flw ? 'var(--lb-bg-3)' : 'var(--lb-green)',
          color: flw ? 'var(--lb-text)' : 'var(--lb-bg)', flexShrink: 0,
        }}>{flw ? '✓ Following' : '+ Follow'}</button>
      )}
    </div>
  );
}

export default function UserPage() {
  const { userId }            = useParams();
  const { user: me }          = useAuth();
  const [profile, setProfile] = useState(null);
  const [recents, setRecents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [tab, setTab]         = useState('films'); // films | followers | following
  const [followers, setFollowers] = useState(null);
  const [followingList, setFollowingList] = useState(null);

  useEffect(() => {
    setLoading(true);
    client.get(`/activity/users/${userId}/profile`)
      .then(({ data }) => {
        setProfile(data.user);
        setRecents(data.recent_ratings || []);
      })
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    if (!me || !userId || me.id === userId) return;
    getFollowStatus(userId).then(({ data }) => setFollowing(data.following)).catch(() => {});
  }, [me, userId]);

  const handleFollow = async () => {
    if (!me) return;
    setFollowBusy(true);
    try {
      const { data } = await toggleFollow(userId);
      setFollowing(data.following);
      setProfile(p => p ? { ...p, follower_count: parseInt(p.follower_count) + (data.following ? 1 : -1) } : p);
    } finally {
      setFollowBusy(false);
    }
  };

  const handleMessage = async () => {
    if (!me) return;
    const { data } = await getOrCreateThread(userId);
    window.location.href = `/messages`;
    sessionStorage.setItem('openThread', data.threadId);
  };

  // Load followers/following on demand
  const loadTab = (t) => {
    setTab(t);
    if (t === 'followers' && followers === null) {
      getFollowers(userId).then(r => setFollowers(r.data.followers || [])).catch(() => setFollowers([]));
    }
    if (t === 'following' && followingList === null) {
      getFollowing(userId).then(r => setFollowingList(r.data.following || [])).catch(() => setFollowingList([]));
    }
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--lb-bg)' }}>
      <Navbar />
      <div style={{ maxWidth: 800, margin: '40px auto', padding: '0 var(--page-px)' }}>
        <div className="skeleton" style={{ height: 160 }} />
      </div>
    </div>
  );

  if (!profile) return (
    <div style={{ minHeight: '100vh', background: 'var(--lb-bg)' }}>
      <Navbar />
      <div style={{ textAlign: 'center', padding: '80px', color: 'var(--lb-text-muted)' }}>User not found.</div>
    </div>
  );

  const isMe = me?.id === userId;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--lb-bg)' }}>
      <Navbar />
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px var(--page-px) 80px' }}>

        {/* Header */}
        <div style={{ ...CARD, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', flexShrink: 0,
            background: 'var(--lb-bg-3)', border: '3px solid var(--lb-green)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 700, color: 'var(--lb-green)',
          }}>
            {profile.username.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: '0 0 4px', fontSize: 22 }}>{profile.username}</h1>
            <div style={{ fontSize: 12, color: 'var(--lb-text-muted)' }}>
              Joined {new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </div>
          </div>
          {!isMe && me && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleFollow} disabled={followBusy} style={{
                padding: '7px 18px', borderRadius: '4px', fontSize: '12px', fontWeight: 700,
                letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer',
                background: following ? 'var(--lb-bg-3)' : 'var(--lb-green)',
                color: following ? 'var(--lb-text)' : 'var(--lb-bg)',
                border: `1px solid ${following ? 'var(--lb-border-2)' : 'var(--lb-green)'}`,
                opacity: followBusy ? 0.6 : 1,
              }}>
                {following ? '✓ Following' : '+ Follow'}
              </button>
              <button onClick={handleMessage} style={{
                padding: '7px 14px', borderRadius: '4px', fontSize: '12px', fontWeight: 600,
                background: 'var(--lb-bg-3)', border: '1px solid var(--lb-border-2)',
                color: 'var(--lb-text)', cursor: 'pointer',
              }}>
                💬 Message
              </button>
            </div>
          )}
          {isMe && (
            <Link to="/profile" style={{ fontSize: '12px', color: 'var(--lb-green)', textDecoration: 'none', fontWeight: 600 }}>
              Edit profile →
            </Link>
          )}
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12, marginBottom: 24 }}>
          {[
            ['Films watched', profile.watched],
            ['Films rated',   profile.rated],
            ['Avg rating',    profile.avg_rating ? `${profile.avg_rating}/10` : '—'],
            ['Followers',     profile.follower_count],
            ['Following',     profile.following_count],
          ].map(([label, value]) => (
            <div key={label} style={{ ...CARD, textAlign: 'center', padding: '14px' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--lb-green)', lineHeight: 1 }}>{value ?? '—'}</div>
              <div style={{ ...LABEL, marginTop: 5 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--lb-border)', marginBottom: 20 }}>
          {[
            ['films',     `Films (${recents.length > 0 ? profile.rated : '…'})`],
            ['followers', `Followers (${profile.follower_count})`],
            ['following', `Following (${profile.following_count})`],
          ].map(([id, label]) => (
            <button key={id} onClick={() => loadTab(id)} style={{
              padding: '8px 18px', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.07em', textTransform: 'uppercase',
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: `2px solid ${tab === id ? 'var(--lb-green)' : 'transparent'}`,
              color: tab === id ? 'var(--lb-green)' : 'var(--lb-text-muted)',
              marginBottom: -1,
            }}>{label}</button>
          ))}
        </div>

        {/* Films tab */}
        {tab === 'films' && recents.length > 0 && (
          <div style={CARD}>
            <div style={{ ...LABEL, marginBottom: 16 }}>Recent ratings</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 10 }}>
              {recents.map(m => (
                <Link key={m.tmdb_id} to={`/movie/${m.tmdb_id}`} title={`${m.title} — ${m.score}/10`}
                  style={{ textDecoration: 'none', position: 'relative' }}>
                  {m.poster_path
                    ? <img src={`${POSTER}${m.poster_path}`} alt={m.title}
                        style={{ width: '100%', borderRadius: 3, display: 'block', aspectRatio: '2/3', objectFit: 'cover' }} />
                    : <div style={{ aspectRatio: '2/3', background: 'var(--lb-bg-3)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--lb-text-muted)', textAlign: 'center', padding: 4 }}>{m.title}</div>
                  }
                  <div style={{ position: 'absolute', bottom: 4, right: 4, background: 'rgba(0,0,0,0.8)', borderRadius: 2, fontSize: 10, fontWeight: 700, color: 'var(--lb-orange)', padding: '1px 4px' }}>
                    {m.score}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Followers tab */}
        {tab === 'followers' && (
          <div style={CARD}>
            <div style={{ ...LABEL, marginBottom: 12 }}>Followers</div>
            {!followers ? (
              <div className="skeleton-pulse" style={{ height: 60, borderRadius: 4 }} />
            ) : followers.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--lb-text-muted)' }}>No followers yet.</div>
            ) : (
              followers.map(u => <UserListItem key={u.id} u={u} currentUserId={me?.id} />)
            )}
          </div>
        )}

        {/* Following tab */}
        {tab === 'following' && (
          <div style={CARD}>
            <div style={{ ...LABEL, marginBottom: 12 }}>Following</div>
            {!followingList ? (
              <div className="skeleton-pulse" style={{ height: 60, borderRadius: 4 }} />
            ) : followingList.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--lb-text-muted)' }}>Not following anyone yet.</div>
            ) : (
              followingList.map(u => <UserListItem key={u.id} u={u} currentUserId={me?.id} />)
            )}
          </div>
        )}
      </div>
    </div>
  );
}
