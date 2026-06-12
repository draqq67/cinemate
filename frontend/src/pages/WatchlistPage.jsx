import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/ui/Navbar';
import MovieCard from '../components/ui/MovieCard';
import ErrorState from '../components/ui/ErrorState';
import client from '../api/client';

export default function WatchlistPage() {
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Retry is called from a button click (event handler) — setState here is fine
  const retry = () => {
    setLoading(true);
    setError(false);
    setRetryCount(c => c + 1);
  };

  useEffect(() => {
    let alive = true;
    client.get('/users/me/wishlist?limit=200')
      .then(({ data }) => {
        if (alive) { setItems(data.items || []); setLoading(false); }
      })
      .catch(() => {
        if (alive) { setError(true); setLoading(false); }
      });
    return () => { alive = false; };
  }, [retryCount]);

  const remove = async (tmdbId) => {
    try {
      await client.post(`/movies/${tmdbId}/watchlist`);
      setItems(prev => prev.filter(m => m.tmdb_id !== tmdbId));
    } catch { /* silent — user can retry */ }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--lb-bg)' }}>
      <Navbar />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px var(--page-px) 80px' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--lb-text-bright)' }}>My watchlist</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--lb-text-muted)' }}>
              {loading ? 'Loading…' : error ? '' : `${items.length} ${items.length === 1 ? 'film' : 'films'} saved`}
            </p>
          </div>
          <Link to="/browse" style={{ fontSize: 12, fontWeight: 600, color: 'var(--lb-green)', textDecoration: 'none' }}>
            + Browse films
          </Link>
        </div>

        {loading && (
          <div className="movie-grid">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ aspectRatio: '2/3' }} />
            ))}
          </div>
        )}

        {!loading && error && (
          <ErrorState title="Could not load watchlist" onRetry={retry} />
        )}

        {!loading && !error && items.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 14, opacity: 0.4 }}>🎬</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--lb-text-bright)', marginBottom: 8 }}>
              Your watchlist is empty
            </div>
            <div style={{ fontSize: 13, color: 'var(--lb-text-muted)', marginBottom: 20 }}>
              Save films you want to watch later
            </div>
            <Link to="/browse" style={{
              padding: '9px 22px', background: 'var(--lb-green)', color: 'var(--lb-bg)',
              borderRadius: 4, textDecoration: 'none', fontSize: 12, fontWeight: 700,
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>Browse films</Link>
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <div className="movie-grid">
            {items.map(m => (
              <div key={m.tmdb_id} style={{ position: 'relative' }}>
                <MovieCard movie={m} />
                <button onClick={() => remove(m.tmdb_id)} title="Remove from watchlist"
                  style={{
                    position: 'absolute', top: 6, right: 6,
                    width: 22, height: 22, borderRadius: '50%',
                    background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.2)',
                    cursor: 'pointer', fontSize: 11,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', zIndex: 2,
                  }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
