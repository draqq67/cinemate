import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import client from '../api/client';
import Navbar from '../components/ui/Navbar';
import MovieCard from '../components/ui/MovieCard';
import ErrorState from '../components/ui/ErrorState';

const LABEL = {
  fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--lb-text-muted)',
  marginBottom: '12px', display: 'block',
};

function StatBox({ value, label }) {
  return (
    <div style={{
      background: 'var(--lb-bg-2)', border: '1px solid var(--lb-border)',
      borderRadius: '4px', padding: '16px', textAlign: 'center',
    }}>
      <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--lb-green)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--lb-text-muted)', marginTop: '6px' }}>{label}</div>
    </div>
  );
}

export default function ProfilePage() {
  const { user } = useAuth();
  const [history, setHistory]       = useState([]);
  const [favourites, setFavourites] = useState([]);
  const [wishlist, setWishlist]     = useState([]);
  const [comments, setComments]     = useState([]);
  const [stats, setStats]           = useState({ watched: 0, rated: 0, wishlist: 0, avgRating: 0 });
  const [loading, setLoading]       = useState(true);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      client.get('/users/me/history?limit=3'),
      client.get('/users/me/favourites?limit=5'),
      client.get('/users/me/wishlist?limit=5'),
      client.get('/users/me/comments?limit=3'),
      client.get('/users/me/stats'),
    ]).then(([h, f, w, c, s]) => {
      setHistory(h.data.items || []);
      setFavourites(f.data.items || []);
      setWishlist(w.data.items || []);
      setComments(c.data.items || []);
      setStats(s.data);
      setLoading(false);
    }).catch(() => { setFetchError(true); setLoading(false); });
  }, [user]);

  if (!user) return null;

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--lb-bg)' }}>
      <Navbar />
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '40px var(--page-px)', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="skeleton" style={{ height: 120, borderRadius: 8 }} />
        <div className="skeleton" style={{ height: 80, borderRadius: 6 }} />
        <div className="skeleton" style={{ height: 200, borderRadius: 6 }} />
      </div>
    </div>
  );

  if (fetchError) return (
    <div style={{ minHeight: '100vh', background: 'var(--lb-bg)' }}>
      <Navbar />
      <ErrorState title="Could not load profile" onRetry={() => window.location.reload()} />
    </div>
  );

  const joined = new Date(user.created_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--lb-bg)' }}>
      <Navbar />
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* Profile header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '20px',
          marginBottom: '32px', paddingBottom: '28px',
          borderBottom: '1px solid var(--lb-border)',
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'var(--lb-bg-3)', border: '3px solid var(--lb-green)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '22px', fontWeight: 700, color: 'var(--lb-green)', flexShrink: 0,
          }}>
            {user.username.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#fff', marginBottom: '3px' }}>{user.username}</div>
            <div style={{ fontSize: '12px', color: 'var(--lb-text-muted)' }}>
              {user.email} · Member since {joined}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '40px' }}>
          <StatBox value={stats.watched}  label="Watched" />
          <StatBox value={stats.rated}    label="Rated" />
          <StatBox value={stats.wishlist} label="Watchlist" />
          <StatBox value={stats.avgRating ? Number(stats.avgRating).toFixed(1) : '—'} label="Avg ★" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>

          {/* Left column */}
          <div>
            <span style={LABEL}>Continue watching</span>
            {history.length === 0
              ? <div style={{ fontSize: '13px', color: 'var(--lb-text-muted)', marginBottom: '28px' }}>Nothing in progress yet.</div>
              : history.map(item => (
                <Link key={item.movie_id} to={`/movie/${item.tmdb_id}`} style={{ textDecoration: 'none' }}>
                  <div style={{
                    display: 'flex', gap: '10px', alignItems: 'center',
                    background: 'var(--lb-bg-2)', border: '1px solid var(--lb-border)',
                    borderRadius: '4px', padding: '10px', marginBottom: '8px',
                  }}>
                    <div style={{ width: 36, height: 50, background: 'var(--lb-bg-3)', borderRadius: '3px', flexShrink: 0, overflow: 'hidden' }}>
                      {item.poster_path && <img src={`https://image.tmdb.org/t/p/w92${item.poster_path}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
                      <div style={{ fontSize: '11px', color: 'var(--lb-text-muted)', marginBottom: '7px' }}>
                        {Math.round(((item.duration || 0) - item.progress_s) / 60)}m left
                      </div>
                      <div style={{ height: '2px', background: 'var(--lb-bg-4)', borderRadius: '1px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, Math.round((item.progress_s / (item.duration || 1)) * 100))}%`, background: 'var(--lb-green)' }} />
                      </div>
                    </div>
                  </div>
                </Link>
              ))
            }

            <span style={{ ...LABEL, marginTop: '24px' }}>Recent comments</span>
            {comments.length === 0
              ? <div style={{ fontSize: '13px', color: 'var(--lb-text-muted)' }}>No comments yet.</div>
              : comments.map(c => (
                <div key={c.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--lb-border)' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--lb-text-2)' }}>{c.movie_title}</div>
                  <div style={{ fontSize: '12px', color: 'var(--lb-text)', margin: '4px 0', fontStyle: 'italic' }}>"{c.body}"</div>
                  <div style={{ fontSize: '10px', color: 'var(--lb-text-muted)' }}>
                    {new Date(c.created_at).toLocaleDateString()}
                    {c.score && <span style={{ color: 'var(--lb-orange)' }}> · ★ {c.score}</span>}
                  </div>
                </div>
              ))
            }
          </div>

          {/* Right column */}
          <div>
            <span style={LABEL}>Favourite films</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', marginBottom: '32px' }}>
              {favourites.length === 0
                ? <div style={{ fontSize: '13px', color: 'var(--lb-text-muted)', gridColumn: 'span 5' }}>No favourites yet. Rate films 8+ to add them.</div>
                : favourites.map((m) => <MovieCard key={m.tmdb_id || m.id} movie={m} />)
              }
            </div>

            <span style={LABEL}>Watchlist</span>
            {wishlist.length === 0
              ? <div style={{ fontSize: '13px', color: 'var(--lb-text-muted)' }}>Nothing saved yet.</div>
              : wishlist.map(m => (
                <Link key={m.tmdb_id || m.id} to={`/movie/${m.tmdb_id}`} style={{ textDecoration: 'none' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'var(--lb-bg-2)', border: '1px solid var(--lb-border)',
                    borderRadius: '4px', padding: '10px 14px', marginBottom: '6px',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--lb-border-2)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--lb-border)'}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>{m.title}</div>
                      <div style={{ fontSize: '11px', color: 'var(--lb-text-muted)', marginTop: '2px' }}>{m.genres?.[0]} · {m.year}</div>
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--lb-green)', fontWeight: 600 }}>→</div>
                  </div>
                </Link>
              ))
            }
          </div>
        </div>
      </div>
    </div>
  );
}
