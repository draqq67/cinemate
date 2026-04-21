import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/ui/Navbar';
import MovieCard from '../components/ui/MovieCard';
import client from '../api/client';

export default function WatchlistPage() {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client.get('/users/me/wishlist?limit=100')
      .then(({ data }) => setItems(data.items || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const removeFromWatchlist = async (tmdbId) => {
    try {
      await client.post(`/movies/${tmdbId}/watchlist`);
      setItems(prev => prev.filter(m => m.tmdb_id !== tmdbId));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background-primary)' }}>
      <Navbar />
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px 60px' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 500, marginBottom: '4px' }}>My watchlist</h1>
            <p style={{ fontSize: '13px', color: 'var(--color-text-tertiary)' }}>
              {loading ? 'Loading...' : `${items.length} ${items.length === 1 ? 'movie' : 'movies'} saved`}
            </p>
          </div>
          <Link
            to="/browse"
            style={{ fontSize: '13px', color: 'var(--color-text-info)', textDecoration: 'none' }}
          >
            + Browse movies
          </Link>
        </div>

        {loading ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: '12px',
          }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{
                aspectRatio: '2/3',
                background: 'var(--color-background-secondary)',
                borderRadius: '8px',
                border: '0.5px solid var(--color-border-tertiary)',
              }} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '80px 0',
            color: 'var(--color-text-tertiary)',
          }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>🎬</div>
            <div style={{ fontSize: '15px', fontWeight: 500, marginBottom: '6px', color: 'var(--color-text-primary)' }}>
              Your watchlist is empty
            </div>
            <div style={{ fontSize: '13px', marginBottom: '20px' }}>
              Save movies you want to watch later
            </div>
            <Link
              to="/browse"
              style={{
                padding: '9px 20px', background: '#185FA5', color: '#fff',
                borderRadius: '6px', textDecoration: 'none', fontSize: '13px', fontWeight: 500,
              }}
            >
              Browse movies
            </Link>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: '12px',
          }}>
            {items.map((m, i) => (
              <div key={m.tmdb_id} style={{ position: 'relative' }}>
                <MovieCard movie={m} index={i} />
                <button
                  onClick={() => removeFromWatchlist(m.tmdb_id)}
                  title="Remove from watchlist"
                  style={{
                    position: 'absolute', top: '6px', right: '6px',
                    width: '24px', height: '24px', borderRadius: '50%',
                    background: 'var(--color-background-primary)',
                    border: '0.5px solid var(--color-border-secondary)',
                    cursor: 'pointer', fontSize: '12px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--color-text-secondary)',
                    zIndex: 2,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}