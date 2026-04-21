import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import client from '../api/client';
import Navbar from '../components/ui/Navbar';
import MovieCard from '../components/ui/MovieCard';

function StatBox({ value, label }) {
  return (
    <div style={{ background: 'var(--color-background-secondary)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
      <div style={{ fontSize: '22px', fontWeight: 500, color: 'var(--color-text-primary)' }}>{value}</div>
      <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>{label}</div>
    </div>
  );
}

export default function ProfilePage() {
  const { user } = useAuth();
  const [history, setHistory]     = useState([]);
  const [favourites, setFavourites] = useState([]);
  const [wishlist, setWishlist]   = useState([]);
  const [comments, setComments]   = useState([]);
  const [stats, setStats]         = useState({ watched: 0, rated: 0, wishlist: 0, avgRating: 0 });

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
    }).catch(console.error);
  }, [user]);

  if (!user) return null;

  const joined = new Date(user.created_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background-primary)' }}>
      <Navbar />
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px' }}>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px', marginBottom: '24px', paddingBottom: '24px', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#E6F1FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 500, color: '#0C447C', flexShrink: 0 }}>
            {user.username.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '20px', fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: '2px' }}>{user.username}</div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>{user.email} · Member since {joined}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '28px' }}>
          <StatBox value={stats.watched} label="Watched" />
          <StatBox value={stats.rated} label="Rated" />
          <StatBox value={stats.wishlist} label="Wishlist" />
          <StatBox value={stats.avgRating ? Number(stats.avgRating).toFixed(1) : '—'} label="Avg rating" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: '10px' }}>Continue watching</div>
            {history.length === 0
              ? <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)' }}>Nothing in progress yet.</div>
              : history.map(item => (
                <div key={item.movie_id} style={{ display: 'flex', gap: '10px', alignItems: 'center', border: '0.5px solid var(--color-border-tertiary)', borderRadius: '8px', padding: '10px', marginBottom: '8px' }}>
                  <div style={{ width: 36, height: 52, background: 'var(--color-background-secondary)', borderRadius: '4px', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)' }}>{item.title}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginBottom: '6px' }}>
                      {Math.round((item.duration - item.progress_s) / 60)}m left
                    </div>
                    <div style={{ height: '3px', background: 'var(--color-border-tertiary)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.round((item.progress_s / item.duration) * 100)}%`, background: '#378ADD', borderRadius: '2px' }} />
                    </div>
                  </div>
                </div>
              ))
            }

            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: '10px', marginTop: '20px' }}>Recent comments</div>
            {comments.length === 0
              ? <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)' }}>No comments yet.</div>
              : comments.map(c => (
                <div key={c.id} style={{ padding: '10px 0', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-primary)' }}>{c.movie_title}</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: '3px 0' }}>"{c.body}"</div>
                  <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>
                    {new Date(c.created_at).toLocaleDateString()}
                    {c.score && ` · ★ ${c.score}`}
                  </div>
                </div>
              ))
            }
          </div>

          <div>
            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: '10px' }}>Favourite films</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', marginBottom: '24px' }}>
              {favourites.length === 0
                ? <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)', gridColumn: 'span 5' }}>No favourites yet.</div>
                : favourites.map((m, i) => <MovieCard key={m.id} movie={m} index={i} />)
              }
            </div>

            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: '10px' }}>Wishlist</div>
            {wishlist.length === 0
              ? <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)' }}>Nothing saved yet.</div>
              : wishlist.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '0.5px solid var(--color-border-tertiary)', borderRadius: '8px', padding: '9px 12px', marginBottom: '6px' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)' }}>{m.title}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{m.genre?.[0]} · {m.year}</div>
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>saved</div>
                </div>
              ))
            }
          </div>
        </div>
      </div>
    </div>
  );
}