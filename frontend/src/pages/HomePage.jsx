import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/ui/Navbar';
import MovieCard from '../components/ui/MovieCard';
import { useAuth } from '../hooks/useAuth';
import { getRecommendations, getStreamableMovies } from '../api/movies';
import client from '../api/client';

const SECTION_LABEL = {
  fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--lb-text)',
};

function SectionHeader({ title, badge, to = '/browse' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ ...SECTION_LABEL, color: '#fff' }}>{title}</span>
        {badge && (
          <span style={{
            fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '2px',
            background: 'var(--lb-green-dim)', color: 'var(--lb-green)',
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            {badge}
          </span>
        )}
      </div>
      <Link to={to} style={{ ...SECTION_LABEL, color: 'var(--lb-green)', textDecoration: 'none', fontSize: '10px' }}>
        More →
      </Link>
    </div>
  );
}

function Section({ title, badge, to = '/browse', movies, loading }) {
  if (!loading && movies.length === 0) return null;
  return (
    <div style={{ marginBottom: '48px' }}>
      <SectionHeader title={title} badge={badge} to={to} />
      <div className="movie-grid">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ aspectRatio: '2/3' }} />
            ))
          : movies.map((m) => <MovieCard key={m.tmdb_id} movie={m} />)
        }
      </div>
    </div>
  );
}

function ContinueCard({ item }) {
  const pct = Math.min(100, Math.round((item.progress_s / (item.duration || 1)) * 100));
  const remaining = Math.round(((item.duration || 0) - item.progress_s) / 60);
  const [hovered, setHovered] = useState(false);

  return (
    <Link to={`/movie/${item.tmdb_id}`} style={{ textDecoration: 'none' }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex', gap: '12px', alignItems: 'center',
          background: hovered ? 'var(--lb-bg-3)' : 'var(--lb-bg-2)',
          border: '1px solid var(--lb-border)',
          borderRadius: '4px', padding: '10px', cursor: 'pointer',
          transition: 'background 0.15s',
        }}>
        <div style={{
          width: 44, height: 62, borderRadius: '3px', flexShrink: 0,
          background: 'var(--lb-bg-3)', overflow: 'hidden',
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
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {item.title}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--lb-text-muted)', marginBottom: '7px' }}>
            {remaining > 0 ? `${remaining}m left` : 'Completed'}
          </div>
          <div style={{ height: '2px', background: 'var(--lb-bg-4)', borderRadius: '1px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'var(--lb-green)', borderRadius: '1px', transition: 'width 0.3s' }} />
          </div>
        </div>
        <div style={{
          width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
          border: '1px solid var(--lb-border-2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: 0, height: 0, borderTop: '4px solid transparent', borderBottom: '4px solid transparent', borderLeft: `7px solid var(--lb-text)`, marginLeft: '2px' }} />
        </div>
      </div>
    </Link>
  );
}

function StatCard({ value, label }) {
  return (
    <div style={{
      background: 'var(--lb-bg-2)', border: '1px solid var(--lb-border)',
      borderRadius: '4px', padding: '14px 16px', textAlign: 'center',
    }}>
      <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--lb-green)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--lb-text-muted)', marginTop: '5px' }}>{label}</div>
    </div>
  );
}

const GENRES = ['Action', 'Drama', 'Comedy', 'Thriller', 'Sci-Fi', 'Horror', 'Romance', 'Animation', 'Documentary', 'Crime'];

export default function HomePage() {
  const { user } = useAuth();

  const [popular, setPopular]           = useState([]);
  const [topRated, setTopRated]         = useState([]);
  const [newest, setNewest]             = useState([]);
  const [continueWatching, setContinue] = useState([]);
  const [stats, setStats]               = useState(null);
  const [loading, setLoading]           = useState(true);
  const [streamable, setStreamable]      = useState([]);
  const [streamLoading, setStreamLoading] = useState(true);
  const [recommendations, setRecs]      = useState([]);
  const [recsStrategy, setRecsStrategy] = useState('');
  const [recsLoading, setRecsLoading]   = useState(false);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const [pop, top, new_] = await Promise.all([
          client.get('/movies/tmdb/popular'),
          client.get('/movies/tmdb/top_rated'),
          client.get('/movies/tmdb/now_playing'),
        ]);
        setPopular(pop.data.movies);
        setTopRated(top.data.movies);
        setNewest(new_.data.movies);

        // Streamable movies load independently (DB query, fast)
        getStreamableMovies('popularity', 12)
          .then(({ data }) => setStreamable(data.movies || []))
          .catch(() => {})
          .finally(() => setStreamLoading(false));

        if (user) {
          const [history, statsRes] = await Promise.all([
            client.get('/users/me/history?limit=4'),
            client.get('/users/me/stats'),
          ]);
          setContinue(history.data.items || []);
          setStats(statsRes.data);

          setRecsLoading(true);
          getRecommendations()
            .then(({ data }) => { setRecs(data.movies || []); setRecsStrategy(data.strategy || ''); })
            .catch(() => {})
            .finally(() => setRecsLoading(false));
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
    <div style={{ minHeight: '100vh', background: 'var(--lb-bg)' }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>

      <Navbar />

      {/* Hero */}
      <div style={{
        background: 'linear-gradient(180deg, var(--lb-nav-bg) 0%, var(--lb-bg) 100%)',
        borderBottom: '1px solid var(--lb-border)',
        padding: '40px 32px',
      }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--lb-text-muted)', marginBottom: '6px' }}>
                  {greeting}
                </div>
                <h1 style={{ fontSize: '28px', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
                  Welcome back, <span style={{ color: 'var(--lb-green)' }}>{user.username}</span>
                </h1>
                <p style={{ fontSize: '14px', color: 'var(--lb-text)', marginTop: '6px' }}>
                  What are you watching tonight?
                </p>
              </div>
              {stats && (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <StatCard value={stats.watched}  label="Watched" />
                  <StatCard value={stats.rated}    label="Rated" />
                  <StatCard value={stats.wishlist} label="Watchlist" />
                  <StatCard value={stats.avgRating ? Number(stats.avgRating).toFixed(1) : '—'} label="Avg ★" />
                </div>
              )}
            </div>
          ) : (
            <div style={{ maxWidth: '520px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--lb-green)', marginBottom: '12px' }}>
                Track films you've watched.
              </div>
              <h1 style={{ fontSize: '36px', fontWeight: 700, margin: '0 0 12px', lineHeight: 1.15 }}>
                Discover your next favourite film.
              </h1>
              <p style={{ fontSize: '15px', color: 'var(--lb-text)', marginBottom: '24px', lineHeight: 1.6 }}>
                Browse thousands of movies, rate what you've seen, and get personalised recommendations.
              </p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <Link to="/register" style={{
                  padding: '10px 22px', background: 'var(--lb-green)', color: 'var(--lb-bg)',
                  borderRadius: '4px', textDecoration: 'none', fontSize: '12px',
                  fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                }}>
                  Get started — it's free
                </Link>
                <Link to="/login" style={{
                  padding: '10px 20px', border: '1px solid var(--lb-border-2)',
                  borderRadius: '4px', textDecoration: 'none', fontSize: '12px',
                  fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
                  color: 'var(--lb-text)',
                }}>
                  Sign in
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 32px 80px' }}>

        {/* Continue watching */}
        {user && continueWatching.length > 0 && (
          <div style={{ marginBottom: '48px' }}>
            <SectionHeader title="Continue watching" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '480px' }}>
              {continueWatching.map(item => <ContinueCard key={item.movie_id} item={item} />)}
            </div>
          </div>
        )}

        {/* Genre chips */}
        <div style={{ marginBottom: '48px' }}>
          <div style={{ ...SECTION_LABEL, marginBottom: '14px' }}>Browse by genre</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {GENRES.map(g => (
              <Link
                key={g}
                to={`/browse?genre=${g}`}
                style={{
                  fontSize: '11px', fontWeight: 600, padding: '5px 14px', borderRadius: '2px',
                  border: '1px solid var(--lb-border-2)',
                  color: 'var(--lb-text)', textDecoration: 'none',
                  background: 'var(--lb-bg-2)',
                  letterSpacing: '0.04em',
                  transition: 'color 0.15s, border-color 0.15s, background 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.color = 'var(--lb-green)';
                  e.currentTarget.style.borderColor = 'var(--lb-green)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = 'var(--lb-text)';
                  e.currentTarget.style.borderColor = 'var(--lb-border-2)';
                }}
              >
                {g}
              </Link>
            ))}
          </div>
        </div>

        {/* Now streaming — only shown when there are streamable movies */}
        {(streamLoading || streamable.length > 0) && (
          <Section
            title="Now streaming"
            badge="▶ Watch now"
            to="/browse?streamable=true"
            movies={streamable}
            loading={streamLoading}
          />
        )}

        {/* Personalised recommendations */}
        {user && (recsLoading || recommendations.length > 0) && (
          <Section
            title="For you"
            badge={recsStrategy && !recsLoading ? recsStrategy : undefined}
            movies={recommendations}
            loading={recsLoading}
          />
        )}

        <Section title="Popular right now" movies={popular} loading={loading} />
        <Section title="Top rated" movies={topRated} loading={loading} />
        <Section title="Recently added" movies={newest} loading={loading} />

      </div>
    </div>
  );
}
