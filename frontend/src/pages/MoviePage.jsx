import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../components/ui/Navbar';
import { useAuth } from '../hooks/useAuth';
import {
  getMovie, rateMovie, getMyRating,
  postComment, toggleWatchlist, getWatchlistStatus,
} from '../api/movies';

const POSTER = 'https://image.tmdb.org/t/p/w500';
const BACKDROP = 'https://image.tmdb.org/t/p/w1280';
const PROFILE = 'https://image.tmdb.org/t/p/w185';

function StarRating({ score, onRate, loading }) {
  const [hover, setHover] = useState(null);
  const display = hover ?? score ?? 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
        <span
          key={n}
          onClick={() => !loading && onRate(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(null)}
          style={{
            fontSize: '20px', cursor: loading ? 'not-allowed' : 'pointer',
            color: n <= display ? '#EF9F27' : 'var(--color-border-secondary)',
            transition: 'color 0.1s',
          }}
        >
          ★
        </span>
      ))}
      {score && (
        <span style={{ fontSize: '13px', color: 'var(--color-text-tertiary)', marginLeft: '6px' }}>
          Your rating: {score}/10
        </span>
      )}
    </div>
  );
}

function CommentItem({ comment, onReply, depth = 0 }) {
  const [replying, setReplying] = useState(false);

  return (
    <div style={{ marginLeft: depth > 0 ? '24px' : 0, borderLeft: depth > 0 ? '2px solid var(--color-border-tertiary)' : 'none', paddingLeft: depth > 0 ? '12px' : 0 }}>
      <div style={{ padding: '12px 0', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#E6F1FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 500, color: '#0C447C', flexShrink: 0 }}>
            {comment.username?.slice(0, 2).toUpperCase()}
          </div>
          <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)' }}>{comment.username}</span>
          {comment.user_rating && (
            <span style={{ fontSize: '11px', background: '#FAEEDA', color: '#633806', padding: '1px 6px', borderRadius: '10px' }}>
              ★ {comment.user_rating}
            </span>
          )}
          <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>
            {new Date(comment.created_at).toLocaleDateString()}
          </span>
        </div>
        <p style={{ fontSize: '14px', color: 'var(--color-text-primary)', lineHeight: 1.6, margin: 0 }}>
          {comment.body}
        </p>
        {depth === 0 && (
          <button
            onClick={() => setReplying(r => !r)}
            style={{ marginTop: '6px', fontSize: '12px', color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            {replying ? 'Cancel' : 'Reply'}
          </button>
        )}
        {replying && (
          <CommentForm
            placeholder="Write a reply..."
            onSubmit={(body) => { onReply(body, comment.id); setReplying(false); }}
          />
        )}
      </div>
      {comment.replies?.map(r => (
        <CommentItem key={r.id} comment={r} onReply={onReply} depth={depth + 1} />
      ))}
    </div>
  );
}

function CommentForm({ onSubmit, placeholder = 'Write a comment...' }) {
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setLoading(true);
    await onSubmit(body);
    setBody('');
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: '10px' }}>
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder={placeholder}
        rows={3}
        style={{ width: '100%', resize: 'vertical', fontSize: '13px', padding: '8px 10px', border: '0.5px solid var(--color-border-secondary)', borderRadius: '6px', background: 'var(--color-background-secondary)', color: 'var(--color-text-primary)' }}
      />
      <button
        type="submit"
        disabled={loading || !body.trim()}
        style={{ marginTop: '6px', padding: '7px 16px', background: '#185FA5', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '13px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
      >
        {loading ? 'Posting...' : 'Post'}
      </button>
    </form>
  );
}

export default function MoviePage() {
  const { tmdbId } = useParams();
  const { user } = useAuth();

  const [data, setData]             = useState(null);
  const [loading, setLoading]       = useState(true);
  const [myRating, setMyRating]     = useState(null);
  const [ratingBusy, setRatingBusy] = useState(false);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [activeTab, setActiveTab]   = useState('comments');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getMovie(tmdbId),
      user ? getMyRating(tmdbId) : Promise.resolve({ data: { score: null } }),
      user ? getWatchlistStatus(tmdbId) : Promise.resolve({ data: { inWatchlist: false } }),
    ]).then(([movieRes, ratingRes, watchlistRes]) => {
      setData(movieRes.data);
      setMyRating(ratingRes.data.score);
      setInWatchlist(watchlistRes.data.inWatchlist);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, [tmdbId, user]);

  const handleRate = async (score) => {
    if (!user) return;
    setRatingBusy(true);
    try {
      const { data: updated } = await rateMovie(tmdbId, score);
      setMyRating(score);
      setData(d => ({ ...d, movie: { ...d.movie, avg_rating: updated.avg_rating, rating_count: updated.rating_count } }));
    } catch (err) {
      console.error(err);
    } finally {
      setRatingBusy(false);
    }
  };

  const handleComment = async (body, parentId = null) => {
    if (!user) return;
    try {
      const { data: res } = await postComment(tmdbId, body, parentId);
      setData(d => ({
        ...d,
        comments: parentId
          ? d.comments.map(c => c.id === parentId ? { ...c, replies: [...(c.replies || []), res.comment] } : c)
          : [res.comment, ...d.comments],
      }));
    } catch (err) {
      console.error(err);
    }
  };

  const handleWatchlist = async () => {
    if (!user) return;
    try {
      const { data: res } = await toggleWatchlist(tmdbId);
      setInWatchlist(res.added);
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return (
    <div style={{ minHeight: '100vh' }}>
      <Navbar />
      <div style={{ maxWidth: '1000px', margin: '40px auto', padding: '0 24px' }}>
        <div style={{ height: '400px', background: 'var(--color-background-secondary)', borderRadius: '12px' }} />
      </div>
    </div>
  );

  if (!data?.movie) return (
    <div style={{ minHeight: '100vh' }}>
      <Navbar />
      <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--color-text-tertiary)' }}>Movie not found.</div>
    </div>
  );

  const { movie, cast, crew, tmdbReviews, comments } = data;
  const director = crew.find(c => c.job === 'Director');
  const writers  = crew.filter(c => ['Screenplay', 'Writer', 'Story', 'Novel'].includes(c.job));

  const tabs = [
    { id: 'comments', label: `Comments (${comments.length})` },
    { id: 'reviews',  label: `TMDB reviews (${tmdbReviews.length})` },
    { id: 'cast',     label: 'Full cast & crew' },
    { id: 'details',  label: 'Details' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background-primary)' }}>
      <Navbar />

      {/* Backdrop */}
      {movie.backdrop_path && (
        <div style={{ width: '100%', height: '340px', overflow: 'hidden', position: 'relative' }}>
          <img
            src={`${BACKDROP}${movie.backdrop_path}`}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.35 }}
          />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, var(--color-background-primary))' }} />
        </div>
      )}

      <div style={{ maxWidth: '1000px', margin: movie.backdrop_path ? '-180px auto 0' : '0 auto', padding: '0 24px 60px', position: 'relative', zIndex: 1 }}>

        {/* Hero row */}
        <div style={{ display: 'flex', gap: '28px', marginBottom: '32px', alignItems: 'flex-start' }}>
          {movie.poster_path && (
            <img
              src={`${POSTER}${movie.poster_path}`}
              alt={movie.title}
              style={{ width: '180px', borderRadius: '10px', flexShrink: 0, border: '0.5px solid var(--color-border-tertiary)' }}
            />
          )}
          <div style={{ flex: 1, paddingTop: movie.backdrop_path ? '60px' : '0' }}>
            <h1 style={{ fontSize: '28px', fontWeight: 500, marginBottom: '4px' }}>{movie.title}</h1>
            {movie.tagline && (
              <p style={{ fontSize: '14px', color: 'var(--color-text-tertiary)', fontStyle: 'italic', marginBottom: '10px' }}>
                {movie.tagline}
              </p>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
              {movie.year && <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{movie.year}</span>}
              {movie.runtime && <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>· {Math.floor(movie.runtime / 60)}h {movie.runtime % 60}m</span>}
              {movie.genres?.map(g => (
                <Link key={g} to={`/browse?genre=${g}`} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: '#E6F1FB', color: '#0C447C', textDecoration: 'none' }}>
                  {g}
                </Link>
              ))}
            </div>

            {/* Ratings row */}
            <div style={{ display: 'flex', gap: '20px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '22px', fontWeight: 500, color: '#EF9F27' }}>
                  {Number(movie.vote_average).toFixed(1)}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                  TMDB · {movie.vote_count?.toLocaleString()} votes
                </div>
              </div>
              {movie.rating_count > 0 && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 500, color: '#639922' }}>
                    {Number(movie.avg_rating).toFixed(1)}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                    App · {movie.rating_count} ratings
                  </div>
                </div>
              )}
            </div>

            {/* User rating */}
            {user ? (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>Your rating</div>
                <StarRating score={myRating} onRate={handleRate} loading={ratingBusy} />
              </div>
            ) : (
              <p style={{ fontSize: '13px', color: 'var(--color-text-tertiary)', marginBottom: '16px' }}>
                <Link to="/login" style={{ color: 'var(--color-text-info)' }}>Sign in</Link> to rate this movie
              </p>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {movie.jellyfin_id && (
                <Link
                  to={`/watch/${tmdbId}`}
                  style={{ padding: '9px 20px', background: '#185FA5', color: '#fff', borderRadius: '6px', textDecoration: 'none', fontSize: '13px', fontWeight: 500 }}
                >
                  ▶ Watch now
                </Link>
              )}
              {user && (
                <button
                  onClick={handleWatchlist}
                  style={{ padding: '8px 16px', border: `0.5px solid ${inWatchlist ? '#85B7EB' : 'var(--color-border-secondary)'}`, borderRadius: '6px', background: inWatchlist ? '#E6F1FB' : 'transparent', color: inWatchlist ? '#0C447C' : 'var(--color-text-secondary)', fontSize: '13px', cursor: 'pointer' }}
                >
                  {inWatchlist ? '✓ In watchlist' : '+ Add to watchlist'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Overview */}
        <p style={{ fontSize: '15px', lineHeight: 1.7, color: 'var(--color-text-primary)', marginBottom: '32px', maxWidth: '720px' }}>
          {movie.overview}
        </p>

        {/* Key crew */}
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '32px', paddingBottom: '24px', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
          {director && (
            <div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginBottom: '2px' }}>Director</div>
              <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text-primary)' }}>{director.name}</div>
            </div>
          )}
          {writers.length > 0 && (
            <div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginBottom: '2px' }}>Written by</div>
              <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text-primary)' }}>
                {writers.map(w => w.name).join(', ')}
              </div>
            </div>
          )}
        </div>

        {/* Top cast row */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '12px' }}>Cast</div>
          <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
            {cast.slice(0, 12).map(c => (
              <div key={c.id} style={{ flexShrink: 0, width: '80px', textAlign: 'center' }}>
                {c.profile_path
                  ? <img src={`${PROFILE}${c.profile_path}`} alt={c.name} style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '0.5px solid var(--color-border-tertiary)' }} />
                  : <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 500, color: 'var(--color-text-tertiary)' }}>
                      {c.name.slice(0, 1)}
                    </div>
                }
                <div style={{ fontSize: '11px', fontWeight: 500, marginTop: '5px', color: 'var(--color-text-primary)' }}>{c.name}</div>
                <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', marginTop: '1px' }}>{c.character}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ borderBottom: '0.5px solid var(--color-border-tertiary)', display: 'flex', gap: '0', marginBottom: '24px' }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: '10px 16px', fontSize: '13px', background: 'none', border: 'none',
                borderBottom: `2px solid ${activeTab === t.id ? '#185FA5' : 'transparent'}`,
                color: activeTab === t.id ? '#185FA5' : 'var(--color-text-secondary)',
                cursor: 'pointer', fontWeight: activeTab === t.id ? 500 : 400,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab: comments */}
        {activeTab === 'comments' && (
          <div>
            {user
              ? <CommentForm onSubmit={(body) => handleComment(body)} />
              : <p style={{ fontSize: '13px', color: 'var(--color-text-tertiary)', marginBottom: '20px' }}>
                  <Link to="/login" style={{ color: 'var(--color-text-info)' }}>Sign in</Link> to leave a comment.
                </p>
            }
            <div style={{ marginTop: '20px' }}>
              {comments.length === 0
                ? <p style={{ fontSize: '14px', color: 'var(--color-text-tertiary)' }}>No comments yet. Be the first!</p>
                : comments.filter(c => !c.parent_id).map(c => (
                    <CommentItem
                      key={c.id}
                      comment={{ ...c, replies: comments.filter(r => r.parent_id === c.id) }}
                      onReply={handleComment}
                    />
                  ))
              }
            </div>
          </div>
        )}

        {/* Tab: TMDB reviews */}
        {activeTab === 'reviews' && (
          <div>
            {tmdbReviews.length === 0
              ? <p style={{ fontSize: '14px', color: 'var(--color-text-tertiary)' }}>No TMDB reviews for this movie.</p>
              : tmdbReviews.map(r => (
                  <div key={r.id} style={{ padding: '16px 0', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--color-background-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 500, color: 'var(--color-text-secondary)', overflow: 'hidden' }}>
                        {r.avatar_path
                          ? <img src={r.avatar_path.startsWith('/https') ? r.avatar_path.slice(1) : `${PROFILE}${r.avatar_path}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : r.author?.slice(0, 1).toUpperCase()
                        }
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: 500 }}>{r.author}</span>
                      {r.rating && (
                        <span style={{ fontSize: '11px', background: '#FAEEDA', color: '#633806', padding: '1px 6px', borderRadius: '10px' }}>
                          ★ {r.rating}
                        </span>
                      )}
                      <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>
                        {new Date(r.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <ReviewContent content={r.content} />
                  </div>
                ))
            }
          </div>
        )}

        {/* Tab: full cast */}
        {activeTab === 'cast' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '12px' }}>Cast</div>
              {cast.map(c => (
                <div key={c.id} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '6px 0', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--color-background-secondary)', flexShrink: 0, overflow: 'hidden' }}>
                    {c.profile_path && <img src={`${PROFILE}${c.profile_path}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)' }}>{c.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{c.character}</div>
                  </div>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '12px' }}>Crew</div>
              {crew.map(c => (
                <div key={c.id + c.job} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '6px 0', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--color-background-secondary)', flexShrink: 0, overflow: 'hidden' }}>
                    {c.profile_path && <img src={`${PROFILE}${c.profile_path}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)' }}>{c.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{c.job}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab: details */}
        {activeTab === 'details' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {[
              ['Status',           movie.status],
              ['Original title',   movie.original_title !== movie.title ? movie.original_title : null],
              ['Language',         movie.original_language?.toUpperCase()],
              ['Budget',           movie.budget > 0 ? `$${movie.budget.toLocaleString()}` : null],
              ['Revenue',          movie.revenue > 0 ? `$${movie.revenue.toLocaleString()}` : null],
              ['IMDB',             movie.imdb_id],
              ['Production',       movie.production_companies?.map(c => c.name).join(', ')],
              ['Countries',        movie.countries?.map(c => c.name).join(', ')],
              ['Languages',        movie.languages?.map(l => l.english_name).join(', ')],
              ['Keywords',         movie.keywords?.slice(0, 8).join(', ')],
            ].filter(([, v]) => v).map(([label, value]) => (
              <div key={label} style={{ padding: '10px 12px', background: 'var(--color-background-secondary)', borderRadius: '6px' }}>
                <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginBottom: '2px' }}>{label}</div>
                <div style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>{value}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewContent({ content }) {
  const [expanded, setExpanded] = useState(false);
  const limit = 400;
  const long = content?.length > limit;

  return (
    <div>
      <p style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--color-text-primary)', margin: 0, whiteSpace: 'pre-line' }}>
        {expanded || !long ? content : `${content.slice(0, limit)}...`}
      </p>
      {long && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{ marginTop: '6px', fontSize: '12px', color: 'var(--color-text-info)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  );
}