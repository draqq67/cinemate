import { Link } from 'react-router-dom';

const POSTER_BASE = 'https://image.tmdb.org/t/p/w342';
const BG_COLORS = ['#EAF3DE','#E6F1FB','#FAEEDA','#EEEDFE','#FAECE7','#E1F5EE','#FBEAF0'];

export default function MovieCard({ movie, index = 0 }) {
  return (
    <Link to={`/movie/${movie.tmdb_id}`} style={{ textDecoration: 'none' }}>
      <div style={{ border: '0.5px solid var(--color-border-tertiary)', borderRadius: '8px', overflow: 'hidden', cursor: 'pointer' }}>
        <div style={{ aspectRatio: '2/3', background: BG_COLORS[index % BG_COLORS.length], position: 'relative', display: 'flex', alignItems: 'flex-end', padding: '8px' }}>
          {movie.poster_path
            ? <img src={`${POSTER_BASE}${movie.poster_path}`} alt={movie.title} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '60%', height: '55%', background: 'var(--color-border-tertiary)', borderRadius: '4px', opacity: 0.5 }} />
              </div>
          }
          {movie.vote_average > 0 && (
            <span style={{ fontSize: '10px', fontWeight: 500, padding: '2px 6px', borderRadius: '4px', background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', border: '0.5px solid var(--color-border-tertiary)', position: 'relative', zIndex: 1 }}>
              {Number(movie.vote_average).toFixed(1)} ★
            </span>
          )}
        </div>
        <div style={{ padding: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {movie.title}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>
            {movie.genres?.[0]} · {movie.year}
          </div>
        </div>
      </div>
    </Link>
  );
}