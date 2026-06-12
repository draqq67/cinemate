import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../components/ui/Navbar';
import { useAuth } from '../hooks/useAuth';
import ErrorState from '../components/ui/ErrorState';
import { getList, toggleFollowList, getListFollowStatus, removeFromList } from '../api/lists';

const POSTER = 'https://image.tmdb.org/t/p/w300';
const LABEL  = {
  fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--lb-text-muted)',
};

export default function ListDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [list, setList] = useState(null);
  const [movies, setMovies] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [following, setFollowing]   = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setFetchError(false);
    getList(id)
      .then(r => { setList(r.data.list); setMovies(r.data.movies); })
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(() => {
    if (user && list) {
      getListFollowStatus(id).then(r => setFollowing(r.data.following)).catch(() => {});
    }
  }, [user, list]);

  const handleFollow = async () => {
    if (!user) return;
    setFollowLoading(true);
    try {
      const r = await toggleFollowList(id);
      setFollowing(r.data.following);
      setList(l => ({ ...l, follower_count: l.follower_count + (r.data.following ? 1 : -1) }));
    } finally { setFollowLoading(false); }
  };

  const handleRemove = async (tmdbId) => {
    await removeFromList(id, tmdbId);
    setMovies(ms => ms.filter(m => m.tmdb_id !== tmdbId));
  };

  const Shell = ({ children }) => (
    <div style={{ minHeight: '100vh', background: 'var(--lb-bg)' }}><Navbar />{children}</div>
  );

  if (loading) return (
    <Shell>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px var(--page-px)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="skeleton" style={{ height: 100, borderRadius: 6 }} />
        <div className="movie-grid">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton" style={{ aspectRatio: '2/3' }} />)}
        </div>
      </div>
    </Shell>
  );

  if (fetchError) return <Shell><ErrorState title="Could not load this list" onRetry={() => window.location.reload()} /></Shell>;

  if (!list) return <Shell><ErrorState title="List not found" /></Shell>;

  const isOwner = user?.id === list.user_id;

  return (
    <>
      <Navbar />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px' }}>

        {/* Header */}
        <div style={{ marginBottom: '40px' }}>
          <div style={{ ...LABEL, marginBottom: '4px' }}>
            List by <Link to={`/users/${list.user_id}`} style={{ color: 'var(--lb-green)', textDecoration: 'none' }}>{list.username}</Link>
          </div>
          <h1 style={{ margin: '0 0 12px', fontSize: '32px', color: 'var(--lb-text-bright)' }}>{list.title}</h1>
          {list.description && (
            <p style={{ color: 'var(--lb-text)', fontSize: '14px', lineHeight: 1.6, maxWidth: 680, margin: '0 0 16px' }}>{list.description}</p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: 'var(--lb-text-muted)' }}>{movies.length} films</span>
            <span style={{ fontSize: '12px', color: 'var(--lb-text-muted)' }}>{list.follower_count} followers</span>
            {user && !isOwner && (
              <button onClick={handleFollow} disabled={followLoading} style={{
                padding: '6px 16px', borderRadius: '4px', border: '1px solid var(--lb-border-2)',
                background: following ? 'var(--lb-green)' : 'var(--lb-bg-3)',
                color: following ? 'var(--lb-bg)' : 'var(--lb-text)',
                fontSize: '11px', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.05em',
              }}>
                {following ? 'Following' : 'Follow'}
              </button>
            )}
          </div>
        </div>

        {/* Movies grid */}
        {movies.length === 0 ? (
          <div style={{ color: 'var(--lb-text-muted)', textAlign: 'center', padding: '60px' }}>No films in this list yet.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '16px' }}>
            {movies.map((m, idx) => (
              <div key={m.tmdb_id} style={{ position: 'relative' }}>
                <Link to={`/movie/${m.tmdb_id}`} style={{ textDecoration: 'none' }}>
                  <div style={{ position: 'relative', transition: 'transform 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-3px)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
                    {m.poster_path
                      ? <img src={`${POSTER}${m.poster_path}`} alt={m.title}
                          style={{ width: '100%', borderRadius: '4px', display: 'block' }} />
                      : <div style={{ height: 195, background: 'var(--lb-bg-3)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--lb-text-muted)', fontSize: '11px' }}>No poster</div>
                    }
                    <div style={{
                      position: 'absolute', top: 6, left: 6, background: 'rgba(0,0,0,0.7)',
                      borderRadius: '3px', padding: '2px 6px', fontSize: '10px', fontWeight: 700, color: 'var(--lb-text-muted)',
                    }}>
                      #{idx + 1}
                    </div>
                  </div>
                  <div style={{ padding: '6px 2px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--lb-text-2)', lineHeight: 1.3 }}>{m.title}</div>
                    <div style={{ fontSize: '10px', color: 'var(--lb-text-muted)' }}>{m.year}</div>
                  </div>
                </Link>
                {isOwner && (
                  <button onClick={() => handleRemove(m.tmdb_id)} style={{
                    position: 'absolute', top: 4, right: 4,
                    background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: '3px',
                    color: '#f87171', cursor: 'pointer', fontSize: '12px',
                    width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>✕</button>
                )}
              </div>
            ))}
          </div>
        )}

        {isOwner && (
          <div style={{ marginTop: '32px', padding: '16px', background: 'var(--lb-bg-2)', border: '1px solid var(--lb-border)', borderRadius: '6px', fontSize: '13px', color: 'var(--lb-text-muted)' }}>
            Add movies to this list from any movie page via the "Add to list" button.
          </div>
        )}
      </div>
    </>
  );
}
