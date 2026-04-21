import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import Navbar from '../components/ui/Navbar';
import MovieCard from '../components/ui/MovieCard';
import { getMovies, getGenres } from '../api/movies';

const SORT_OPTIONS = [
  { value: 'popularity',  label: 'Most popular' },
  { value: 'rating',      label: 'Highest rated' },
  { value: 'newest',      label: 'Newest first' },
  { value: 'oldest',      label: 'Oldest first' },
  { value: 'vote_count',  label: 'Most voted' },
  { value: 'title',       label: 'Title A–Z' },
];

export default function BrowsePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [movies, setMovies]   = useState([]);
  const [genres, setGenres]   = useState([]);
  const [total, setTotal]     = useState(0);
  const [pages, setPages]     = useState(1);
  const [loading, setLoading] = useState(true);

  const search = searchParams.get('search') || '';
  const genre  = searchParams.get('genre')  || '';
  const sort   = searchParams.get('sort')   || 'popularity';
  const page   = parseInt(searchParams.get('page') || '1');

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== 'page') next.delete('page');
    setSearchParams(next);
  };

  const fetchMovies = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getMovies({ search, genre, sort, page, limit: 24 });
      setMovies(data.movies);
      setTotal(data.total);
      setPages(data.pages);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [search, genre, sort, page]);

  useEffect(() => { fetchMovies(); }, [fetchMovies]);

  useEffect(() => {
    getGenres().then(({ data }) => setGenres(data.genres));
  }, []);

  const s = { // shared styles
    pill: (active) => ({
      fontSize: '12px', padding: '5px 12px', borderRadius: '20px', cursor: 'pointer',
      border: `0.5px solid ${active ? '#85B7EB' : 'var(--color-border-tertiary)'}`,
      background: active ? '#E6F1FB' : 'var(--color-background-primary)',
      color: active ? '#0C447C' : 'var(--color-text-secondary)',
      whiteSpace: 'nowrap',
    }),
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background-primary)' }}>
      <Navbar />
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '28px 24px' }}>

        {/* Search + sort row */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search movies..."
            value={search}
            onChange={e => setParam('search', e.target.value)}
            style={{ flex: 1, minWidth: '200px' }}
          />
          <select
            value={sort}
            onChange={e => setParam('sort', e.target.value)}
            style={{ minWidth: '160px' }}
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Genre filter pills */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '24px' }}>
          <span style={s.pill(!genre)} onClick={() => setParam('genre', '')}>All</span>
          {genres.map(g => (
            <span key={g.id} style={s.pill(genre === g.name)} onClick={() => setParam('genre', g.name)}>
              {g.name}
            </span>
          ))}
        </div>

        {/* Results count */}
        <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)', marginBottom: '16px' }}>
          {loading ? 'Loading...' : `${total.toLocaleString()} movies`}
          {search && ` matching "${search}"`}
          {genre && ` in ${genre}`}
        </div>

        {/* Movie grid */}
        {loading ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: '12px',
          }}>
            {Array.from({ length: 24 }).map((_, i) => (
              <div key={i} style={{
                aspectRatio: '2/3', background: 'var(--color-background-secondary)',
                borderRadius: '8px', border: '0.5px solid var(--color-border-tertiary)',
              }} />
            ))}
          </div>
        ) : movies.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-tertiary)', fontSize: '14px' }}>
            No movies found. Try a different search or filter.
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: '12px',
          }}>
            {movies.map((m, i) => <MovieCard key={m.tmdb_id} movie={m} index={i} />)}
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '32px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setParam('page', page - 1)}
              disabled={page === 1}
              style={{ padding: '6px 14px', fontSize: '13px' }}
            >
              ← Prev
            </button>
            {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
              const p = page <= 4 ? i + 1 : page - 3 + i;
              if (p < 1 || p > pages) return null;
              return (
                <button
                  key={p}
                  onClick={() => setParam('page', p)}
                  style={{
                    padding: '6px 12px', fontSize: '13px',
                    background: p === page ? '#E6F1FB' : 'var(--color-background-primary)',
                    color: p === page ? '#0C447C' : 'var(--color-text-secondary)',
                    border: `0.5px solid ${p === page ? '#85B7EB' : 'var(--color-border-tertiary)'}`,
                    borderRadius: '6px',
                  }}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => setParam('page', page + 1)}
              disabled={page === pages}
              style={{ padding: '6px 14px', fontSize: '13px' }}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}