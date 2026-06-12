import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/ui/Navbar';
import ErrorState from '../components/ui/ErrorState';
import { getFeed } from '../api/activity';

const POSTER  = 'https://image.tmdb.org/t/p/w185';
const LABEL   = {
  fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--lb-text-muted)',
};

const EVENT_ICON = { rating: '★', comment: '💬', watched: '▶' };
const EVENT_LABEL = { rating: 'rated', comment: 'commented on', watched: 'watched' };

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function EventRow({ event }) {
  return (
    <div style={{
      display: 'flex', gap: '14px', alignItems: 'flex-start',
      background: 'var(--lb-bg-2)', border: '1px solid var(--lb-border)',
      borderRadius: '6px', padding: '14px 16px',
    }}>
      {/* Poster */}
      <Link to={`/movie/${event.tmdb_id}`} style={{ flexShrink: 0 }}>
        {event.poster_path
          ? <img src={`${POSTER}${event.poster_path}`} alt={event.title}
              style={{ width: 40, height: 60, objectFit: 'cover', borderRadius: '3px', display: 'block' }} />
          : <div style={{ width: 40, height: 60, background: 'var(--lb-bg-3)', borderRadius: '3px' }} />
        }
      </Link>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', color: 'var(--lb-text-2)', lineHeight: 1.5 }}>
          <Link to={`/user/${event.user_id}`} style={{ fontWeight: 700, color: 'var(--lb-text-bright)', textDecoration: 'none' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--lb-green)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--lb-text-bright)'}>
            {event.username}
          </Link>
          {' '}{EVENT_LABEL[event.type]}{' '}
          <Link to={`/movie/${event.tmdb_id}`} style={{ color: 'var(--lb-green)', textDecoration: 'none', fontWeight: 600 }}>
            {event.title}
          </Link>
          {event.type === 'rating' && (
            <span style={{ color: 'var(--lb-orange)', marginLeft: '6px' }}>
              {'★'.repeat(Math.round(parseInt(event.detail) / 2))}
              <span style={{ color: 'var(--lb-text-muted)', fontSize: '11px', marginLeft: '4px' }}>{event.detail}/10</span>
            </span>
          )}
        </div>
        {event.type === 'comment' && event.detail && (
          <div style={{ fontSize: '12px', color: 'var(--lb-text-muted)', marginTop: '4px', fontStyle: 'italic', lineHeight: 1.4 }}>
            "{event.detail}{event.detail.length >= 120 ? '…' : ''}"
          </div>
        )}
        <div style={{ ...LABEL, marginTop: '6px' }}>{timeAgo(event.ts)}</div>
      </div>

      <div style={{
        fontSize: '16px', flexShrink: 0, opacity: 0.6,
        color: event.type === 'rating' ? 'var(--lb-orange)' : event.type === 'comment' ? 'var(--lb-text)' : 'var(--lb-green)',
      }}>
        {EVENT_ICON[event.type]}
      </div>
    </div>
  );
}

export default function ActivityPage() {
  const [events, setEvents]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const retry = () => { setError(false); setLoading(true); setRetryCount(c => c + 1); };

  useEffect(() => {
    getFeed()
      .then(r => { setEvents(r.data.events); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [retryCount]);

  return (
    <>
      <Navbar />
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px var(--page-px) 80px' }}>
        <div style={{ marginBottom: '32px' }}>
          <div style={LABEL}>Social</div>
          <h1 style={{ margin: '4px 0 0', fontSize: '28px', color: 'var(--lb-text-bright)' }}>Activity Feed</h1>
        </div>

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 88, borderRadius: 6 }} />
            ))}
          </div>
        )}

        {!loading && error && <ErrorState title="Could not load activity feed" onRetry={retry} />}

        {!loading && events.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '60px',
            background: 'var(--lb-bg-2)', border: '1px solid var(--lb-border)', borderRadius: '6px',
          }}>
            <div style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.5 }}>◑</div>
            <div style={{ color: 'var(--lb-text-2)', fontWeight: 600, marginBottom: '8px' }}>Nothing here yet</div>
            <div style={{ color: 'var(--lb-text-muted)', fontSize: '13px', lineHeight: 1.6 }}>
              Follow other users from their profile page to see their ratings, comments, and watch activity here.
            </div>
          </div>
        )}

        {!loading && events.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {events.map((e, i) => <EventRow key={i} event={e} />)}
          </div>
        )}
      </div>
    </>
  );
}
