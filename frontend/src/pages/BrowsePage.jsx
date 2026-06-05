import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import Navbar from '../components/ui/Navbar';
import MovieCard from '../components/ui/MovieCard';
import { getMovies, getGenres, searchTmdb } from '../api/movies';
import ErrorState from '../components/ui/ErrorState';

const SORT_OPTIONS = [
  { value: 'popularity',  label: 'Most popular' },
  { value: 'rating',      label: 'Highest rated' },
  { value: 'newest',      label: 'Newest first' },
  { value: 'oldest',      label: 'Oldest first' },
  { value: 'vote_count',  label: 'Most voted' },
  { value: 'title',       label: 'Title A–Z' },
];

const LABEL = {
  fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--lb-text-muted)',
};

export default function BrowsePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [movies, setMovies]   = useState([]);
  const [genres, setGenres]   = useState([]);
  const [total, setTotal]     = useState(0);
  const [pages, setPages]     = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);
  const [source, setSource]   = useState('catalog'); // 'catalog' | 'tmdb'

  const search     = searchParams.get('search')     || '';
  const genre      = searchParams.get('genre')      || '';
  const sort       = searchParams.get('sort')       || 'popularity';
  const page       = parseInt(searchParams.get('page') || '1');
  const streamable = searchParams.get('streamable') || '';

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== 'page') next.delete('page');
    setSearchParams(next);
  };

  const fetchMovies = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      if (source === 'tmdb') {
        if (!search.trim()) {
          setMovies([]); setTotal(0); setPages(1);
          return;
        }
        const { data } = await searchTmdb(search, page);
        setMovies(data.movies);
        setTotal(data.total_results);
        setPages(data.total_pages);
      } else {
        const { data } = await getMovies({ search, genre, sort, page, limit: 24, streamable });
        setMovies(data.movies);
        setTotal(data.total);
        setPages(data.pages);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [search, genre, sort, page, source, streamable]);

  useEffect(() => { fetchMovies(); }, [fetchMovies]);
  useEffect(() => { getGenres().then(({ data }) => setGenres(data.genres)); }, []);

  const pillStyle = (active) => ({
    fontSize: '11px', fontWeight: 600, padding: '5px 13px', borderRadius: '2px',
    cursor: 'pointer', letterSpacing: '0.04em',
    border: `1px solid ${active ? 'var(--lb-green)' : 'var(--lb-border-2)'}`,
    background: active ? 'var(--lb-green-dim)' : 'var(--lb-bg-2)',
    color: active ? 'var(--lb-green)' : 'var(--lb-text)',
    whiteSpace: 'nowrap', userSelect: 'none',
  });

  const pageBtn = (active) => ({
    padding: '6px 13px', fontSize: '12px', fontWeight: 600, borderRadius: '3px',
    background: active ? 'var(--lb-green)' : 'var(--lb-bg-2)',
    color: active ? 'var(--lb-bg)' : 'var(--lb-text)',
    border: `1px solid ${active ? 'var(--lb-green)' : 'var(--lb-border-2)'}`,
    cursor: 'pointer',
  });

  const srcBtn = (active) => ({
    padding: '6px 16px', fontSize: '11px', fontWeight: 700,
    letterSpacing: '0.06em', textTransform: 'uppercase',
    border: '1px solid var(--lb-border-2)', cursor: 'pointer',
    background: active ? 'var(--lb-green)' : 'var(--lb-bg-2)',
    color: active ? 'var(--lb-bg)' : 'var(--lb-text)',
    transition: 'background 0.15s, color 0.15s',
  });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--lb-bg)' }}>
      <Navbar />
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>

        {/* Source toggle */}
        <div style={{ display: 'flex', gap: 0, marginBottom: '24px', borderRadius: '4px', overflow: 'hidden', width: 'fit-content', border: '1px solid var(--lb-border-2)' }}>
          <button style={{ ...srcBtn(source === 'catalog'), borderRadius: 0, border: 'none' }}
            onClick={() => { setSource('catalog'); setParam('page', ''); }}>
            Catalog
          </button>
          <button style={{ ...srcBtn(source === 'tmdb'), borderRadius: 0, border: 'none', borderLeft: '1px solid var(--lb-border-2)' }}
            onClick={() => { setSource('tmdb'); setParam('page', ''); }}>
            All films (TMDB)
          </button>
        </div>

        {/* Search + sort */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: '220px' }}>
            <div style={{ ...LABEL, marginBottom: '6px' }}>Search</div>
            <input
              type="text"
              placeholder={source === 'tmdb' ? 'Search all TMDB films…' : 'Search catalog…'}
              value={search}
              onChange={e => setParam('search', e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          {source === 'catalog' && (
            <div style={{ minWidth: '160px' }}>
              <div style={{ ...LABEL, marginBottom: '6px' }}>Sort by</div>
              <select value={sort} onChange={e => setParam('sort', e.target.value)} style={{ width: '100%' }}>
                {SORT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Genre filter — catalog only */}
        {source === 'catalog' && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '28px' }}>
            <span style={pillStyle(!genre)} onClick={() => setParam('genre', '')}>All</span>
            {genres.map(g => (
              <span key={g.id} style={pillStyle(genre === g.name)} onClick={() => setParam('genre', g.name)}>
                {g.name}
              </span>
            ))}
          </div>
        )}

        {/* TMDB mode hint */}
        {source === 'tmdb' && !search && (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--lb-text-muted)', fontSize: '14px' }}>
            Type a film title to search the full TMDB catalog.
          </div>
        )}

        {/* Results count */}
        {(source === 'catalog' || search) && (
          <div style={{ ...LABEL, marginBottom: '20px', color: 'var(--lb-text)' }}>
            {loading ? 'Loading…' : (
              <>
                {source === 'tmdb'
                  ? `${total.toLocaleString()} TMDB results`
                  : `${total.toLocaleString()} films`}
                {search && <span style={{ color: 'var(--lb-green)' }}> matching "{search}"</span>}
                {source === 'catalog' && genre && <span style={{ color: 'var(--lb-green)' }}> in {genre}</span>}
              </>
            )}
          </div>
        )}

        {/* Error state */}
        {error && (
          <ErrorState
            title="Could not load films"
            sub="The server may be unavailable. Check your connection and try again."
            onRetry={fetchMovies}
          />
        )}

        {/* Movie grid */}
        {!error && (loading && (source === 'catalog' || search) ? (
          <div className="movie-grid">
            {Array.from({ length: 24 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ aspectRatio: '2/3' }} />
            ))}
          </div>
        ) : movies.length === 0 && (source === 'catalog' || search) ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--lb-text-muted)', fontSize: '14px' }}>
            {source === 'tmdb'
              ? 'No results found on TMDB.'
              : 'No films found. Try a different search or filter.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '14px' }}>
            {movies.map((m) => (
              <div key={m.tmdb_id} style={{ position: 'relative' }}>
                <MovieCard movie={m} />
                {source === 'tmdb' && !m.inDb && (
                  <div style={{
                    position: 'absolute', top: 6, left: 6,
                    fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em',
                    padding: '2px 6px', borderRadius: '2px',
                    background: 'rgba(20,24,28,0.85)',
                    color: 'var(--lb-text-muted)',
                    textTransform: 'uppercase',
                  }}>
                    TMDB
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}

        {/* Pagination */}
        {pages > 1 && (source === 'catalog' || search) && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '36px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={() => setParam('page', page - 1)}
              disabled={page === 1}
              style={{ ...pageBtn(false), opacity: page === 1 ? 0.4 : 1 }}
            >
              ← Prev
            </button>
            {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
              const p = page <= 4 ? i + 1 : page - 3 + i;
              if (p < 1 || p > pages) return null;
              return (
                <button key={p} onClick={() => setParam('page', p)} style={pageBtn(p === page)}>
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => setParam('page', page + 1)}
              disabled={page === pages}
              style={{ ...pageBtn(false), opacity: page === pages ? 0.4 : 1 }}
            >
              Next →
            </button>
          </div>
        )}
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  );
}
