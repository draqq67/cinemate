import { useState } from 'react';
import { Link } from 'react-router-dom';

const POSTER_BASE = 'https://image.tmdb.org/t/p/w342';

export default function MovieCard({ movie }) {
  const [hovered, setHovered] = useState(false);

  return (
    <Link
      to={`/movie/${movie.tmdb_id}`}
      style={{ textDecoration: 'none', display: 'block' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{
        borderRadius: '4px', overflow: 'hidden',
        position: 'relative',
        transform: hovered ? 'translateY(-3px)' : 'none',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        boxShadow: hovered
          ? '0 12px 32px rgba(0,0,0,0.6)'
          : '0 2px 8px rgba(0,0,0,0.4)',
      }}>
        {/* Poster */}
        <div style={{ aspectRatio: '2/3', background: 'var(--lb-bg-3)', position: 'relative' }}>
          {movie.poster_path
            ? <img
                src={`${POSTER_BASE}${movie.poster_path}`}
                alt={movie.title}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            : <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: '6px',
                color: 'var(--lb-text-muted)',
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="2" y="3" width="20" height="18" rx="2"/><path d="m9 8 6 4-6 4V8Z"/>
                </svg>
                <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>No poster</span>
              </div>
          }

          {/* Hover overlay */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)',
            opacity: hovered ? 1 : 0,
            transition: 'opacity 0.2s ease',
          }} />

          {/* Rating badge (always visible bottom-left) */}
          {movie.vote_average > 0 && (
            <div style={{
              position: 'absolute', bottom: '7px', left: '7px',
              fontSize: '11px', fontWeight: 700,
              color: 'var(--lb-green)',
              background: 'rgba(0,0,0,0.75)',
              padding: '2px 6px', borderRadius: '3px',
              backdropFilter: 'blur(4px)',
              zIndex: 2,
            }}>
              ★ {Number(movie.vote_average).toFixed(1)}
            </div>
          )}
        </div>

        {/* Title row */}
        <div style={{
          padding: '7px 8px 8px',
          background: 'var(--lb-bg-2)',
        }}>
          <div style={{
            fontSize: '12px', fontWeight: 600, color: 'var(--lb-text-2)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            lineHeight: 1.3,
          }}>
            {movie.title}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--lb-text-muted)', marginTop: '2px' }}>
            {movie.year}{movie.genres?.[0] ? ` · ${movie.genres[0]}` : ''}
          </div>
        </div>
      </div>
    </Link>
  );
}
