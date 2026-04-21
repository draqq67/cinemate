import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/ui/Navbar';
import MovieCard from '../components/ui/MovieCard';
import { useAuth } from '../hooks/useAuth';
import { getMovies } from '../api/movies';
import client from '../api/client';

function Section({ title, badge, movies, loading }) {
  if (!loading && movies.length === 0) return null;

  return (
    <div style={{ marginBottom: '40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--color-text-primary)' }}>{title}</span>
          {badge && (
            <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 7px', borderRadius: '10px', background: '#EAF3DE', color: '#27500A' }}>
              {badge}
            </span>
          )}
        </div>
        <Link to="/browse" style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', textDecoration: 'none' }}>
          See all
        </Link>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: '12px',
      }}>
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{
                aspectRatio: '2/3',
                background: 'var(--color-background-secondary)',
                borderRadius: '8px',
                border: '0.5px solid var(--color-border-tertiary)',
                animation: 'pulse 1.5s ease-in-out infinite',
              }} />
            ))
          : movies.map((m, i) => <MovieCard key={m.tmdb_id} movie={m} index={i} />)
        }
      </div>
    </div>
  );
}

function ContinueCard({ item }) {
  const pct = Math.round((item.progress_s / (item.duration || 1)) * 100);
  const remaining = Math.round(((item.duration || 0) - item.progress_s) / 60);

  return (
    <Link to={`/movie/${item.tmdb_id}`} style={{ textDecoration: 'none' }}>
      <div style={{
        display: 'flex', gap: '12px', alignItems: 'center',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: '8px', padding: '10px', cursor: 'pointer',
      }}>
        <div style={{
          width: 48, height: 68, borderRadius: '5px', flexShrink: 0,
          background: 'var(--color-background-secondary)',
          overflow: 'hidden', border: '0.5px solid var(--color-border-tertiary)',
        }}>
          {item.poster_path && (
            <img
              src={`https://image.tmdb.org/t/p/w92${item.poster_path}`}
              alt={item.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {item.title}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginBottom: '6px' }}>
            {remaining > 0 ? `${remaining}m left` : 'Completed'}
          </div>
          <div style={{ height: '3px', background: 'var(--color-border-tertiary)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: '#378ADD', borderRadius: '2px' }} />
          </div>
        </div>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          border: '0.5px solid var(--color-border-secondary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: 0, height: 0, borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderLeft: `8px solid var(--color-text-secondary)`, marginLeft: '2px' }} />
        </div>
      </div>
    </Link>
  );
}

function StatCard({ value, label }) {
  return (
    <div style={{ background: 'var(--color-background-secondary)', borderRadius: '8px', padding: '12px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: '20px', fontWeight: 500, color: 'var(--color-text-primary)' }}>{value}</div>
      <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>{label}</div>
    </div>
  );
}

export default function HomePage() {
  const { user } = useAuth();

  const [popular, setPopular]         = useState([]);
  const [topRated, setTopRated]       = useState([]);
  const [newest, setNewest]           = useState([]);
  const [continueWatching, setContinue] = useState([]);
  const [stats, setStats]             = useState(null);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const [pop, top, new_] = await Promise.all([
          getMovies({ sort: 'popularity', limit: 12 }),
          getMovies({ sort: 'rating',     limit: 12, page: 1 }),
          getMovies({ sort: 'newest',     limit: 12 }),
        ]);
        setPopular(pop.data.movies);
        setTopRated(top.data.movies);
        setNewest(new_.data.movies);

        if (user) {
          const [history, statsRes] = await Promise.all([
            client.get('/users/me/history?limit=4'),
            client.get('/users/me/stats'),
          ]);
          setContinue(history.data.items || []);
          setStats(statsRes.data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [user]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background-primary)' }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      <Navbar />

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px 60px' }}>

        {/* Hero greeting */}
        <div style={{ marginBottom: '36px' }}>
          {user ? (
            <>
              <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {greeting}
              </div>
              <h1 style={{ fontSize: '26px', fontWeight: 500, marginBottom: '4px' }}>
                Welcome back, {user.username}
              </h1>
              <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                What are you watching tonight?
              </p>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: '28px', fontWeight: 500, marginBottom: '8px' }}>
                Discover your next favourite film
              </h1>
              <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
                Browse thousands of movies, rate what you've seen, and get personalised recommendations.
              </p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <Link to="/register" style={{ padding: '9px 20px', background: '#185FA5', color: '#fff', borderRadius: '6px', textDecoration: 'none', fontSize: '13px', fontWeight: 500 }}>
                  Get started
                </Link>
                <Link to="/login" style={{ padding: '8px 20px', border: '0.5px solid var(--color-border-secondary)', borderRadius: '6px', textDecoration: 'none', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                  Sign in
                </Link>
              </div>
            </>
          )}
        </div>

        {/* User stats + continue watching */}
        {user && (
          <div style={{ display: 'grid', gridTemplateColumns: continueWatching.length > 0 ? '1fr 1.4fr' : '1fr', gap: '20px', marginBottom: '40px' }}>
            {stats && (
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: '10px' }}>Your activity</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  <StatCard value={stats.watched}  label="Watched" />
                  <StatCard value={stats.rated}    label="Rated" />
                  <StatCard value={stats.wishlist} label="Wishlist" />
                  <StatCard value={stats.avgRating ? Number(stats.avgRating).toFixed(1) : '—'} label="Avg rating" />
                </div>
              </div>
            )}

            {continueWatching.length > 0 && (
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: '10px' }}>Continue watching</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {continueWatching.map(item => (
                    <ContinueCard key={item.movie_id} item={item} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Genre quick links */}
        <div style={{ marginBottom: '36px' }}>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: '10px' }}>Browse by genre</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {['Action', 'Drama', 'Comedy', 'Thriller', 'Sci-Fi', 'Horror', 'Romance', 'Animation', 'Documentary', 'Crime'].map(g => (
              <Link
                key={g}
                to={`/browse?genre=${g}`}
                style={{
                  fontSize: '12px', padding: '5px 12px', borderRadius: '20px',
                  border: '0.5px solid var(--color-border-tertiary)',
                  color: 'var(--color-text-secondary)', textDecoration: 'none',
                  background: 'var(--color-background-primary)',
                }}
              >
                {g}
              </Link>
            ))}
          </div>
        </div>

        {/* Movie sections */}
        <Section
          title="Popular right now"
          movies={popular}
          loading={loading}
        />

        <Section
          title="Top rated"
          movies={topRated}
          loading={loading}
        />

        <Section
          title="Recently added"
          movies={newest}
          loading={loading}
        />

      </div>
    </div>
  );
}