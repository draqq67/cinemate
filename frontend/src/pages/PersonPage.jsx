import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../components/ui/Navbar';
import client from '../api/client';

const PROFILE  = 'https://image.tmdb.org/t/p/w342';
const POSTER   = 'https://image.tmdb.org/t/p/w300';

const LABEL = {
  fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--lb-text-muted)',
};

export default function PersonPage() {
  const { personId } = useParams();
  const [person, setPerson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('acting');

  useEffect(() => {
    setLoading(true);
    client.get(`/people/${personId}`)
      .then(r => setPerson(r.data))
      .catch(() => setPerson(null))
      .finally(() => setLoading(false));
  }, [personId]);

  if (loading) return (
    <>
      <Navbar />
      <div style={{ textAlign: 'center', padding: '80px', color: 'var(--lb-text)' }}>Loading…</div>
    </>
  );

  if (!person) return (
    <>
      <Navbar />
      <div style={{ textAlign: 'center', padding: '80px', color: 'var(--lb-danger)' }}>Person not found.</div>
    </>
  );

  const age = person.birthday
    ? Math.floor((Date.now() - new Date(person.birthday)) / 31557600000)
    : null;

  const movies = tab === 'directing' ? person.directed : person.movies;

  return (
    <>
      <Navbar />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px' }}>

        {/* Hero */}
        <div style={{ display: 'flex', gap: '40px', alignItems: 'flex-start', marginBottom: '48px', flexWrap: 'wrap' }}>
          {person.profile_path && (
            <img
              src={`${PROFILE}${person.profile_path}`}
              alt={person.name}
              style={{ width: 200, borderRadius: '4px', flexShrink: 0, boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}
            />
          )}
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ ...LABEL, marginBottom: '8px' }}>{person.known_for_department}</div>
            <h1 style={{ margin: '0 0 16px', fontSize: '36px', color: 'var(--lb-text-bright)' }}>{person.name}</h1>

            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '20px' }}>
              {person.birthday && (
                <div>
                  <div style={LABEL}>Born</div>
                  <div style={{ color: 'var(--lb-text-2)', fontSize: '13px' }}>
                    {new Date(person.birthday).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    {age && !person.deathday ? ` (age ${age})` : ''}
                  </div>
                </div>
              )}
              {person.deathday && (
                <div>
                  <div style={LABEL}>Died</div>
                  <div style={{ color: 'var(--lb-text-2)', fontSize: '13px' }}>
                    {new Date(person.deathday).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
              )}
              {person.place_of_birth && (
                <div>
                  <div style={LABEL}>From</div>
                  <div style={{ color: 'var(--lb-text-2)', fontSize: '13px' }}>{person.place_of_birth}</div>
                </div>
              )}
            </div>

            {person.biography && (
              <p style={{ color: 'var(--lb-text)', lineHeight: 1.7, fontSize: '14px', maxWidth: 680 }}>
                {person.biography.slice(0, 600)}{person.biography.length > 600 ? '…' : ''}
              </p>
            )}

            {/* Photo strip */}
            {person.photos?.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '20px', overflowX: 'auto' }}>
                {person.photos.map(p => (
                  <img key={p} src={`${PROFILE}${p}`} alt="" style={{ height: 80, borderRadius: '3px', flexShrink: 0 }} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        {(person.movies?.length > 0 || person.directed?.length > 0) && (
          <>
            <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--lb-border)', marginBottom: '32px' }}>
              {person.movies?.length > 0 && (
                <button onClick={() => setTab('acting')} style={{
                  padding: '10px 20px', fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em',
                  textTransform: 'uppercase', cursor: 'pointer', border: 'none',
                  background: 'none', color: tab === 'acting' ? 'var(--lb-green)' : 'var(--lb-text)',
                  borderBottom: tab === 'acting' ? '2px solid var(--lb-green)' : '2px solid transparent',
                  marginBottom: '-1px',
                }}>
                  Acting ({person.movies.length})
                </button>
              )}
              {person.directed?.length > 0 && (
                <button onClick={() => setTab('directing')} style={{
                  padding: '10px 20px', fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em',
                  textTransform: 'uppercase', cursor: 'pointer', border: 'none',
                  background: 'none', color: tab === 'directing' ? 'var(--lb-green)' : 'var(--lb-text)',
                  borderBottom: tab === 'directing' ? '2px solid var(--lb-green)' : '2px solid transparent',
                  marginBottom: '-1px',
                }}>
                  Directing ({person.directed.length})
                </button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '16px' }}>
              {movies.map(m => (
                <Link key={m.tmdb_id} to={`/movie/${m.tmdb_id}`} style={{ textDecoration: 'none' }}>
                  <div style={{ position: 'relative', borderRadius: '4px', overflow: 'hidden',
                    transition: 'transform 0.15s', background: 'var(--lb-bg-2)' }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-3px)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
                    {m.poster_path
                      ? <img src={`${POSTER}${m.poster_path}`} alt={m.title} style={{ width: '100%', display: 'block' }} />
                      : <div style={{ height: 180, background: 'var(--lb-bg-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--lb-text-muted)', fontSize: '11px' }}>No poster</div>
                    }
                    {m.vote_average > 0 && (
                      <div style={{
                        position: 'absolute', bottom: 6, left: 6,
                        background: 'rgba(0,0,0,0.8)', borderRadius: '3px',
                        padding: '2px 6px', fontSize: '10px', fontWeight: 700,
                        color: m.vote_average >= 7 ? 'var(--lb-green)' : m.vote_average >= 5 ? 'var(--lb-orange)' : '#f87171',
                      }}>
                        {parseFloat(m.vote_average).toFixed(1)}
                      </div>
                    )}
                  </div>
                  <div style={{ padding: '6px 2px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--lb-text-2)', lineHeight: 1.3 }}>{m.title}</div>
                    {tab === 'acting' && m.character && (
                      <div style={{ fontSize: '10px', color: 'var(--lb-text-muted)' }}>{m.character}</div>
                    )}
                    {m.release_date && (
                      <div style={{ fontSize: '10px', color: 'var(--lb-text-muted)' }}>{m.release_date.slice(0, 4)}</div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
