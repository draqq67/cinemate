import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/ui/Navbar';
import MovieCard from '../components/ui/MovieCard';
import client from '../api/client';

// ── Mood definitions (mirror MOOD_PROFILES in ml/main.py) ─────────────────────
const MOODS = [
  { id: 'atmospheric',       label: 'Atmospheric',       color: '#6366f1', bg: 'rgba(99,102,241,0.12)',  desc: 'Immersive worlds, stunning visuals' },
  { id: 'mind-bending',      label: 'Mind-bending',      color: '#a855f7', bg: 'rgba(168,85,247,0.12)',  desc: 'Twists, nonlinear stories, the unexpected' },
  { id: 'tense',             label: 'Tense',             color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   desc: 'Edge-of-your-seat suspense' },
  { id: 'dark',              label: 'Dark',              color: '#64748b', bg: 'rgba(100,116,139,0.12)', desc: 'Bleak, morally complex, disturbing' },
  { id: 'feel-good',         label: 'Feel-good',         color: 'var(--lb-admin)', bg: 'rgba(245,158,11,0.12)',  desc: 'Heartwarming and uplifting' },
  { id: 'emotional',         label: 'Emotional',         color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  desc: 'Moving, dramatic, deeply human' },
  { id: 'funny',             label: 'Funny',             color: '#10b981', bg: 'rgba(16,185,129,0.12)',  desc: 'Comedy, satire, laugh-out-loud' },
  { id: 'epic',              label: 'Epic',              color: '#f97316', bg: 'rgba(249,115,22,0.12)',  desc: 'Grand scale, action, adventure' },
  { id: 'scary',             label: 'Scary',             color: '#dc2626', bg: 'rgba(220,38,38,0.12)',   desc: 'Horror, supernatural, nightmare fuel' },
  { id: 'romantic',          label: 'Romantic',          color: '#ec4899', bg: 'rgba(236,72,153,0.12)',  desc: 'Love stories and relationships' },
  { id: 'thought-provoking', label: 'Thought-provoking', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', desc: 'Philosophy, social commentary, ideas' },
  { id: 'cult-classic',      label: 'Cult classic',      color: '#00e054', bg: 'rgba(0,224,84,0.12)',   desc: 'Beloved, iconic, timeless' },
];

const GENRES = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary',
  'Drama', 'Fantasy', 'Horror', 'Mystery', 'Romance', 'Science Fiction',
  'Thriller', 'War', 'Western',
];

const LABEL = {
  fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'var(--lb-text-muted)',
};

// ── Mood card ──────────────────────────────────────────────────────────────────
function MoodCard({ mood, selected, onToggle }) {
  const [hovered, setHovered] = useState(false);
  const active = selected || hovered;

  return (
    <button
      onClick={() => onToggle(mood.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background:  selected ? mood.bg : hovered ? mood.bg : 'var(--lb-bg-2)',
        border:      `1px solid ${selected ? mood.color : hovered ? mood.color + '88' : 'var(--lb-border)'}`,
        borderRadius: '6px',
        padding: '16px 18px',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.15s',
        position: 'relative',
        outline: 'none',
      }}
    >
      {selected && (
        <span style={{
          position: 'absolute', top: 10, right: 10,
          width: 18, height: 18, borderRadius: '50%',
          background: mood.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '10px', fontWeight: 900, color: '#fff',
        }}>✓</span>
      )}
      <div style={{
        fontSize: '15px', fontWeight: 700,
        color: active ? mood.color : '#fff',
        marginBottom: '5px', transition: 'color 0.15s',
      }}>
        {mood.label}
      </div>
      <div style={{ fontSize: '11px', color: 'var(--lb-text)', lineHeight: 1.4 }}>
        {mood.desc}
      </div>
    </button>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function DiscoverPage() {
  const [selectedMoods, setSelectedMoods] = useState([]);
  const [selectedGenre, setSelectedGenre] = useState('');
  const [movies, setMovies]               = useState([]);
  const [loading, setLoading]             = useState(false);
  const [searched, setSearched]           = useState(false);

  const toggle = (id) =>
    setSelectedMoods(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );

  const search = async () => {
    if (!selectedMoods.length) return;
    setLoading(true);
    setSearched(true);
    try {
      const params = new URLSearchParams({ moods: selectedMoods.join(','), limit: 24 });
      if (selectedGenre) params.set('genre', selectedGenre);
      const { data } = await client.get(`/recommendations/mood?${params}`);
      setMovies(data.movies || []);
    } catch {
      setMovies([]);
    }
    setLoading(false);
  };

  // Auto-search when moods or genre change (with debounce)
  useEffect(() => {
    if (!selectedMoods.length) { setMovies([]); setSearched(false); return; }
    const t = setTimeout(search, 400);
    return () => clearTimeout(t);
  }, [selectedMoods, selectedGenre]);

  const moodLabels = selectedMoods.map(id => MOODS.find(m => m.id === id)?.label).filter(Boolean);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--lb-bg)' }}>
      <Navbar />

      {/* Header */}
      <div style={{
        background: 'linear-gradient(180deg, var(--lb-nav-bg) 0%, var(--lb-bg) 100%)',
        borderBottom: '1px solid var(--lb-border)',
        padding: '40px 32px 36px',
      }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ ...LABEL, color: 'var(--lb-green)', marginBottom: '10px' }}>
            Discover
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
            What are you in the mood for?
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--lb-text)', margin: 0 }}>
            Pick one or more vibes — powered by ML-25M genome tags.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '36px 32px 80px' }}>

        {/* Mood grid */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ ...LABEL, marginBottom: '14px' }}>Vibe</div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '10px',
          }}>
            {MOODS.map(m => (
              <MoodCard
                key={m.id}
                mood={m}
                selected={selectedMoods.includes(m.id)}
                onToggle={toggle}
              />
            ))}
          </div>
        </div>

        {/* Genre filter */}
        <div style={{ marginBottom: '36px' }}>
          <div style={{ ...LABEL, marginBottom: '12px' }}>Genre (optional)</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setSelectedGenre('')}
              style={{
                fontSize: '11px', fontWeight: 600, padding: '5px 14px', borderRadius: '2px',
                border: `1px solid ${!selectedGenre ? 'var(--lb-green)' : 'var(--lb-border-2)'}`,
                color: !selectedGenre ? 'var(--lb-green)' : 'var(--lb-text)',
                background: !selectedGenre ? 'rgba(0,224,84,0.08)' : 'var(--lb-bg-2)',
                cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase',
                transition: 'all 0.15s',
              }}
            >
              Any
            </button>
            {GENRES.map(g => (
              <button
                key={g}
                onClick={() => setSelectedGenre(g === selectedGenre ? '' : g)}
                style={{
                  fontSize: '11px', fontWeight: 600, padding: '5px 14px', borderRadius: '2px',
                  border: `1px solid ${selectedGenre === g ? 'var(--lb-green)' : 'var(--lb-border-2)'}`,
                  color: selectedGenre === g ? 'var(--lb-green)' : 'var(--lb-text)',
                  background: selectedGenre === g ? 'rgba(0,224,84,0.08)' : 'var(--lb-bg-2)',
                  cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase',
                  transition: 'all 0.15s',
                }}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        {selectedMoods.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '60px 0',
            color: 'var(--lb-text-muted)', fontSize: '14px',
          }}>
            Select at least one vibe to discover films.
          </div>
        )}

        {loading && (
          <div>
            <div style={{ ...LABEL, marginBottom: '16px' }}>Finding films…</div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '14px',
            }}>
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} style={{
                  aspectRatio: '2/3', background: 'var(--lb-bg-2)', borderRadius: '4px',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }} />
              ))}
            </div>
          </div>
        )}

        {!loading && searched && movies.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '60px 0',
            color: 'var(--lb-text-muted)', fontSize: '14px',
          }}>
            No films found for this combination. Try fewer filters.
          </div>
        )}

        {!loading && movies.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <span style={{ ...LABEL, color: '#fff', fontSize: '11px' }}>
                {movies.length} films
              </span>
              {moodLabels.map(l => (
                <span key={l} style={{
                  fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '2px',
                  background: 'rgba(0,224,84,0.12)', color: 'var(--lb-green)',
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                }}>
                  {l}
                </span>
              ))}
              {selectedGenre && (
                <span style={{
                  fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '2px',
                  background: 'rgba(99,102,241,0.12)', color: '#818cf8',
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                }}>
                  {selectedGenre}
                </span>
              )}
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '14px',
            }}>
              {movies.map(m => <MovieCard key={m.tmdb_id} movie={m} />)}
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  );
}
