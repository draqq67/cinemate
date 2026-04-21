import { Link } from 'react-router-dom';

export default function VideoPlaceholder({ title, posterPath, isLoggedIn }) {
  const BACKDROP_BASE = 'https://image.tmdb.org/t/p/w780';

  return (
    <div style={{
      width: '100%',
      aspectRatio: '16/9',
      background: '#111',
      borderRadius: '10px',
      overflow: 'hidden',
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {/* Blurred poster as background */}
      {posterPath && (
        <img
          src={`${BACKDROP_BASE}${posterPath}`}
          alt=""
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover', opacity: 0.15,
            filter: 'blur(8px)',
            transform: 'scale(1.1)',
          }}
        />
      )}

      {/* Content */}
      <div style={{
        position: 'relative', zIndex: 1,
        textAlign: 'center', padding: '24px',
      }}>
        {/* Film icon */}
        <div style={{ marginBottom: '16px' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5">
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
            <line x1="7" y1="2" x2="7" y2="22"/>
            <line x1="17" y1="2" x2="17" y2="22"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <line x1="2" y1="7" x2="7" y2="7"/>
            <line x1="2" y1="17" x2="7" y2="17"/>
            <line x1="17" y1="17" x2="22" y2="17"/>
            <line x1="17" y1="7" x2="22" y2="7"/>
          </svg>
        </div>

        <div style={{ fontSize: '15px', fontWeight: 500, color: 'rgba(255,255,255,0.85)', marginBottom: '6px' }}>
          {title}
        </div>

        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '16px' }}>
          {!isLoggedIn
            ? 'Sign in to watch this movie'
            : 'Streaming not available for this title yet'
          }
        </div>

        {!isLoggedIn && (
          <Link
            to="/login"
            style={{
              display: 'inline-block', padding: '8px 20px',
              background: 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: '6px', color: '#fff',
              textDecoration: 'none', fontSize: '13px', fontWeight: 500,
            }}
          >
            Sign in to watch
          </Link>
        )}
      </div>
    </div>
  );
}