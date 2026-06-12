import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Navbar from '../components/ui/Navbar';
import ErrorState from '../components/ui/ErrorState';
import VideoPlayer from '../components/ui/VideoPlayer';
import VideoPlaceholder from '../components/ui/VideoPlaceholder';
import { useAuth } from '../hooks/useAuth';
import client from '../api/client';
import {
  getMovie, rateMovie, getMyRating,
  postComment, toggleWatchlist, getWatchlistStatus,
  getStreamUrl, getUserSubtitles, uploadSubtitle,
  getSimilarMovies,
} from '../api/movies';
import { createRoom } from '../api/watchParty';
import { getMyLists, addToList } from '../api/lists';

const POSTER   = 'https://image.tmdb.org/t/p/w500';
const BACKDROP = 'https://image.tmdb.org/t/p/w1280';
const PROFILE  = 'https://image.tmdb.org/t/p/w185';

const LABEL_STYLE = {
  fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--lb-text-muted)',
};

// ── StarRating ────────────────────────────────────────────────────────────────
function StarRating({ score, onRate, loading }) {
  const [hover, setHover] = useState(null);
  const display = hover ?? score ?? 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
      {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
        <span
          key={n}
          onClick={() => !loading && onRate(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(null)}
          style={{
            fontSize: '18px',
            cursor: loading ? 'not-allowed' : 'pointer',
            color: n <= display ? 'var(--lb-orange)' : 'var(--lb-bg-4)',
            transition: 'color 0.1s',
          }}
        >★</span>
      ))}
      {score && (
        <span style={{ fontSize: '12px', color: 'var(--lb-text)', marginLeft: '8px' }}>
          {score}/10
        </span>
      )}
    </div>
  );
}

// ── CommentForm ───────────────────────────────────────────────────────────────
function CommentForm({ onSubmit, placeholder = 'Write a comment...' }) {
  const [body, setBody]       = useState('');
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
        style={{
          width: '100%', resize: 'vertical', fontSize: '13px',
          padding: '10px 12px', borderRadius: '4px',
          border: '1px solid var(--lb-border-2)',
          background: 'var(--lb-bg-2)', color: '#fff',
        }}
      />
      <button
        type="submit"
        disabled={loading || !body.trim()}
        style={{
          marginTop: '8px', padding: '7px 18px',
          background: 'var(--lb-green)', border: 'none', borderRadius: '4px',
          color: 'var(--lb-bg)', fontSize: '11px', fontWeight: 700,
          letterSpacing: '0.06em', textTransform: 'uppercase',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? 'Posting…' : 'Post'}
      </button>
    </form>
  );
}

// ── CommentItem ───────────────────────────────────────────────────────────────
function CommentItem({ comment, onReply, depth = 0 }) {
  const [replying, setReplying] = useState(false);
  return (
    <div style={{
      marginLeft: depth > 0 ? '20px' : 0,
      borderLeft: depth > 0 ? '2px solid var(--lb-border-2)' : 'none',
      paddingLeft: depth > 0 ? '14px' : 0,
    }}>
      <div style={{ padding: '14px 0', borderBottom: '1px solid var(--lb-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <div style={{
            width: 26, height: 26, borderRadius: '50%',
            background: 'var(--lb-bg-3)', border: '1px solid var(--lb-border-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '10px', fontWeight: 700, color: 'var(--lb-green)', flexShrink: 0,
          }}>
            {comment.username?.slice(0, 2).toUpperCase()}
          </div>
          <Link to={`/user/${comment.user_id}`} style={{ fontSize: '13px', fontWeight: 600, color: '#fff', textDecoration: 'none' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--lb-green)'}
            onMouseLeave={e => e.currentTarget.style.color = '#fff'}>
            {comment.username}
          </Link>
          {comment.user_rating && (
            <span style={{
              fontSize: '10px', background: 'rgba(239,159,39,0.15)', color: 'var(--lb-orange)',
              padding: '1px 7px', borderRadius: '2px', fontWeight: 600,
            }}>
              ★ {comment.user_rating}
            </span>
          )}
          <span style={{ fontSize: '11px', color: 'var(--lb-text-muted)', marginLeft: 'auto' }}>
            {new Date(comment.created_at).toLocaleDateString()}
          </span>
        </div>
        <p style={{ fontSize: '14px', color: 'var(--lb-text-2)', lineHeight: 1.65, margin: 0 }}>
          {comment.body}
        </p>
        {depth === 0 && (
          <button
            onClick={() => setReplying(r => !r)}
            style={{
              marginTop: '7px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em',
              textTransform: 'uppercase', color: 'var(--lb-text-muted)',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            }}
          >
            {replying ? 'Cancel' : 'Reply'}
          </button>
        )}
        {replying && (
          <CommentForm
            placeholder="Write a reply…"
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

// ── ReviewContent ─────────────────────────────────────────────────────────────
function ReviewContent({ content }) {
  const [expanded, setExpanded] = useState(false);
  const limit = 400;
  const long  = content?.length > limit;
  return (
    <div>
      <p style={{ fontSize: '14px', lineHeight: 1.65, color: 'var(--lb-text-2)', margin: 0, whiteSpace: 'pre-line' }}>
        {expanded || !long ? content : `${content.slice(0, limit)}…`}
      </p>
      {long && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            marginTop: '6px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em',
            textTransform: 'uppercase', color: 'var(--lb-green)',
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          }}
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{
        width: 36, height: 36,
        border: '3px solid rgba(0,224,84,0.2)',
        borderTopColor: 'var(--lb-green)', borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
      }} />
    </>
  );
}

// ── MoviePage ─────────────────────────────────────────────────────────────────
export default function MoviePage() {
  const { tmdbId } = useParams();
  const { user }   = useAuth();
  const navigate   = useNavigate();

  const [data, setData]               = useState(null);
  const [loading, setLoading]         = useState(true);
  const [fetchError, setFetchError]   = useState(false);
  const [myRating, setMyRating]       = useState(null);
  const [ratingBusy, setRatingBusy]   = useState(false);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [activeTab, setActiveTab]     = useState('comments');
  const [similarMovies, setSimilarMovies] = useState([]);

  const [trailers, setTrailers]           = useState([]);
  const [partyLoading, setPartyLoading]   = useState(false);
  const [myLists, setMyLists]             = useState([]);
  const [listModalOpen, setListModalOpen]   = useState(false);
  const [listAdding, setListAdding]         = useState(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareFollowing, setShareFollowing] = useState([]);
  const [shareSent, setShareSent]           = useState(null);

  const [streamUrl, setStreamUrl]         = useState(null);
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamError, setStreamError]     = useState(false);
  const [playerOpen, setPlayerOpen]       = useState(false);
  const [jellyfinSubs, setJellyfinSubs]   = useState([]);
  const [userSubs, setUserSubs]           = useState([]);

  const [subFile, setSubFile]           = useState(null);
  const [subLang, setSubLang]           = useState('en');
  const [subLabel, setSubLabel]         = useState('');
  const [subUploading, setSubUploading] = useState(false);
  const [subUploadErr, setSubUploadErr] = useState('');

  useEffect(() => {
    window.scrollTo(0, 0);
    setLoading(true);
    setFetchError(false);
    setData(null);
    setStreamUrl(null);
    setPlayerOpen(false);
    setStreamError(false);

    const requests = [getMovie(tmdbId)];
    if (user) {
      requests.push(getMyRating(tmdbId));
      requests.push(getWatchlistStatus(tmdbId));
    }

    Promise.all(requests)
      .then(([movieRes, ratingRes, watchlistRes]) => {
        setData(movieRes.data);
        setTrailers(movieRes.data.trailers || []);
        if (ratingRes)    setMyRating(ratingRes.data.score);
        if (watchlistRes) setInWatchlist(watchlistRes.data.inWatchlist);
      })
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));

    getSimilarMovies(tmdbId)
      .then(({ data }) => setSimilarMovies(data.movies || []))
      .catch(() => {});

    getUserSubtitles(tmdbId)
      .then(({ data }) => setUserSubs(
        data.subtitles.map(s => ({
          label:    `${s.label} — ${s.username}`,
          language: s.language,
          url:      `/api/movies/${tmdbId}/subtitle/${s.id}`,
        }))
      ))
      .catch(() => {});
  }, [tmdbId, user]);

  useEffect(() => {
    if (user) getMyLists().then(r => setMyLists(r.data.lists)).catch(() => {});
  }, [user]);

  const handleStartParty = async () => {
    if (!user) return;
    setPartyLoading(true);
    try {
      const r = await createRoom(tmdbId);
      navigate(`/party/${r.data.room_code}`);
    } catch { setPartyLoading(false); }
  };

  const handleAddToList = async (listId) => {
    setListAdding(listId);
    try { await addToList(listId, tmdbId); } catch (e) { console.error(e); }
    setListAdding(null);
    setListModalOpen(false);
  };

  const handleRate = async (score) => {
    if (!user) return;
    setRatingBusy(true);
    try {
      const { data: updated } = await rateMovie(tmdbId, score);
      setMyRating(score);
      setData(d => ({ ...d, movie: { ...d.movie, avg_rating: updated.avg_rating, rating_count: updated.rating_count } }));
    } catch (err) { console.error(err); }
    finally { setRatingBusy(false); }
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
    } catch (err) { console.error(err); }
  };

  const handleWatchlist = async () => {
    if (!user) return;
    try {
      const { data: res } = await toggleWatchlist(tmdbId);
      setInWatchlist(res.added);
    } catch (err) { console.error(err); }
  };

  const loadStream = async () => {
    if (!user) return;
    setPlayerOpen(true);
    setStreamError(false);
    setStreamLoading(true);
    try {
      const { data: res } = await getStreamUrl(tmdbId);
      setStreamUrl(res.streamUrl);
      if (res.subtitles?.length) setJellyfinSubs(res.subtitles);
    } catch { setStreamError(true); }
    finally { setStreamLoading(false); }
  };

  const handleSubUpload = async (e) => {
    e.preventDefault();
    if (!subFile) return;
    setSubUploading(true);
    setSubUploadErr('');
    try {
      const content = await subFile.text();
      const label   = subLabel.trim() || subFile.name.replace(/\.[^.]+$/, '');
      const { data } = await uploadSubtitle(tmdbId, content, subLang, label);
      const s = data.subtitle;
      setUserSubs(prev => [{ label: `${s.label} — ${s.username}`, language: s.language, url: `/api/movies/${tmdbId}/subtitle/${s.id}` }, ...prev]);
      setSubFile(null);
      setSubLabel('');
      e.target.reset();
    } catch (err) { setSubUploadErr(err.response?.data?.error || 'Upload failed'); }
    finally { setSubUploading(false); }
  };

  const saveProgress = useCallback(async (progressSeconds) => {
    try { await client.post(`/movies/${tmdbId}/progress`, { progress_s: progressSeconds }); }
    catch (err) { console.error(err); }
  }, [tmdbId]);

  const Shell = ({ children }) => (
    <div style={{ minHeight: '100vh', background: 'var(--lb-bg)' }}>
      <Navbar />{children}
    </div>
  );

  if (loading) return (
    <Shell>
      <div style={{ maxWidth: '1000px', margin: '40px auto', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="skeleton" style={{ height: '40px', width: '60%' }} />
        <div className="skeleton" style={{ height: '420px' }} />
        <div className="skeleton" style={{ height: '20px', width: '40%' }} />
        <div className="skeleton" style={{ height: '120px' }} />
      </div>
    </Shell>
  );

  if (fetchError) return (
    <Shell>
      <ErrorState
        title="Could not load this film"
        sub="TMDB may be unavailable or the film ID is invalid."
        onRetry={() => window.location.reload()}
      />
    </Shell>
  );

  if (!data?.movie) return (
    <Shell>
      <ErrorState title="Film not found" sub="This film doesn't exist in our catalog or on TMDB." />
    </Shell>
  );

  const { movie, cast, crew, tmdbReviews, comments, inDb } = data;
  const director = crew.find(c => c.job === 'Director');
  const writers  = crew.filter(c => ['Screenplay', 'Writer', 'Story', 'Novel'].includes(c.job));

  const tabs = [
    { id: 'comments', label: `Comments (${comments.length})` },
    { id: 'reviews',  label: `TMDB reviews (${tmdbReviews.length})` },
    { id: 'cast',     label: 'Full cast & crew' },
    { id: 'details',  label: 'Details' },
    ...(trailers.length > 0 ? [{ id: 'trailers', label: `Trailers (${trailers.length})` }] : []),
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--lb-bg)' }}>
      <Navbar />

      {/* Full-bleed backdrop */}
      {movie.backdrop_path && (
        <div style={{ width: '100%', height: '380px', overflow: 'hidden', position: 'relative' }}>
          <img
            src={`${BACKDROP}${movie.backdrop_path}`}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.4, display: 'block' }}
          />
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to bottom, rgba(20,24,28,0.3) 0%, var(--lb-bg) 100%)',
          }} />
        </div>
      )}

      <div style={{
        maxWidth: '1000px',
        margin: movie.backdrop_path ? '-220px auto 0' : '0 auto',
        padding: '0 24px 80px',
        position: 'relative', zIndex: 1,
      }}>

        {/* Video player — catalog films only */}
        {inDb && (
        <div style={{ marginBottom: '32px' }}>
          {playerOpen ? (
            streamLoading ? (
              <div style={{
                width: '100%', aspectRatio: '16/9', background: '#000',
                borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Spinner />
              </div>
            ) : streamError ? (
              <VideoPlaceholder
                title={movie.title}
                posterPath={movie.backdrop_path || movie.poster_path}
                isLoggedIn={!!user}
                isAvailable={!!movie.jellyfin_id}
              />
            ) : streamUrl ? (
              <VideoPlayer
                streamUrl={streamUrl}
                title={movie.title}
                posterPath={movie.backdrop_path || movie.poster_path}
                tmdbId={tmdbId}
                onProgress={saveProgress}
                subtitles={[...jellyfinSubs, ...userSubs]}
              />
            ) : null
          ) : (
            <VideoPlaceholder
              title={movie.title}
              posterPath={movie.backdrop_path || movie.poster_path}
              isLoggedIn={!!user}
              isAvailable={!!movie.jellyfin_id}
            />
          )}

          {/* Subtitle upload */}
          {playerOpen && streamUrl && user && (
            <div style={{ marginTop: 14, padding: '14px', background: 'var(--lb-bg-2)', borderRadius: '4px', border: '1px solid var(--lb-border)' }}>
              <div style={{ ...LABEL_STYLE, marginBottom: '10px' }}>Upload subtitle</div>
              <form onSubmit={handleSubUpload} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div>
                  <label style={{ display: 'block', ...LABEL_STYLE, marginBottom: 4 }}>File (.srt / .vtt)</label>
                  <input type="file" accept=".srt,.vtt" style={{ fontSize: 12 }} onChange={e => setSubFile(e.target.files[0] || null)} />
                </div>
                <div>
                  <label style={{ display: 'block', ...LABEL_STYLE, marginBottom: 4 }}>Language</label>
                  <select value={subLang} onChange={e => setSubLang(e.target.value)} style={{ fontSize: 12 }}>
                    {[['en','English'],['ro','Romanian'],['fr','French'],['de','German'],
                      ['es','Spanish'],['it','Italian'],['ja','Japanese'],['ko','Korean'],['und','Other']].map(([v,l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', ...LABEL_STYLE, marginBottom: 4 }}>Label (optional)</label>
                  <input type="text" value={subLabel} onChange={e => setSubLabel(e.target.value)} placeholder="e.g. English SDH" style={{ fontSize: 12, width: 140 }} />
                </div>
                <button
                  type="submit"
                  disabled={!subFile || subUploading}
                  style={{
                    padding: '7px 14px', background: 'var(--lb-green)', border: 'none',
                    borderRadius: 4, color: 'var(--lb-bg)', fontSize: 11, fontWeight: 700,
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                    cursor: !subFile || subUploading ? 'not-allowed' : 'pointer',
                    opacity: !subFile || subUploading ? 0.6 : 1, alignSelf: 'flex-end',
                  }}
                >
                  {subUploading ? 'Uploading…' : 'Upload'}
                </button>
              </form>
              {subUploadErr && <p style={{ fontSize: 12, color: 'var(--lb-danger)', marginTop: 6 }}>{subUploadErr}</p>}
            </div>
          )}
        </div>
        )}

        {/* Hero row: poster + info */}
        <div className="movie-detail-layout" style={{ marginBottom: '36px' }}>
          {movie.poster_path && (
            <img
              src={`${POSTER}${movie.poster_path}`}
              alt={movie.title}
              style={{
                width: '170px', borderRadius: '6px', flexShrink: 0,
                boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              }}
            />
          )}

          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '30px', fontWeight: 700, marginBottom: '4px', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              {movie.title}
            </h1>

            {movie.tagline && (
              <p style={{ fontSize: '14px', color: 'var(--lb-text-muted)', fontStyle: 'italic', marginBottom: '12px' }}>
                {movie.tagline}
              </p>
            )}

            {/* Meta */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginBottom: '16px' }}>
              {movie.year && (
                <span style={{ fontSize: '13px', color: 'var(--lb-text)', fontWeight: 600 }}>{movie.year}</span>
              )}
              {movie.runtime && (
                <span style={{ fontSize: '13px', color: 'var(--lb-text-muted)' }}>
                  · {Math.floor(movie.runtime / 60)}h {movie.runtime % 60}m
                </span>
              )}
              {movie.genres?.map(g => (
                <Link
                  key={g}
                  to={`/browse?genre=${g}`}
                  style={{
                    fontSize: '10px', fontWeight: 600, padding: '3px 9px', borderRadius: '2px',
                    border: '1px solid var(--lb-border-2)',
                    color: 'var(--lb-text)', textDecoration: 'none',
                    letterSpacing: '0.04em',
                  }}
                >
                  {g}
                </Link>
              ))}
            </div>

            {/* Ratings */}
            <div style={{ display: 'flex', gap: '24px', marginBottom: '20px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--lb-orange)', lineHeight: 1 }}>
                  {Number(movie.vote_average).toFixed(1)}
                </div>
                <div style={{ ...LABEL_STYLE, marginTop: '4px' }}>
                  TMDB · {movie.vote_count?.toLocaleString()} votes
                </div>
              </div>
              {movie.rating_count > 0 && (
                <div>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--lb-green)', lineHeight: 1 }}>
                    {Number(movie.avg_rating).toFixed(1)}
                  </div>
                  <div style={{ ...LABEL_STYLE, marginTop: '4px' }}>
                    Community · {movie.rating_count} ratings
                  </div>
                </div>
              )}
            </div>

            {/* Not-in-catalog banner */}
            {!inDb && (
              <div style={{
                marginBottom: '20px', padding: '10px 14px',
                background: 'rgba(153,170,187,0.08)',
                border: '1px solid var(--lb-border-2)',
                borderRadius: '4px', fontSize: '12px', color: 'var(--lb-text-muted)',
              }}>
                This film isn't in the catalog yet — ratings, comments and streaming aren't available.
              </div>
            )}

            {/* User rating */}
            {inDb && (user ? (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ ...LABEL_STYLE, marginBottom: '8px' }}>Your rating</div>
                <StarRating score={myRating} onRate={handleRate} loading={ratingBusy} />
              </div>
            ) : (
              <p style={{ fontSize: '13px', color: 'var(--lb-text-muted)', marginBottom: '20px' }}>
                <Link to="/login" style={{ color: 'var(--lb-green)' }}>Sign in</Link> to rate this movie
              </p>
            ))}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {inDb && (movie.jellyfin_id ? (
                <button
                  onClick={loadStream}
                  disabled={streamLoading}
                  style={{
                    padding: '9px 22px', background: 'var(--lb-green)', border: 'none',
                    color: 'var(--lb-bg)', borderRadius: '4px', fontSize: '11px',
                    fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                    cursor: streamLoading ? 'not-allowed' : 'pointer', opacity: streamLoading ? 0.7 : 1,
                  }}
                >
                  {streamLoading ? 'Loading…' : playerOpen && streamUrl ? '↺ Restart' : '▶ Watch now'}
                </button>
              ) : (
                <button
                  onClick={() => setPlayerOpen(true)}
                  style={{
                    padding: '9px 22px', background: 'var(--lb-bg-3)',
                    border: '1px solid var(--lb-border-2)',
                    color: 'var(--lb-text)', borderRadius: '4px', fontSize: '11px',
                    fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer',
                  }}
                >
                  ▶ Preview
                </button>
              ))}

              {inDb && (user ? (
                <button
                  onClick={handleWatchlist}
                  style={{
                    padding: '9px 18px',
                    background: inWatchlist ? 'var(--lb-green-dim)' : 'var(--lb-bg-3)',
                    border: `1px solid ${inWatchlist ? 'var(--lb-green)' : 'var(--lb-border-2)'}`,
                    borderRadius: '4px',
                    color: inWatchlist ? 'var(--lb-green)' : 'var(--lb-text)',
                    fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em',
                    textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {inWatchlist ? '✓ In watchlist' : '+ Watchlist'}
                </button>
              ) : (
                <Link
                  to="/login"
                  style={{
                    padding: '9px 18px', border: '1px solid var(--lb-border-2)',
                    borderRadius: '4px', color: 'var(--lb-text)', fontSize: '11px',
                    fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
                    textDecoration: 'none',
                  }}
                >
                  + Watchlist
                </Link>
              ))}

              {inDb && user && (
                <button
                  onClick={() => setListModalOpen(true)}
                  style={{
                    padding: '9px 18px', border: '1px solid var(--lb-border-2)',
                    borderRadius: '4px', background: 'var(--lb-bg-3)',
                    color: 'var(--lb-text)', fontSize: '11px', fontWeight: 600,
                    letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer',
                  }}
                >
                  + List
                </button>
              )}

              {inDb && user && movie.jellyfin_id && (
                <button
                  onClick={handleStartParty}
                  disabled={partyLoading}
                  style={{
                    padding: '9px 18px', border: '1px solid var(--lb-border-2)',
                    borderRadius: '4px', background: 'var(--lb-bg-3)',
                    color: 'var(--lb-text)', fontSize: '11px', fontWeight: 600,
                    letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer',
                    opacity: partyLoading ? 0.6 : 1,
                  }}
                >
                  {partyLoading ? 'Creating…' : '⬡ Watch party'}
                </button>
              )}

              {/* Send to friend */}
              {user && (
                <button
                  onClick={() => {
                    setShareSent(null);
                    import('../api/activity').then(({ getFollowing }) =>
                      getFollowing(user.id).then(r => setShareFollowing(r.data.following || []))
                    );
                    setShareModalOpen(true);
                  }}
                  style={{
                    padding: '8px 14px', borderRadius: '4px', fontSize: '12px',
                    fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
                    background: 'var(--lb-bg-3)', border: '1px solid var(--lb-border-2)',
                    color: 'var(--lb-text)', cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}
                >
                  🎬 Send to friend
                </button>
              )}
            </div>

            {/* Share to friend modal */}
            {shareModalOpen && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
                <div style={{ background: 'var(--lb-bg-2)', border: '1px solid var(--lb-border)', borderRadius: '6px', padding: '24px', maxWidth: '360px', width: '100%', margin: '0 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--lb-text-bright)' }}>Send to a friend</h3>
                    <button onClick={() => setShareModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--lb-text-muted)', cursor: 'pointer', fontSize: '16px' }}>✕</button>
                  </div>
                  {shareSent ? (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--lb-green)', fontWeight: 600 }}>
                      ✓ Sent to {shareSent}!
                    </div>
                  ) : shareFollowing.length === 0 ? (
                    <div style={{ color: 'var(--lb-text-muted)', fontSize: '13px' }}>
                      You're not following anyone yet. Follow users to send them films.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: 260, overflowY: 'auto' }}>
                      {shareFollowing.map(u => (
                        <button
                          key={u.id}
                          onClick={async () => {
                            const { getOrCreateThread, sendMessage } = await import('../api/dm');
                            try {
                              const { data } = await getOrCreateThread(u.id);
                              await sendMessage(data.threadId, null, movie.tmdb_id);
                              setShareSent(u.username);
                            } catch {
                              // User no longer exists — refresh the following list
                              const { getFollowing } = await import('../api/activity');
                              getFollowing(user.id).then(r => setShareFollowing(r.data.following || []));
                            }
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            padding: '10px 14px', borderRadius: '4px', cursor: 'pointer',
                            background: 'var(--lb-bg-3)', border: '1px solid var(--lb-border-2)',
                            textAlign: 'left',
                          }}
                        >
                          <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--lb-bg-4)', border: '1px solid var(--lb-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: 'var(--lb-green)', flexShrink: 0 }}>
                            {u.username.slice(0, 2).toUpperCase()}
                          </div>
                          <span style={{ fontSize: '13px', color: 'var(--lb-text-bright)' }}>{u.username}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Add to list modal */}
            {listModalOpen && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
                <div style={{ background: 'var(--lb-bg-2)', border: '1px solid var(--lb-border)', borderRadius: '6px', padding: '24px', maxWidth: '360px', width: '100%', margin: '0 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--lb-text-bright)' }}>Add to list</h3>
                    <button onClick={() => setListModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--lb-text-muted)', cursor: 'pointer', fontSize: '16px' }}>✕</button>
                  </div>
                  {myLists.length === 0
                    ? <div style={{ color: 'var(--lb-text-muted)', fontSize: '13px' }}>
                        No lists yet. <Link to="/lists" style={{ color: 'var(--lb-green)' }} onClick={() => setListModalOpen(false)}>Create one</Link>.
                      </div>
                    : <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {myLists.map(l => (
                          <button key={l.id} onClick={() => handleAddToList(l.id)} disabled={listAdding === l.id} style={{
                            padding: '10px 14px', borderRadius: '4px', border: '1px solid var(--lb-border-2)',
                            background: 'var(--lb-bg-3)', color: 'var(--lb-text-2)',
                            fontSize: '13px', fontWeight: 500, cursor: 'pointer', textAlign: 'left',
                            opacity: listAdding === l.id ? 0.6 : 1,
                          }}>
                            {l.title} <span style={{ color: 'var(--lb-text-muted)', fontSize: '11px' }}>({l.movie_count} films)</span>
                          </button>
                        ))}
                      </div>
                  }
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Overview */}
        <p style={{ fontSize: '15px', lineHeight: 1.75, color: 'var(--lb-text-2)', marginBottom: '32px', maxWidth: '720px' }}>
          {movie.overview}
        </p>

        {/* Key crew */}
        <div style={{
          display: 'flex', gap: '28px', flexWrap: 'wrap',
          marginBottom: '32px', paddingBottom: '28px',
          borderBottom: '1px solid var(--lb-border)',
        }}>
          {director && (
            <div>
              <div style={{ ...LABEL_STYLE, marginBottom: '4px' }}>Director</div>
              <Link to={`/person/${director.id}`} style={{ textDecoration: 'none' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>{director.name}</div>
              </Link>
            </div>
          )}
          {writers.length > 0 && (
            <div>
              <div style={{ ...LABEL_STYLE, marginBottom: '4px' }}>Written by</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>
                {writers.map(w => w.name).join(', ')}
              </div>
            </div>
          )}
        </div>

        {/* Top cast */}
        <div style={{ marginBottom: '36px' }}>
          <div style={{ ...LABEL_STYLE, marginBottom: '14px' }}>Cast</div>
          <div style={{ display: 'flex', gap: '14px', overflowX: 'auto', paddingBottom: '8px' }}>
            {cast.slice(0, 12).map(c => (
              <Link key={c.id} to={`/person/${c.id}`} style={{ flexShrink: 0, width: '72px', textAlign: 'center', textDecoration: 'none' }}>
                {c.profile_path
                  ? <img
                      src={`${PROFILE}${c.profile_path}`}
                      alt={c.name}
                      style={{ width: '72px', height: '72px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--lb-border-2)' }}
                    />
                  : <div style={{
                      width: '72px', height: '72px', borderRadius: '50%',
                      background: 'var(--lb-bg-3)', border: '2px solid var(--lb-border-2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '18px', fontWeight: 700, color: 'var(--lb-text-muted)',
                    }}>
                      {c.name.slice(0, 1)}
                    </div>
                }
                <div style={{ fontSize: '11px', fontWeight: 600, marginTop: '6px', color: 'var(--lb-text-2)', lineHeight: 1.3 }}>
                  {c.name}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--lb-text-muted)', marginTop: '2px', lineHeight: 1.3 }}>
                  {c.character}
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ borderBottom: '1px solid var(--lb-border)', display: 'flex', gap: '0', marginBottom: '28px' }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: '10px 18px', fontSize: '11px', fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                background: 'none', border: 'none',
                borderBottom: `2px solid ${activeTab === t.id ? 'var(--lb-green)' : 'transparent'}`,
                color: activeTab === t.id ? 'var(--lb-green)' : 'var(--lb-text-muted)',
                cursor: 'pointer', transition: 'color 0.15s',
                marginBottom: '-1px',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab: comments */}
        {activeTab === 'comments' && (
          <div>
            {inDb ? (
              user
                ? <CommentForm onSubmit={(body) => handleComment(body)} />
                : <p style={{ fontSize: '13px', color: 'var(--lb-text-muted)', marginBottom: '20px' }}>
                    <Link to="/login" style={{ color: 'var(--lb-green)' }}>Sign in</Link> to leave a comment.
                  </p>
            ) : (
              <p style={{ fontSize: '13px', color: 'var(--lb-text-muted)', marginBottom: '20px' }}>
                Comments are only available for films in the catalog.
              </p>
            )}
            <div style={{ marginTop: '24px' }}>
              {comments.length === 0
                ? <p style={{ fontSize: '14px', color: 'var(--lb-text-muted)' }}>{inDb ? 'No comments yet. Be the first!' : ''}</p>
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
              ? <p style={{ fontSize: '14px', color: 'var(--lb-text-muted)' }}>No TMDB reviews for this movie.</p>
              : tmdbReviews.map(r => (
                  <div key={r.id} style={{ padding: '18px 0', borderBottom: '1px solid var(--lb-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: '50%',
                        background: 'var(--lb-bg-3)', border: '1px solid var(--lb-border-2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '11px', fontWeight: 700, color: 'var(--lb-text)', overflow: 'hidden',
                      }}>
                        {r.avatar_path
                          ? <img src={r.avatar_path.startsWith('/https') ? r.avatar_path.slice(1) : `${PROFILE}${r.avatar_path}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : r.author?.slice(0, 1).toUpperCase()
                        }
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>{r.author}</span>
                      {r.rating && (
                        <span style={{ fontSize: '10px', background: 'rgba(239,159,39,0.15)', color: 'var(--lb-orange)', padding: '2px 8px', borderRadius: '2px', fontWeight: 600 }}>
                          ★ {r.rating}
                        </span>
                      )}
                      <span style={{ fontSize: '11px', color: 'var(--lb-text-muted)', marginLeft: 'auto' }}>
                        {new Date(r.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <ReviewContent content={r.content} />
                  </div>
                ))
            }
          </div>
        )}

        {/* Tab: full cast & crew */}
        {activeTab === 'cast' && (
          <div className="detail-grid-2" style={{ gap: '24px' }}>
            <div>
              <div style={{ ...LABEL_STYLE, marginBottom: '14px' }}>Cast</div>
              {cast.map(c => (
                <div key={c.id} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--lb-border)' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--lb-bg-3)', flexShrink: 0, overflow: 'hidden', border: '1px solid var(--lb-border-2)' }}>
                    {c.profile_path && <img src={`${PROFILE}${c.profile_path}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>{c.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--lb-text-muted)' }}>{c.character}</div>
                  </div>
                </div>
              ))}
            </div>
            <div>
              <div style={{ ...LABEL_STYLE, marginBottom: '14px' }}>Crew</div>
              {crew.map(c => (
                <div key={`${c.id}-${c.job}`} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--lb-border)' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--lb-bg-3)', flexShrink: 0, overflow: 'hidden', border: '1px solid var(--lb-border-2)' }}>
                    {c.profile_path && <img src={`${PROFILE}${c.profile_path}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>{c.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--lb-text-muted)' }}>{c.job}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab: details */}
        {activeTab === 'details' && (
          <div className="detail-grid-2" style={{ gap: '10px' }}>
            {[
              ['Status',         movie.status],
              ['Original title', movie.original_title !== movie.title ? movie.original_title : null],
              ['Language',       movie.original_language?.toUpperCase()],
              ['Budget',         movie.budget > 0 ? `$${Number(movie.budget).toLocaleString()}` : null],
              ['Revenue',        movie.revenue > 0 ? `$${Number(movie.revenue).toLocaleString()}` : null],
              ['IMDB ID',        movie.imdb_id],
              ['Production',     movie.production_companies?.map(c => c.name).join(', ')],
              ['Countries',      movie.countries?.map(c => c.name).join(', ')],
              ['Languages',      movie.languages?.map(l => l.english_name).join(', ')],
              ['Keywords',       movie.keywords?.slice(0, 8).join(', ')],
            ].filter(([, v]) => v).map(([label, value]) => (
              <div key={label} style={{ padding: '12px 14px', background: 'var(--lb-bg-2)', borderRadius: '4px', border: '1px solid var(--lb-border)' }}>
                <div style={{ ...LABEL_STYLE, marginBottom: '4px' }}>{label}</div>
                <div style={{ fontSize: '13px', color: 'var(--lb-text-2)' }}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {/* More like this */}
        {similarMovies.length > 0 && (
          <div style={{ marginTop: '56px', paddingTop: '32px', borderTop: '1px solid var(--lb-border)' }}>
            <div style={{ ...LABEL_STYLE, marginBottom: '18px' }}>More like this</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '14px' }}>
              {similarMovies.map(m => {
                return (
                  <Link key={m.tmdb_id} to={`/movie/${m.tmdb_id}`} style={{ textDecoration: 'none' }}>
                    <div style={{ borderRadius: '4px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
                      {m.poster_path
                        ? <img src={`${POSTER}${m.poster_path}`} alt={m.title} style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover', display: 'block' }} />
                        : <div style={{ aspectRatio: '2/3', background: 'var(--lb-bg-2)' }} />
                      }
                      <div style={{ padding: '7px 8px', background: 'var(--lb-bg-2)' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--lb-text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.title}</div>
                        <div style={{ fontSize: '10px', color: 'var(--lb-text-muted)', marginTop: '2px' }}>
                          {m.year} · ★ {Number(m.vote_average).toFixed(1)}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab: trailers */}
        {activeTab === 'trailers' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {trailers.map(t => (
              <div key={t.key}>
                <div style={{ ...LABEL_STYLE, marginBottom: '8px' }}>{t.name}</div>
                <div style={{ position: 'relative', paddingTop: '56.25%', background: '#000', borderRadius: '6px', overflow: 'hidden' }}>
                  <iframe
                    src={`https://www.youtube.com/embed/${t.key}`}
                    title={t.name}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
