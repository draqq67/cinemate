import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/ui/Navbar';
import { useAuth } from '../hooks/useAuth';
import client from '../api/client';
import { toggleFollow, getFollowStatus } from '../api/activity';

const LABEL = { fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--lb-text-muted)' };

function UserCard({ u, currentUserId }) {
  const [following, setFollowing] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!currentUserId || currentUserId === u.id) return;
    getFollowStatus(u.id).then(({ data }) => setFollowing(data.following)).catch(() => {});
  }, [u.id, currentUserId]);

  const handleFollow = async () => {
    if (!currentUserId) return;
    setBusy(true);
    try {
      const { data } = await toggleFollow(u.id);
      setFollowing(data.following);
    } finally { setBusy(false); }
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 18px',
      background: 'var(--lb-bg-2)', border: '1px solid var(--lb-border)',
      borderRadius: 6,
    }}>
      <Link to={`/user/${u.id}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
          background: 'var(--lb-bg-3)', border: '2px solid var(--lb-green)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, fontWeight: 700, color: 'var(--lb-green)',
        }}>
          {u.username.slice(0, 2).toUpperCase()}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.username}</div>
          <div style={{ fontSize: 11, color: 'var(--lb-text-muted)', marginTop: 2 }}>
            {u.follower_count} follower{u.follower_count !== '1' ? 's' : ''} · {u.watched_count} films
          </div>
        </div>
      </Link>
      {currentUserId && currentUserId !== u.id && following !== null && (
        <button onClick={handleFollow} disabled={busy} style={{
          padding: '6px 16px', borderRadius: 4, fontSize: 11, fontWeight: 700,
          letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer',
          border: `1px solid ${following ? 'var(--lb-border-2)' : 'var(--lb-green)'}`,
          background: following ? 'var(--lb-bg-3)' : 'var(--lb-green)',
          color: following ? 'var(--lb-text)' : 'var(--lb-bg)',
          opacity: busy ? 0.6 : 1, flexShrink: 0,
        }}>
          {following ? '✓ Following' : '+ Follow'}
        </button>
      )}
    </div>
  );
}

export default function UsersPage() {
  const { user }            = useAuth();
  const [q, setQ]           = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = useCallback(async (query) => {
    if (!query.trim()) { setResults([]); setSearched(false); return; }
    setLoading(true);
    setSearched(true);
    try {
      const { data } = await client.get('/users/search', { params: { q: query, limit: 30 } });
      setResults(data.users || []);
    } finally { setLoading(false); }
  }, []);

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => search(q), 350);
    return () => clearTimeout(t);
  }, [q, search]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--lb-bg)' }}>
      <Navbar />
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '40px var(--page-px) 80px' }}>
        <div style={{ marginBottom: 28 }}>
          <div style={LABEL}>People</div>
          <h1 style={{ margin: '4px 0 0', fontSize: 'clamp(20px,4vw,26px)', fontWeight: 700 }}>Find users</h1>
        </div>

        <input
          autoFocus
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search by username…"
          style={{ width: '100%', fontSize: 15, padding: '12px 16px', borderRadius: 8, marginBottom: 24 }}
        />

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 72, borderRadius: 6 }} />
            ))}
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--lb-text-muted)', fontSize: 14 }}>
            No users found for "{q}".
          </div>
        )}

        {!loading && results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ ...LABEL, marginBottom: 4 }}>{results.length} result{results.length !== 1 ? 's' : ''}</div>
            {results.map(u => (
              <UserCard key={u.id} u={u} currentUserId={user?.id} />
            ))}
          </div>
        )}

        {!searched && !q && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--lb-text-muted)', fontSize: 14 }}>
            Type a username to search.
          </div>
        )}
      </div>
    </div>
  );
}
