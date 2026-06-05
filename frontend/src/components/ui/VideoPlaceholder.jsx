import { Link } from 'react-router-dom';

export default function VideoPlaceholder({ title, posterPath, isLoggedIn, isAvailable }) {
  const BACKDROP_BASE = 'https://image.tmdb.org/t/p/w780';

  let message;
  if (!isLoggedIn) {
    message = 'Sign in to watch this movie';
  } else if (isAvailable) {
    message = 'Press Watch Now to start streaming';
  } else {
    message = 'Streaming not available for this title yet';
  }

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
      {posterPath && (
        <img
          src={`${BACKDROP_BASE}${posterPath}`}
          alt=""
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover',
            opacity: isAvailable ? 0.25 : 0.12,
            filter: 'blur(6px)',
            transform: 'scale(1.1)',
          }}
        />
      )}

      <div style={{
        position: 'relative', zIndex: 1,
        textAlign: 'center', padding: '24px',
      }}>
        <div style={{ marginBottom: '16px' }}>
          {isAvailable ? (
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'rgba(255,255,255,0.1)',
              border: '1.5px solid rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto',
            }}>
              <div style={{
                width: 0, height: 0,
                borderTop: '12px solid transparent',
                borderBottom: '12px solid transparent',
                borderLeft: '20px solid rgba(255,255,255,0.7)',
                marginLeft: 5,
              }} />
            </div>
          ) : (
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none"
              stroke="rgba(255,255,255,0.35)" strokeWidth="1.5">
              <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
              <line x1="7" y1="2" x2="7" y2="22"/>
              <line x1="17" y1="2" x2="17" y2="22"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
              <line x1="2" y1="7" x2="7" y2="7"/>
              <line x1="2" y1="17" x2="7" y2="17"/>
              <line x1="17" y1="17" x2="22" y2="17"/>
              <line x1="17" y1="7" x2="22" y2="7"/>
            </svg>
          )}
        </div>

        <div style={{ fontSize: '15px', fontWeight: 500, color: 'rgba(255,255,255,0.85)', marginBottom: '6px' }}>
          {title}
        </div>

        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', marginBottom: 16 }}>
          {message}
        </div>

        {!isLoggedIn && (
          <Link
            to="/login"
            style={{
              display: 'inline-block', padding: '8px 20px',
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.2)',
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
