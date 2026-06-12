import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Navbar from '../components/ui/Navbar';
import {
  getAdminStats, getAdminMovies, linkJellyfin, unlinkJellyfin,
  getJellyfinLib, getAdminComments, deleteComment,
  getAdminUsers, setUserRole, deleteUser,
  getAdminSubs, deleteSubtitle,
  uploadVideo, uploadAdminSubtitle,
} from '../api/admin';

// ─── Shared styles ─────────────────────────────────────────────────────────────
const LABEL = { fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--lb-text-muted)' };
const CARD  = { background: 'var(--lb-bg-2)', border: '1px solid var(--lb-border)', borderRadius: '4px' };
const BTN   = (variant = 'default') => ({
  padding: '5px 13px', borderRadius: '3px', fontSize: '11px', fontWeight: 700,
  letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer', border: 'none',
  ...(variant === 'green'  ? { background: 'var(--lb-green)',  color: 'var(--lb-bg)'} :
      variant === 'danger' ? { background: 'rgba(248,113,113,0.15)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)' } :
                             { background: 'var(--lb-bg-3)', color: 'var(--lb-text)', border: '1px solid var(--lb-border-2)' }),
});

function Badge({ children, color = 'var(--lb-green)' }) {
  return (
    <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '2px', background: `${color}22`, color }}>
      {children}
    </span>
  );
}

function SearchInput({ value, onChange, placeholder }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ padding: '7px 12px', fontSize: '12px', borderRadius: '3px', border: '1px solid var(--lb-border-2)', background: 'var(--lb-bg-3)', color: '#fff', width: '100%' }}
    />
  );
}

function Confirm({ message, onConfirm, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
      <div style={{ ...CARD, padding: '24px', maxWidth: '340px', width: '100%', margin: '0 20px' }}>
        <p style={{ fontSize: '14px', color: '#fff', marginBottom: '20px', lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button style={BTN()} onClick={onCancel}>Cancel</button>
          <button style={BTN('danger')} onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ──────────────────────────────────────────────────────────────────
function Dashboard() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    getAdminStats().then(({ data }) => setStats(data)).catch(console.error);
  }, []);

  const items = stats ? [
    { label: 'Movies',       value: stats.movies,           color: '#fff' },
    { label: 'Streamable',   value: stats.streamable,        color: 'var(--lb-green)' },
    { label: 'Users',        value: stats.users,             color: '#60a5fa' },
    { label: 'Comments',     value: stats.comments,          color: '#a78bfa' },
    { label: 'Ratings',      value: stats.ratings,           color: 'var(--lb-orange)' },
    { label: 'Subtitles',    value: stats.subtitles,         color: '#34d399' },
    { label: 'Watchlists',   value: stats.watchlist_entries, color: '#f472b6' },
  ] : [];

  return (
    <div>
      <div style={{ ...LABEL, marginBottom: '20px' }}>Overview</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px' }}>
        {items.map(item => (
          <div key={item.label} style={{ ...CARD, padding: '20px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', fontWeight: 700, color: item.color, lineHeight: 1 }}>
              {stats ? Number(item.value).toLocaleString() : '—'}
            </div>
            <div style={{ ...LABEL, marginTop: '8px' }}>{item.label}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '32px', ...CARD, padding: '20px' }}>
        <div style={{ ...LABEL, marginBottom: '14px' }}>Quick actions</div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Link to="/browse" style={{ ...BTN(), textDecoration: 'none', display: 'inline-block' }}>Browse films</Link>
          <Link to="/"       style={{ ...BTN(), textDecoration: 'none', display: 'inline-block' }}>Home</Link>
        </div>
      </div>
    </div>
  );
}

// ─── Video Upload Modal ────────────────────────────────────────────────────────
function VideoUploadModal({ movie, onClose, onDone }) {
  const [file, setFile]         = useState(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus]     = useState('idle'); // idle | uploading | done | error
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;
    setStatus('uploading');
    setError('');
    setProgress(0);
    try {
      const { data } = await uploadVideo(movie.tmdb_id, file, setProgress);
      setResult(data);
      setStatus('done');
      onDone?.();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Upload failed');
      setStatus('error');
    }
  };

  const fmt = (bytes) => {
    if (!bytes) return '';
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
    return `${(bytes / 1e3).toFixed(0)} KB`;
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 950, padding: '20px' }}>
      <div style={{ ...CARD, width: '100%', maxWidth: '500px' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--lb-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>Upload Video</div>
            <div style={{ fontSize: '11px', color: 'var(--lb-text-muted)', marginTop: '2px' }}>{movie.title} {movie.year && `(${movie.year})`}</div>
          </div>
          {status !== 'uploading' && (
            <button style={{ ...BTN(), padding: '4px 10px' }} onClick={onClose}>✕</button>
          )}
        </div>

        <div style={{ padding: '20px' }}>
          {status === 'done' ? (
            <div>
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>✓</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--lb-green)' }}>Upload complete!</div>
                <div style={{ fontSize: '12px', color: 'var(--lb-text-muted)', marginTop: '4px' }}>
                  Saved as <code style={{ color: 'var(--lb-text-2)' }}>{result?.file}</code>
                  {result?.size && ` (${fmt(result.size)})`}
                </div>
              </div>
              {result?.autoLinked ? (
                <div style={{ background: 'rgba(0,224,84,0.1)', border: '1px solid rgba(0,224,84,0.3)', borderRadius: '4px', padding: '10px 14px', fontSize: '12px', color: 'var(--lb-green)', marginBottom: '16px' }}>
                  ✓ Auto-linked to Jellyfin — movie is now streamable!
                </div>
              ) : (
                <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '4px', padding: '10px 14px', fontSize: '12px', color: 'var(--lb-admin)', marginBottom: '16px' }}>
                  File saved. Jellyfin may still be scanning — use the Link button below if it's not detected automatically.
                </div>
              )}
              <button style={{ ...BTN('green'), width: '100%', padding: '9px' }} onClick={onClose}>Done</button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ ...LABEL, marginBottom: '8px' }}>Video file (MP4, MKV, AVI, MOV, WebM…)</div>
                <input
                  type="file"
                  accept="video/*,.mkv"
                  disabled={status === 'uploading'}
                  onChange={e => setFile(e.target.files[0] || null)}
                  style={{ width: '100%', fontSize: '12px', color: 'var(--lb-text-2)' }}
                />
                {file && (
                  <div style={{ fontSize: '11px', color: 'var(--lb-text-muted)', marginTop: '5px' }}>
                    {file.name} — {fmt(file.size)}
                  </div>
                )}
              </div>

              {status === 'uploading' && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--lb-text)' }}>Uploading…</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--lb-green)' }}>{progress}%</span>
                  </div>
                  <div style={{ height: '4px', background: 'var(--lb-bg-4)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${progress}%`, background: 'var(--lb-green)', borderRadius: '2px', transition: 'width 0.3s' }} />
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--lb-text-muted)', marginTop: '6px' }}>
                    After upload Jellyfin will scan automatically — this may take a few minutes for large files.
                  </div>
                </div>
              )}

              {status === 'error' && (
                <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '4px', padding: '10px 14px', fontSize: '12px', color: '#f87171', marginBottom: '16px' }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={!file || status === 'uploading'}
                style={{ ...BTN('green'), width: '100%', padding: '10px', opacity: !file || status === 'uploading' ? 0.5 : 1 }}
              >
                {status === 'uploading' ? `Uploading ${progress}%…` : 'Upload video'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Subtitle Upload Modal ─────────────────────────────────────────────────────
function SubtitleUploadModal({ movie, onClose, onDone }) {
  const [file, setFile]         = useState(null);
  const [lang, setLang]         = useState('en');
  const [label, setLabel]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [done, setDone]         = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const content = await file.text();
      const lbl = label.trim() || file.name.replace(/\.[^.]+$/, '');
      await uploadAdminSubtitle(movie.tmdb_id, content, lang, lbl);
      setDone(true);
      onDone?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 950, padding: '20px' }}>
      <div style={{ ...CARD, width: '100%', maxWidth: '440px' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--lb-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>Upload Subtitle</div>
            <div style={{ fontSize: '11px', color: 'var(--lb-text-muted)', marginTop: '2px' }}>{movie.title} {movie.year && `(${movie.year})`}</div>
          </div>
          <button style={{ ...BTN(), padding: '4px 10px' }} onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: '20px' }}>
          {done ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>✓</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--lb-green)', marginBottom: '8px' }}>Subtitle uploaded!</div>
              <div style={{ fontSize: '12px', color: 'var(--lb-text-muted)', marginBottom: '16px' }}>Visible to all users when watching this film.</div>
              <button style={{ ...BTN('green'), padding: '9px 24px' }} onClick={onClose}>Done</button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '14px' }}>
                <div style={{ ...LABEL, marginBottom: '6px' }}>Subtitle file (.srt / .vtt)</div>
                <input
                  type="file"
                  accept=".srt,.vtt"
                  onChange={e => setFile(e.target.files[0] || null)}
                  style={{ width: '100%', fontSize: '12px', color: 'var(--lb-text-2)' }}
                  required
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <div style={{ ...LABEL, marginBottom: '6px' }}>Language</div>
                <select value={lang} onChange={e => setLang(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', fontSize: '12px', borderRadius: '3px', border: '1px solid var(--lb-border-2)', background: 'var(--lb-bg-3)', color: '#fff' }}>
                  {[['en','English'],['ro','Romanian'],['fr','French'],['de','German'],
                    ['es','Spanish'],['it','Italian'],['ja','Japanese'],['ko','Korean'],
                    ['pt','Portuguese'],['ru','Russian'],['zh','Chinese'],['und','Other']].map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <div style={{ ...LABEL, marginBottom: '6px' }}>Label (optional)</div>
                <input
                  type="text"
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  placeholder="e.g. English SDH, Forced, Hearing Impaired…"
                  style={{ width: '100%', padding: '7px 10px', fontSize: '12px', borderRadius: '3px', border: '1px solid var(--lb-border-2)', background: 'var(--lb-bg-3)', color: '#fff' }}
                />
              </div>

              {error && (
                <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '4px', padding: '9px 12px', fontSize: '12px', color: '#f87171', marginBottom: '14px' }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !file}
                style={{ ...BTN('green'), width: '100%', padding: '10px', opacity: loading || !file ? 0.5 : 1 }}
              >
                {loading ? 'Uploading…' : 'Upload subtitle'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Streaming: link movies ─────────────────────────────────────────────────────
function StreamingTab() {
  const [movies, setMovies]       = useState([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [search, setSearch]       = useState('');
  const [linked, setLinked]       = useState('');
  const [loading, setLoading]     = useState(false);

  const [jLib, setJLib]           = useState([]);
  const [jSearch, setJSearch]     = useState('');
  const [jLoading, setJLoading]   = useState(false);
  const [jError, setJError]       = useState('');

  const [linking, setLinking]     = useState(null); // movie object being linked
  const [uploading, setUploading] = useState(null); // movie object for video upload
  const [subMovie, setSubMovie]   = useState(null); // movie object for subtitle upload
  const [busy, setBusy]           = useState({});

  const load = useCallback(() => {
    setLoading(true);
    getAdminMovies({ search, page, limit: 25, linked })
      .then(({ data }) => { setMovies(data.movies); setTotal(data.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [search, page, linked]);

  useEffect(() => { load(); }, [load]);

  const loadJellyfin = () => {
    setJLoading(true);
    setJError('');
    getJellyfinLib(jSearch)
      .then(({ data }) => setJLib(data.items))
      .catch(() => setJError('Could not reach Jellyfin. Is it running?'))
      .finally(() => setJLoading(false));
  };

  useEffect(() => { if (linking) loadJellyfin(); }, [linking]);

  const doLink = async (tmdbId, jellyfinId) => {
    setBusy(b => ({ ...b, [tmdbId]: true }));
    try {
      await linkJellyfin(tmdbId, jellyfinId);
      setLinking(null);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Link failed');
    } finally {
      setBusy(b => ({ ...b, [tmdbId]: false }));
    }
  };

  const doUnlink = async (tmdbId) => {
    if (!confirm('Remove Jellyfin link from this movie?')) return;
    setBusy(b => ({ ...b, [tmdbId]: true }));
    try {
      await unlinkJellyfin(tmdbId);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Unlink failed');
    } finally {
      setBusy(b => ({ ...b, [tmdbId]: false }));
    }
  };

  const pages = Math.ceil(total / 25);
  const jFiltered = jLib.filter(i => !jSearch || i.name.toLowerCase().includes(jSearch.toLowerCase()));

  return (
    <div>
      {/* Video upload modal */}
      {uploading && (
        <VideoUploadModal
          movie={uploading}
          onClose={() => setUploading(null)}
          onDone={() => { load(); }}
        />
      )}

      {/* Subtitle upload modal */}
      {subMovie && (
        <SubtitleUploadModal
          movie={subMovie}
          onClose={() => setSubMovie(null)}
          onDone={() => {}}
        />
      )}

      {/* Jellyfin link modal */}
      {linking && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 900, padding: '20px' }}>
          <div style={{ ...CARD, width: '100%', maxWidth: '540px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--lb-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>Link to Jellyfin</div>
                <div style={{ fontSize: '11px', color: 'var(--lb-text-muted)', marginTop: '2px' }}>
                  {linking.title}
                </div>
              </div>
              <button style={{ ...BTN(), padding: '4px 10px' }} onClick={() => setLinking(null)}>✕</button>
            </div>

            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--lb-border)' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  value={jSearch}
                  onChange={e => setJSearch(e.target.value)}
                  placeholder="Search Jellyfin library…"
                  onKeyDown={e => e.key === 'Enter' && loadJellyfin()}
                  style={{ flex: 1, padding: '7px 12px', fontSize: '12px', borderRadius: '3px', border: '1px solid var(--lb-border-2)', background: 'var(--lb-bg-3)', color: '#fff' }}
                />
                <button style={BTN('green')} onClick={loadJellyfin} disabled={jLoading}>
                  {jLoading ? '…' : 'Search'}
                </button>
              </div>
              {jError && <div style={{ fontSize: '12px', color: '#f87171', marginTop: '8px' }}>{jError}</div>}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px' }}>
              {jFiltered.length === 0 && !jLoading && (
                <div style={{ fontSize: '13px', color: 'var(--lb-text-muted)', padding: '20px 0', textAlign: 'center' }}>
                  {jLib.length === 0 ? 'Click Search to load Jellyfin library' : 'No results'}
                </div>
              )}
              {jFiltered.map(item => (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '9px 0', borderBottom: '1px solid var(--lb-border)',
                }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>{item.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--lb-text-muted)', marginTop: '2px' }}>
                      {item.year && `${item.year} · `}
                      {item.runtime && `${item.runtime}m · `}
                      ID: {item.id.slice(0, 8)}…
                      {item.tmdb && <span style={{ color: 'var(--lb-green)', marginLeft: '6px' }}>TMDB:{item.tmdb}</span>}
                    </div>
                  </div>
                  <button
                    style={BTN('green')}
                    onClick={() => doLink(linking.tmdb_id, item.id)}
                    disabled={busy[linking.tmdb_id]}
                  >
                    Link
                  </button>
                </div>
              ))}
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--lb-border)' }}>
              <div style={{ ...LABEL, marginBottom: '6px' }}>Or enter Jellyfin ID manually</div>
              <form onSubmit={e => { e.preventDefault(); doLink(linking.tmdb_id, e.target.jid.value); }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input name="jid" placeholder="Paste Jellyfin item UUID…" style={{ flex: 1, padding: '7px 12px', fontSize: '12px', borderRadius: '3px', border: '1px solid var(--lb-border-2)', background: 'var(--lb-bg-3)', color: '#fff' }} />
                  <button type="submit" style={BTN('green')} disabled={busy[linking.tmdb_id]}>Link</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <div style={{ ...LABEL, marginBottom: '5px' }}>Search movies</div>
          <SearchInput value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Title…" />
        </div>
        <div>
          <div style={{ ...LABEL, marginBottom: '5px' }}>Filter</div>
          <select value={linked} onChange={e => { setLinked(e.target.value); setPage(1); }}
            style={{ padding: '7px 10px', fontSize: '12px', borderRadius: '3px', border: '1px solid var(--lb-border-2)', background: 'var(--lb-bg-3)', color: '#fff' }}>
            <option value="">All movies</option>
            <option value="true">Linked to Jellyfin</option>
            <option value="false">Not linked</option>
          </select>
        </div>
      </div>

      <div style={{ fontSize: '11px', color: 'var(--lb-text-muted)', marginBottom: '12px' }}>
        {total.toLocaleString()} movies
      </div>

      {/* Table */}
      <div style={{ ...CARD, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--lb-border)' }}>
              {['Movie', 'Year', 'Jellyfin', 'Streaming', 'Subtitles'].map(h => (
                <th key={h} style={{ ...LABEL, padding: '10px 14px', textAlign: 'left', fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}><td colSpan={5} style={{ padding: '12px 14px' }}>
                    <div style={{ height: '14px', background: 'var(--lb-bg-3)', borderRadius: '2px', animation: 'pulse 1.5s ease-in-out infinite' }} />
                  </td></tr>
                ))
              : movies.map(m => (
                <tr key={m.tmdb_id} style={{ borderBottom: '1px solid var(--lb-border)', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--lb-bg-3)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td style={{ padding: '10px 14px' }}>
                    <Link to={`/movie/${m.tmdb_id}`} style={{ fontWeight: 600, color: '#fff', textDecoration: 'none' }}>
                      {m.title}
                    </Link>
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--lb-text-muted)' }}>{m.year || '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                      {m.jellyfin_id
                        ? <Badge color="var(--lb-green)">✓ Linked</Badge>
                        : <Badge color="var(--lb-text-muted)">Not linked</Badge>}
                      <button style={{ ...BTN('green'), fontSize: '10px', padding: '3px 9px' }} onClick={() => setLinking(m)} disabled={busy[m.tmdb_id]}>
                        {m.jellyfin_id ? 'Re-link' : 'Link'}
                      </button>
                      {m.jellyfin_id && (
                        <button style={{ ...BTN('danger'), fontSize: '10px', padding: '3px 9px' }} onClick={() => doUnlink(m.tmdb_id)} disabled={busy[m.tmdb_id]}>
                          Unlink
                        </button>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <button
                      style={{ ...BTN(), fontSize: '10px', padding: '4px 10px', color: '#60a5fa', borderColor: 'rgba(96,165,250,0.35)' }}
                      onClick={() => setUploading(m)}
                    >
                      ↑ Upload video
                    </button>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <button
                      style={{ ...BTN(), fontSize: '10px', padding: '4px 10px', color: '#a78bfa', borderColor: 'rgba(167,139,250,0.35)' }}
                      onClick={() => setSubMovie(m)}
                    >
                      ↑ Add subtitle
                    </button>
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginTop: '20px' }}>
          <button style={BTN()} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button>
          <span style={{ padding: '5px 12px', fontSize: '12px', color: 'var(--lb-text)' }}>{page} / {pages}</span>
          <button style={BTN()} onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}>Next →</button>
        </div>
      )}
    </div>
  );
}

// ─── Comments moderation ────────────────────────────────────────────────────────
function CommentsTab() {
  const [comments, setComments] = useState([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState('');
  const [movie, setMovie]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [confirm, setConfirm]   = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    getAdminComments({ page, limit: 30, search, movie })
      .then(({ data }) => { setComments(data.comments); setTotal(data.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, search, movie]);

  useEffect(() => { load(); }, [load]);

  const doDelete = async (id) => {
    try {
      await deleteComment(id);
      setComments(c => c.filter(x => x.id !== id));
      setTotal(t => t - 1);
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    }
    setConfirm(null);
  };

  const pages = Math.ceil(total / 30);

  return (
    <div>
      {confirm && <Confirm message={`Delete comment by ${confirm.username}?`} onConfirm={() => doDelete(confirm.id)} onCancel={() => setConfirm(null)} />}

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '180px' }}>
          <div style={{ ...LABEL, marginBottom: '5px' }}>Search in body</div>
          <SearchInput value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Text…" />
        </div>
        <div style={{ flex: 1, minWidth: '180px' }}>
          <div style={{ ...LABEL, marginBottom: '5px' }}>Filter by movie</div>
          <SearchInput value={movie} onChange={v => { setMovie(v); setPage(1); }} placeholder="Movie title…" />
        </div>
      </div>

      <div style={{ fontSize: '11px', color: 'var(--lb-text-muted)', marginBottom: '12px' }}>{total.toLocaleString()} comments</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ ...CARD, padding: '14px', height: '70px', animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))
          : comments.map(c => (
            <div key={c.id} style={{ ...CARD, padding: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--lb-green)' }}>{c.username}</span>
                    <span style={{ fontSize: '11px', color: 'var(--lb-text-muted)' }}>on</span>
                    <Link to={`/movie/${c.tmdb_id}`} style={{ fontSize: '12px', fontWeight: 600, color: '#fff', textDecoration: 'none' }}>{c.movie_title}</Link>
                    {c.parent_id && <Badge color="var(--lb-text-muted)">reply</Badge>}
                    <span style={{ fontSize: '11px', color: 'var(--lb-text-muted)', marginLeft: 'auto' }}>
                      {new Date(c.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--lb-text-2)', margin: 0, lineHeight: 1.5, wordBreak: 'break-word' }}>
                    {c.body.length > 300 ? c.body.slice(0, 300) + '…' : c.body}
                  </p>
                </div>
                <button style={{ ...BTN('danger'), flexShrink: 0 }} onClick={() => setConfirm(c)}>Delete</button>
              </div>
            </div>
          ))
        }
        {!loading && comments.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--lb-text-muted)', fontSize: '13px' }}>No comments found.</div>
        )}
      </div>

      {pages > 1 && (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginTop: '20px' }}>
          <button style={BTN()} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button>
          <span style={{ padding: '5px 12px', fontSize: '12px', color: 'var(--lb-text)' }}>{page} / {pages}</span>
          <button style={BTN()} onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}>Next →</button>
        </div>
      )}
    </div>
  );
}

// ─── Users ──────────────────────────────────────────────────────────────────────
function UsersTab({ currentUserId }) {
  const [users, setUsers]     = useState([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [search, setSearch]   = useState('');
  const [userType, setUserType] = useState('real'); // real | sim | ml25m | all
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy]       = useState({});

  const load = useCallback(() => {
    setLoading(true);
    getAdminUsers({ page, limit: 30, search, type: userType })
      .then(({ data }) => { setUsers(data.users); setTotal(data.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, search, userType]);

  useEffect(() => { load(); }, [load]);

  const doRoleToggle = async (user) => {
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    setBusy(b => ({ ...b, [user.id]: true }));
    try {
      await setUserRole(user.id, newRole);
      setUsers(us => us.map(u => u.id === user.id ? { ...u, role: newRole } : u));
    } catch (err) {
      alert(err.response?.data?.error || 'Role change failed');
    } finally {
      setBusy(b => ({ ...b, [user.id]: false }));
    }
  };

  const doDelete = async (user) => {
    try {
      await deleteUser(user.id);
      setUsers(us => us.filter(u => u.id !== user.id));
      setTotal(t => t - 1);
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    }
    setConfirm(null);
  };

  const pages = Math.ceil(total / 30);

  return (
    <div>
      {confirm && <Confirm message={`Delete user "${confirm.username}"? This will remove all their ratings, comments and history.`} onConfirm={() => doDelete(confirm)} onCancel={() => setConfirm(null)} />}

      <div style={{ marginBottom: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {[['real','Real users'],['sim','Simulated'],['ml25m','ML-25M'],['all','All']].map(([v, label]) => (
          <button key={v} onClick={() => { setUserType(v); setPage(1); }} style={{
            padding: '4px 12px', borderRadius: '3px', fontSize: '11px', fontWeight: 700,
            letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer', border: 'none',
            background: userType === v ? 'var(--lb-green)' : 'var(--lb-bg-3)',
            color: userType === v ? 'var(--lb-bg)' : 'var(--lb-text)',
          }}>{label}</button>
        ))}
        <span style={{ fontSize: '11px', color: 'var(--lb-text-muted)', marginLeft: 4 }}>{total.toLocaleString()} users</span>
      </div>

      <div style={{ marginBottom: '20px', maxWidth: '320px' }}>
        <div style={{ ...LABEL, marginBottom: '5px' }}>Search users</div>
        <SearchInput value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Username or email…" />
      </div>

      <div style={{ fontSize: '11px', color: 'var(--lb-text-muted)', marginBottom: '12px' }}>{total.toLocaleString()} users</div>

      <div style={{ ...CARD, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--lb-border)' }}>
              {['Username', 'Email', 'Role', 'Joined', 'Activity', 'Actions'].map(h => (
                <th key={h} style={{ ...LABEL, padding: '10px 14px', textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}><td colSpan={6} style={{ padding: '12px 14px' }}>
                    <div style={{ height: '13px', background: 'var(--lb-bg-3)', borderRadius: '2px', animation: 'pulse 1.5s ease-in-out infinite' }} />
                  </td></tr>
                ))
              : users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--lb-border)', opacity: busy[u.id] ? 0.6 : 1 }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--lb-bg-3)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: '#fff' }}>{u.username}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--lb-text)' }}>{u.email}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <Badge color={u.role === 'admin' ? 'var(--lb-admin)' : 'var(--lb-text-muted)'}>{u.role}</Badge>
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--lb-text-muted)' }}>
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--lb-text-muted)' }}>
                    {u.watched_count}w · {u.rating_count}r · {u.comment_count}c
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {u.id !== currentUserId && (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          style={BTN(u.role === 'admin' ? 'default' : 'green')}
                          onClick={() => doRoleToggle(u)}
                          disabled={busy[u.id]}
                        >
                          {u.role === 'admin' ? 'Demote' : 'Make admin'}
                        </button>
                        <button style={BTN('danger')} onClick={() => setConfirm(u)} disabled={busy[u.id]}>
                          Del
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginTop: '20px' }}>
          <button style={BTN()} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button>
          <span style={{ padding: '5px 12px', fontSize: '12px', color: 'var(--lb-text)' }}>{page} / {pages}</span>
          <button style={BTN()} onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}>Next →</button>
        </div>
      )}
    </div>
  );
}

// ─── Subtitles ──────────────────────────────────────────────────────────────────
function SubtitlesTab() {
  const [subs, setSubs]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    getAdminSubs({ page, limit: 30 })
      .then(({ data }) => { setSubs(data.subtitles); setTotal(data.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const doDelete = async (sub) => {
    try {
      await deleteSubtitle(sub.id);
      setSubs(s => s.filter(x => x.id !== sub.id));
      setTotal(t => t - 1);
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    }
    setConfirm(null);
  };

  const pages = Math.ceil(total / 30);

  return (
    <div>
      {confirm && <Confirm message={`Delete subtitle "${confirm.label}" by ${confirm.username}?`} onConfirm={() => doDelete(confirm)} onCancel={() => setConfirm(null)} />}

      <div style={{ fontSize: '11px', color: 'var(--lb-text-muted)', marginBottom: '12px' }}>{total.toLocaleString()} community subtitles</div>

      <div style={{ ...CARD, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--lb-border)' }}>
              {['Movie', 'Label', 'Lang', 'Uploaded by', 'Size', 'Date', ''].map(h => (
                <th key={h} style={{ ...LABEL, padding: '10px 14px', textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}><td colSpan={7} style={{ padding: '12px 14px' }}>
                    <div style={{ height: '13px', background: 'var(--lb-bg-3)', borderRadius: '2px', animation: 'pulse 1.5s ease-in-out infinite' }} />
                  </td></tr>
                ))
              : subs.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--lb-border)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--lb-bg-3)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td style={{ padding: '10px 14px' }}>
                    <Link to={`/movie/${s.tmdb_id}`} style={{ fontWeight: 600, color: '#fff', textDecoration: 'none' }}>{s.movie_title}</Link>
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--lb-text)' }}>{s.label}</td>
                  <td style={{ padding: '10px 14px' }}><Badge color="var(--lb-green)">{s.language}</Badge></td>
                  <td style={{ padding: '10px 14px', color: 'var(--lb-text)' }}>{s.username}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--lb-text-muted)' }}>
                    {Math.round(s.size_chars / 1024)}KB
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--lb-text-muted)' }}>
                    {new Date(s.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <button style={BTN('danger')} onClick={() => setConfirm(s)}>Delete</button>
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginTop: '20px' }}>
          <button style={BTN()} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button>
          <span style={{ padding: '5px 12px', fontSize: '12px', color: 'var(--lb-text)' }}>{page} / {pages}</span>
          <button style={BTN()} onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}>Next →</button>
        </div>
      )}
    </div>
  );
}

// ─── ML Service Tab ─────────────────────────────────────────────────────────────
function MLServiceTab() {
  const [health, setHealth]           = useState(null);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [retrainStep, setRetrainStep] = useState('');
  const [retrainElapsed, setRetrainElapsed] = useState(0);
  const [evalResult, setEvalResult]   = useState(null);
  const [evaluating, setEvaluating]   = useState(false);
  const [evalElapsed, setEvalElapsed] = useState(0);
  const [msg, setMsg]                 = useState('');

  const loadHealth = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/recommendations/health', { credentials: 'include' });
      setHealth(r.ok ? await r.json() : null);
    } catch { setHealth(null); }
    setLoading(false);
  }, []);

  useEffect(() => { loadHealth(); }, [loadHealth]);

  // elapsed timer while an operation is running
  useEffect(() => {
    if (!refreshing) return;
    setRetrainElapsed(0);
    const id = setInterval(() => setRetrainElapsed(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [refreshing]);

  useEffect(() => {
    if (!evaluating) return;
    setEvalElapsed(0);
    const id = setInterval(() => setEvalElapsed(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [evaluating]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setMsg('');
    setRetrainStep('Loading data from database…');
    try {
      // Sequence: data loads first (~2s), then models train (~30-90s)
      setTimeout(() => setRetrainStep('Training FunkSVD collaborative filter…'), 3000);
      setTimeout(() => setRetrainStep('Training ALS implicit feedback model…'), 35000);
      const r = await fetch('/api/recommendations/refresh', { method: 'POST', credentials: 'include' });
      const d = await r.json();
      setMsg(d.error
        ? `Error: ${d.error}`
        : `Done in ${d.elapsed_s ?? '?'}s — ${d.movies?.toLocaleString()} movies, ${d.ratings?.toLocaleString()} ratings`);
      setRetrainStep('');
      loadHealth();
    } catch { setMsg('Could not reach ML service.'); setRetrainStep(''); }
    setRefreshing(false);
  };

  const handleEvaluate = async () => {
    setEvaluating(true);
    setEvalResult(null);
    try {
      const r = await fetch('/api/recommendations/evaluate', { credentials: 'include' });
      setEvalResult(await r.json());
    } catch { setEvalResult({ error: 'Could not reach ML service.' }); }
    setEvaluating(false);
  };

  const online = health && health.status === 'ok';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Status bar */}
      <div style={{ ...CARD, padding: '20px 24px', display: 'flex', gap: '32px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <span style={LABEL}>Status</span>
          <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: online ? '#22c55e' : '#f87171', display: 'inline-block' }} />
            <span style={{ fontSize: '14px', fontWeight: 600, color: online ? '#22c55e' : 'var(--lb-danger)' }}>
              {loading ? 'Checking…' : online ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
        {health && <>
          <div>
            <span style={LABEL}>Movies loaded</span>
            <div style={{ fontSize: '13px', color: 'var(--lb-text-2)', marginTop: '4px' }}>{health.movies ?? '—'}</div>
          </div>
          <div>
            <span style={LABEL}>Ratings loaded</span>
            <div style={{ fontSize: '13px', color: 'var(--lb-text-2)', marginTop: '4px' }}>{health.ratings ?? '—'}</div>
          </div>
          <div>
            <span style={LABEL}>Watch events</span>
            <div style={{ fontSize: '13px', color: 'var(--lb-text-2)', marginTop: '4px' }}>{health.watch_events ?? '—'}</div>
          </div>
        </>}
        <button onClick={loadHealth} style={BTN()} disabled={loading}>↻ Poll</button>
      </div>

      {/* Model status */}
      <div style={CARD}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--lb-border)' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--lb-text-2)' }}>Model status</span>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {[
            { label: 'FunkSVD (CF)', key: 'cf_ready' },
            { label: 'ALS (implicit)', key: 'als_ready' },
            { label: 'Genome tags', key: 'genome_ready' },
          ].map(({ label, key }) => {
            const ready = health?.[key];
            return (
              <div key={key} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '8px 14px', borderRadius: '4px',
                background: ready ? 'rgba(0,224,84,0.08)' : 'rgba(248,113,113,0.08)',
                border: `1px solid ${ready ? 'rgba(0,224,84,0.25)' : 'rgba(248,113,113,0.25)'}`,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: ready ? 'var(--lb-green)' : 'var(--lb-danger)', display: 'inline-block' }} />
                <span style={{ fontSize: '12px', fontWeight: 600, color: ready ? 'var(--lb-green)' : 'var(--lb-danger)' }}>{label}</span>
                {key === 'genome_ready' && health?.genome_movies > 0 && (
                  <span style={{ fontSize: '11px', color: 'var(--lb-text-muted)' }}>({health.genome_movies} movies)</span>
                )}
              </div>
            );
          })}
          {!health && !loading && (
            <span style={{ fontSize: '13px', color: 'var(--lb-text-muted)' }}>ML service offline — model status unavailable.</span>
          )}
        </div>
      </div>

      {/* Controls */}
      <div style={CARD}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--lb-border)' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--lb-text-2)' }}>Controls</span>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Retrain */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '24px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>Retrain models</div>
              <div style={{ fontSize: '12px', color: 'var(--lb-text-muted)', lineHeight: 1.5 }}>
                Reloads data from DB and retrains FunkSVD + ALS models immediately.
                Takes 30–120 s depending on dataset size.
              </div>
            </div>
            <button onClick={handleRefresh} disabled={refreshing || !online} style={BTN('green')}>
              {refreshing ? `Retraining… ${retrainElapsed}s` : 'Retrain now'}
            </button>
          </div>

          {refreshing && retrainStep && (
            <div style={{ fontSize: '12px', padding: '10px 14px', borderRadius: '4px', background: 'var(--lb-bg-3)', border: '1px solid var(--lb-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--lb-green)', animation: 'pulse 1s ease-in-out infinite' }} />
              <span style={{ color: 'var(--lb-text-2)' }}>{retrainStep}</span>
              <span style={{ color: 'var(--lb-text-muted)', marginLeft: 'auto' }}>{retrainElapsed}s elapsed</span>
            </div>
          )}

          {msg && !refreshing && (
            <div style={{ fontSize: '12px', padding: '8px 12px', borderRadius: '4px', background: 'var(--lb-bg-3)', color: 'var(--lb-text-2)', border: '1px solid var(--lb-border)' }}>
              ✓ {msg}
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--lb-border)', paddingTop: '20px', display: 'flex', alignItems: 'flex-start', gap: '24px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>Evaluate SVD</div>
              <div style={{ fontSize: '12px', color: 'var(--lb-text-muted)', lineHeight: 1.5 }}>
                Runs RMSE and MAE on a 20% held-out split of DB ratings to check model quality.
              </div>
            </div>
            <button onClick={handleEvaluate} disabled={evaluating || !online} style={BTN()}>
              {evaluating ? `Evaluating… ${evalElapsed}s` : 'Evaluate'}
            </button>
          </div>

          {evalResult && (
            <div style={{ background: 'var(--lb-bg-3)', borderRadius: '4px', padding: '14px 18px', display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
              {evalResult.error ? (
                <span style={{ fontSize: '13px', color: 'var(--lb-danger)' }}>{evalResult.error}</span>
              ) : (
                <>
                  <div>
                    <span style={LABEL}>RMSE</span>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--lb-green)', marginTop: '2px' }}>{evalResult.rmse}</div>
                  </div>
                  <div>
                    <span style={LABEL}>MAE</span>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--lb-green)', marginTop: '2px' }}>{evalResult.mae}</div>
                  </div>
                  <div>
                    <span style={LABEL}>Test samples</span>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--lb-text-2)', marginTop: '2px' }}>{evalResult.n_test}</div>
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Jellyfin Health Tab ────────────────────────────────────────────────────────
function JellyfinHealthTab() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/jellyfin/health', { credentials: 'include' });
      setHealth(r.ok ? await r.json() : null);
    } catch { setHealth(null); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ color: 'var(--lb-text)', padding: '40px', textAlign: 'center' }}>Loading…</div>;
  if (!health) return (
    <div style={{ color: 'var(--lb-danger)', padding: '24px' }}>Could not reach Jellyfin. Check that the service is running.</div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Status bar */}
      <div style={{ ...CARD, padding: '20px 24px', display: 'flex', gap: '32px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--lb-text-muted)' }}>Status</span>
          <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: health.online ? '#22c55e' : '#f87171', display: 'inline-block' }} />
            <span style={{ fontSize: '14px', fontWeight: 600, color: health.online ? '#22c55e' : 'var(--lb-danger)' }}>
              {health.online ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
        {health.version && (
          <div>
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--lb-text-muted)' }}>Version</span>
            <div style={{ fontSize: '13px', color: 'var(--lb-text-2)', marginTop: '4px' }}>{health.version}</div>
          </div>
        )}
        {health.server_name && (
          <div>
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--lb-text-muted)' }}>Server</span>
            <div style={{ fontSize: '13px', color: 'var(--lb-text-2)', marginTop: '4px' }}>{health.server_name}</div>
          </div>
        )}
        <div>
          <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--lb-text-muted)' }}>Library</span>
          <div style={{ fontSize: '13px', color: 'var(--lb-text-2)', marginTop: '4px' }}>{health.library_movie_count ?? '—'} movies</div>
        </div>
        <div>
          <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--lb-text-muted)' }}>Library scan</span>
          <div style={{ fontSize: '13px', marginTop: '4px' }}>
            {health.scan_running
              ? <span style={{ color: 'var(--lb-admin)', fontWeight: 600 }}>● Running</span>
              : <span style={{ color: 'var(--lb-text-muted)' }}>
                  {health.scan_last_run ? new Date(health.scan_last_run).toLocaleString() : 'Never'}
                </span>
            }
          </div>
        </div>
        <button onClick={load} style={BTN()}>Refresh</button>
      </div>

      {/* Active streams */}
      <div style={CARD}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--lb-border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--lb-text-2)' }}>Active streams</span>
          <Badge>{health.active_streams}</Badge>
        </div>
        {health.sessions.length === 0 ? (
          <div style={{ padding: '20px', fontSize: '13px', color: 'var(--lb-text-muted)' }}>No active streams.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  {['User', 'Movie', 'Client', 'Method', 'Bitrate', 'Progress'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--lb-text-muted)', borderBottom: '1px solid var(--lb-border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {health.sessions.map((s, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--lb-border)' }}>
                    <td style={{ padding: '10px 16px', color: 'var(--lb-text-2)', fontWeight: 600 }}>{s.username}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--lb-text-2)' }}>{s.movie}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--lb-text-muted)' }}>{s.client}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <Badge color={s.play_method === 'Direct' ? 'var(--lb-green)' : 'var(--lb-admin)'}>{s.play_method}</Badge>
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--lb-text-muted)' }}>
                      {s.bitrate ? `${Math.round(s.bitrate / 1000)} kbps` : '—'}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: 80, height: 4, background: 'var(--lb-bg-3)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${s.progress_pct}%`, background: 'var(--lb-green)', borderRadius: '2px' }} />
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--lb-text-muted)' }}>{s.progress_pct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main AdminPage ─────────────────────────────────────────────────────────────
// ─── Insights Tab ────────────────────────────────────────────────────────────
function InsightsTab() {
  const [topMovies, setTopMovies]   = useState(null);
  const [abandon, setAbandon]       = useState(null);
  const [active, setActive]         = useState(null);
  const [ctr, setCtr]               = useState(null);
  const [genres, setGenres]         = useState(null);
  const POSTER = 'https://image.tmdb.org/t/p/w92';

  useEffect(() => {
    fetch('/api/admin/insights/top-movies',       { credentials: 'include' }).then(r => r.json()).then(d => setTopMovies(d.movies || [])).catch(() => setTopMovies([]));
    fetch('/api/admin/insights/abandonment',      { credentials: 'include' }).then(r => r.json()).then(d => setAbandon(d.movies || [])).catch(() => setAbandon([]));
    fetch('/api/admin/insights/active-users',     { credentials: 'include' }).then(r => r.json()).then(d => setActive(d)).catch(() => setActive(null));
    fetch('/api/admin/insights/recommendation-ctr', { credentials: 'include' }).then(r => r.json()).then(d => setCtr(d.by_strategy || [])).catch(() => setCtr([]));
    fetch('/api/admin/insights/genre-breakdown',  { credentials: 'include' }).then(r => r.json()).then(d => setGenres(d.genres || [])).catch(() => setGenres([]));
  }, []);

  const maxHours = genres?.length ? Math.max(...genres.map(g => parseFloat(g.total_hours)), 1) : 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Active users */}
      {active && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          {[['DAU', active.dau, '24h'], ['WAU', active.wau, '7 days'], ['MAU', active.mau, '30 days']].map(([label, val, sub]) => (
            <div key={label} style={{ ...CARD, textAlign: 'center', padding: 16 }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--lb-green)' }}>{val}</div>
              <div style={{ ...LABEL, marginTop: 4 }}>{label}</div>
              <div style={{ fontSize: 10, color: 'var(--lb-text-muted)', marginTop: 2 }}>active in {sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Genre watch hours */}
      {genres && (
        <div style={CARD}>
          <div style={{ ...LABEL, marginBottom: 14 }}>Watch hours by genre</div>
          {genres.slice(0, 12).map(g => (
            <div key={g.name} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 90, fontSize: 11, color: 'var(--lb-text-2)', fontWeight: 600, flexShrink: 0 }}>{g.name}</div>
              <div style={{ flex: 1, background: 'var(--lb-bg-3)', borderRadius: 2, height: 5, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'var(--lb-green)', width: `${Math.round((g.total_hours / maxHours) * 100)}%` }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--lb-text-muted)', width: 50, textAlign: 'right' }}>{g.total_hours}h</div>
            </div>
          ))}
        </div>
      )}

      {/* Recommendation CTR */}
      {ctr && ctr.length > 0 && (
        <div style={CARD}>
          <div style={{ ...LABEL, marginBottom: 14 }}>Recommendation acceptance by strategy</div>
          {ctr.map(s => (
            <div key={s.strategy} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 140, fontSize: 11, color: 'var(--lb-text-muted)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.strategy}</div>
              <div style={{ flex: 1, background: 'var(--lb-bg-3)', borderRadius: 2, height: 5, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'var(--lb-orange)', width: `${Math.min(s.acceptance_rate, 100)}%` }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--lb-text-muted)', width: 36, textAlign: 'right' }}>{s.acceptance_rate}%</div>
              <div style={{ fontSize: 10, color: 'var(--lb-text-muted)', width: 50, textAlign: 'right' }}>{s.shown} shown</div>
            </div>
          ))}
        </div>
      )}

      {/* Top movies */}
      {topMovies && (
        <div style={CARD}>
          <div style={{ ...LABEL, marginBottom: 14 }}>Most watched films</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>{['Film','Watches','Avg completion'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--lb-text-muted)', borderBottom: '1px solid var(--lb-border)' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {topMovies.slice(0, 15).map((m, i) => (
                  <tr key={m.tmdb_id} style={{ borderBottom: '1px solid var(--lb-border)' }}>
                    <td style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, color: 'var(--lb-text-muted)', width: 16 }}>{i + 1}</span>
                      {m.poster_path && <img src={`${POSTER}${m.poster_path}`} alt="" style={{ width: 20, height: 30, objectFit: 'cover', borderRadius: 2 }} />}
                      <span style={{ color: 'var(--lb-text-2)' }}>{m.title}</span>
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--lb-text-muted)' }}>{m.watch_count}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--lb-text-muted)' }}>{m.avg_completion_pct ? `${m.avg_completion_pct}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Abandonment */}
      {abandon && abandon.length > 0 && (
        <div style={CARD}>
          <div style={{ ...LABEL, marginBottom: 14 }}>Highest abandonment rate</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>{['Film','Started','Avg watched'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--lb-text-muted)', borderBottom: '1px solid var(--lb-border)' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {abandon.slice(0, 10).map(m => (
                  <tr key={m.tmdb_id} style={{ borderBottom: '1px solid var(--lb-border)' }}>
                    <td style={{ padding: '8px 12px', color: 'var(--lb-text-2)' }}>{m.title}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--lb-text-muted)' }}>{m.started_count}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--lb-danger)' }}>{m.avg_completion_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main AdminPage ─────────────────────────────────────────────────────────────
const TABS = [
  { id: 'dashboard',  label: 'Dashboard' },
  { id: 'streaming',  label: 'Streaming' },
  { id: 'comments',   label: 'Comments' },
  { id: 'users',      label: 'Users' },
  { id: 'subtitles',  label: 'Subtitles' },
  { id: 'insights',   label: 'Insights' },
  { id: 'ml',         label: 'ML Service' },
  { id: 'jellyfin',   label: 'Jellyfin Health' },
];

export default function AdminPage() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const [tab, setTab] = useState('dashboard');

  useEffect(() => {
    if (user && user.role !== 'admin') navigate('/');
  }, [user, navigate]);

  if (!user || user.role !== 'admin') return null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--lb-bg)' }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
      <Navbar />

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px 80px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px', paddingBottom: '24px', borderBottom: '1px solid var(--lb-border)' }}>
          <div style={{ width: 40, height: 40, borderRadius: '4px', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
            ⚙
          </div>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>Admin Panel</h1>
            <div style={{ fontSize: '12px', color: 'var(--lb-text-muted)', marginTop: '2px' }}>Signed in as {user.username}</div>
          </div>
        </div>

        {/* Tab nav */}
        <div className="admin-tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '9px 18px', fontSize: '11px', fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: `2px solid ${tab === t.id ? 'var(--lb-admin)' : 'transparent'}`,
                color: tab === t.id ? 'var(--lb-admin)' : 'var(--lb-text-muted)',
                transition: 'color 0.15s', marginBottom: '-1px',
                flexShrink: 0, whiteSpace: 'nowrap',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'streaming' && <StreamingTab />}
        {tab === 'comments'  && <CommentsTab />}
        {tab === 'users'     && <UsersTab currentUserId={user.id} />}
        {tab === 'subtitles' && <SubtitlesTab />}
        {tab === 'insights'  && <InsightsTab />}
        {tab === 'ml'        && <MLServiceTab />}
        {tab === 'jellyfin'  && <JellyfinHealthTab />}
      </div>
    </div>
  );
}
