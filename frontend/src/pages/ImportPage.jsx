import { useState, useRef } from 'react';
import Navbar from '../components/ui/Navbar';
import { importCSV } from '../api/import';

const SOURCE_INFO = {
  letterboxd: {
    label: 'Letterboxd',
    color: '#00c030',
    files: [
      { name: 'ratings.csv',   desc: 'Your star ratings (0.5–5★ → scaled to 1–10)' },
      { name: 'diary.csv',     desc: 'Your diary entries with ratings and watch dates' },
      { name: 'watchlist.csv', desc: 'Your watchlist (imported as Cinemate watchlist)' },
    ],
    steps: [
      'Go to letterboxd.com and sign in',
      'Settings → Data → Export Your Data',
      'You\'ll receive an email with a ZIP file',
      'Extract and upload ratings.csv, diary.csv, or watchlist.csv below',
    ],
    exportUrl: 'https://letterboxd.com/settings/data/',
  },
  imdb: {
    label: 'IMDb',
    color: '#f5c518',
    files: [
      { name: 'ratings.csv',   desc: 'Your IMDb ratings (1–10, imported directly)' },
      { name: 'watchlist.csv', desc: 'Your IMDb watchlist' },
    ],
    steps: [
      'Go to imdb.com and sign in',
      'Your Activity → Ratings → ··· menu → Export',
      'For watchlist: imdb.com/list/watchlist → Export',
      'Upload the downloaded CSV below',
    ],
    exportUrl: 'https://www.imdb.com/list/ratings',
  },
};

const STATUS_STYLE = {
  rated:     { label: 'Imported',  color: '#00e054', bg: '#00e05418' },
  watchlist: { label: 'Watchlist', color: '#60a5fa', bg: '#60a5fa18' },
  not_found: { label: 'Not found', color: '#f87171', bg: '#f8717118' },
};

export default function ImportPage() {
  const [source, setSource]   = useState('letterboxd');
  const [dragging, setDragging] = useState(false);
  const [file, setFile]       = useState(null);
  const [loading, setLoading]     = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [phase, setPhase]         = useState(''); // 'uploading' | 'processing' | ''
  const [result, setResult]       = useState(null);
  const [error, setError]         = useState('');
  const [filter, setFilter]       = useState('all');
  const inputRef = useRef();

  const info = SOURCE_INFO[source];

  const handleFile = f => {
    if (!f) return;
    if (!f.name.endsWith('.csv')) { setError('Please upload a .csv file.'); return; }
    setFile(f);
    setResult(null);
    setError('');
  };

  const handleDrop = e => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    setUploadPct(0);
    setPhase('uploading');
    setError('');
    setResult(null);
    try {
      const data = await importCSV(file, (e) => {
        const pct = Math.round((e.loaded / e.total) * 100);
        setUploadPct(pct);
        if (pct >= 100) setPhase('processing');
      });
      setResult(data);
    } catch (e) {
      setError(e.response?.data?.error || 'Import failed. Check the file format and try again.');
    } finally {
      setLoading(false);
      setPhase('');
      setUploadPct(0);
    }
  };

  const filteredResults = result?.results?.filter(r =>
    filter === 'all' ? true :
    filter === 'rated' ? r.status === 'rated' :
    filter === 'watchlist' ? r.status === 'watchlist' :
    r.status === 'not_found'
  ) ?? [];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--lb-bg)', color: 'var(--lb-text)' }}>
      <Navbar />

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px' }}>
        <h1 style={{ color: 'var(--lb-text-bright)', fontSize: '22px', fontWeight: 700, marginBottom: 6 }}>
          Import your film history
        </h1>
        <p style={{ color: 'var(--lb-text)', fontSize: '14px', marginBottom: 32 }}>
          Bring your ratings and watchlist from Letterboxd or IMDb into Cinemate.
          Matched films will be rated and added to your watch history automatically.
        </p>

        {/* Source picker */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
          {Object.entries(SOURCE_INFO).map(([key, s]) => (
            <button
              key={key}
              onClick={() => { setSource(key); setFile(null); setResult(null); setError(''); }}
              style={{
                padding: '10px 24px', borderRadius: 6, fontWeight: 700,
                fontSize: 13, cursor: 'pointer', border: '2px solid',
                borderColor: source === key ? s.color : 'var(--lb-bg-3)',
                background: source === key ? s.color + '18' : 'var(--lb-bg-2)',
                color: source === key ? s.color : 'var(--lb-text)',
                transition: 'all 0.15s',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
          {/* Export instructions */}
          <div style={{ background: 'var(--lb-bg-2)', borderRadius: 8, padding: 24 }}>
            <h2 style={{ color: 'var(--lb-text-bright)', fontSize: 14, fontWeight: 700, marginBottom: 16 }}>
              How to export from {info.label}
            </h2>
            <ol style={{ paddingLeft: 18, margin: '0 0 20px' }}>
              {info.steps.map((s, i) => (
                <li key={i} style={{ fontSize: 13, marginBottom: 8, lineHeight: 1.5 }}>{s}</li>
              ))}
            </ol>
            <h3 style={{ color: 'var(--lb-text-2)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              Supported files
            </h3>
            {info.files.map(f => (
              <div key={f.name} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
                <code style={{ fontSize: 11, background: 'var(--lb-bg-3)', borderRadius: 4, padding: '2px 6px', color: info.color, whiteSpace: 'nowrap', marginTop: 1 }}>
                  {f.name}
                </code>
                <span style={{ fontSize: 12, lineHeight: 1.5 }}>{f.desc}</span>
              </div>
            ))}
          </div>

          {/* Upload area */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              style={{
                flex: 1, border: `2px dashed ${dragging ? info.color : file ? '#00e054' : 'var(--lb-bg-4)'}`,
                borderRadius: 8, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', padding: 32,
                cursor: 'pointer', transition: 'border-color 0.15s',
                background: dragging ? info.color + '08' : file ? '#00e05408' : 'var(--lb-bg-2)',
                minHeight: 160,
              }}
            >
              <input ref={inputRef} type="file" accept=".csv" style={{ display: 'none' }}
                onChange={e => handleFile(e.target.files[0])} />
              <div style={{ fontSize: 32, marginBottom: 12 }}>
                {file ? '✓' : '↑'}
              </div>
              {file ? (
                <>
                  <div style={{ fontSize: 14, color: '#00e054', fontWeight: 600 }}>{file.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--lb-text-muted)', marginTop: 4 }}>
                    {(file.size / 1024).toFixed(1)} KB — click to change
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 14, color: 'var(--lb-text-2)', fontWeight: 600 }}>
                    Drop CSV here or click to browse
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--lb-text-muted)', marginTop: 4 }}>
                    Max 10 MB
                  </div>
                </>
              )}
            </div>

            {error && (
              <div style={{ background: '#f8717118', border: '1px solid #f87171', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: '#f87171' }}>
                {error}
              </div>
            )}

            <button
              onClick={handleImport}
              disabled={!file || loading}
              style={{
                background: !file || loading ? 'var(--lb-bg-3)' : 'var(--lb-green)',
                color: !file || loading ? 'var(--lb-text-muted)' : 'var(--lb-bg)',
                border: 'none', borderRadius: 6, padding: '12px 0',
                fontWeight: 700, fontSize: 14, cursor: !file || loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s', width: '100%',
              }}
            >
              {loading
                ? phase === 'uploading' ? `Uploading… ${uploadPct}%`
                : phase === 'processing' ? 'Matching movies — this may take a minute…'
                : 'Importing…'
                : 'Import'}
            </button>

            {loading && (
              <div>
                {/* Progress bar */}
                <div style={{ height: 4, background: 'var(--lb-bg-3)', borderRadius: 2, overflow: 'hidden', marginBottom: 8 }}>
                  <div style={{
                    height: '100%', borderRadius: 2,
                    background: phase === 'processing' ? 'var(--lb-orange)' : 'var(--lb-green)',
                    width: phase === 'processing' ? '100%' : `${uploadPct}%`,
                    transition: 'width 0.3s ease',
                    animation: phase === 'processing' ? 'pulse 1.5s ease-in-out infinite' : 'none',
                  }} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--lb-text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
                  {phase === 'uploading'
                    ? 'Uploading file…'
                    : 'Matching against catalog — unmatched titles looked up via TMDB API.'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Results */}
        {result && (
          <div>
            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
              {[
                { label: 'Ratings imported', value: result.summary.ratings_imported, color: '#00e054' },
                { label: 'Already rated',    value: result.summary.ratings_skipped,  color: '#ef9f27' },
                { label: 'Watchlist added',  value: result.summary.watchlist_added,  color: '#60a5fa' },
                { label: 'Not in catalog',   value: result.summary.not_found,        color: '#f87171' },
              ].map(c => (
                <div key={c.label} style={{ background: 'var(--lb-bg-2)', borderRadius: 8, padding: '16px 20px', borderTop: `3px solid ${c.color}` }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: c.color }}>{c.value}</div>
                  <div style={{ fontSize: 12, color: 'var(--lb-text-muted)', marginTop: 4 }}>{c.label}</div>
                </div>
              ))}
            </div>

            {result.summary.not_found > 0 && (
              <div style={{ background: '#ef9f2710', border: '1px solid #ef9f2740', borderRadius: 6, padding: '10px 14px', fontSize: 13, marginBottom: 20 }}>
                {result.summary.not_found} titles weren't found in the catalog.
                {result.summary.tmdb_lookups >= 80 && ' TMDB lookup limit reached — re-import the file to continue resolving remaining titles.'}
              </div>
            )}

            {/* Filter tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {[
                { key: 'all',       label: `All (${result.results.length})` },
                { key: 'rated',     label: `Imported (${result.summary.ratings_imported})` },
                { key: 'watchlist', label: `Watchlist (${result.summary.watchlist_added})` },
                { key: 'not_found', label: `Not found (${result.summary.not_found})` },
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => setFilter(t.key)}
                  style={{
                    padding: '6px 14px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', border: '1px solid',
                    borderColor: filter === t.key ? 'var(--lb-green)' : 'var(--lb-bg-3)',
                    background: filter === t.key ? '#00e05418' : 'var(--lb-bg-2)',
                    color: filter === t.key ? 'var(--lb-green)' : 'var(--lb-text)',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Results table */}
            <div style={{ background: 'var(--lb-bg-2)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 60px 90px 80px',
                padding: '10px 16px', fontSize: 11, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.06em',
                color: 'var(--lb-text-muted)', borderBottom: '1px solid var(--lb-bg-3)',
              }}>
                <span>Title</span><span>Year</span><span>Status</span><span style={{ textAlign: 'right' }}>Score</span>
              </div>
              <div style={{ maxHeight: 480, overflowY: 'auto' }}>
                {filteredResults.length === 0 ? (
                  <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--lb-text-muted)', fontSize: 13 }}>
                    No results for this filter.
                  </div>
                ) : filteredResults.map((r, i) => {
                  const s = STATUS_STYLE[r.status] ?? STATUS_STYLE.not_found;
                  return (
                    <div key={i} style={{
                      display: 'grid', gridTemplateColumns: '1fr 60px 90px 80px',
                      padding: '9px 16px', alignItems: 'center', fontSize: 13,
                      borderBottom: i < filteredResults.length - 1 ? '1px solid var(--lb-bg-3)' : 'none',
                    }}>
                      <span style={{ color: 'var(--lb-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.title}
                      </span>
                      <span style={{ color: 'var(--lb-text-muted)' }}>{r.year}</span>
                      <span>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                          background: s.bg, color: s.color,
                        }}>
                          {s.label}
                        </span>
                      </span>
                      <span style={{ textAlign: 'right', color: r.score ? 'var(--lb-green)' : 'var(--lb-text-muted)', fontWeight: 700 }}>
                        {r.score ?? '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
