import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/ui/Navbar';
import MovieCard from '../components/ui/MovieCard';
import { useAuth } from '../hooks/useAuth';
import client from '../api/client';

const MOODS = [
  { id: 'atmospheric',       label: 'Atmospheric',       color: '#6366f1', bg: 'rgba(99,102,241,0.12)',  desc: 'Immersive worlds, stunning visuals' },
  { id: 'mind-bending',      label: 'Mind-bending',      color: '#a855f7', bg: 'rgba(168,85,247,0.12)',  desc: 'Twists, nonlinear, the unexpected' },
  { id: 'tense',             label: 'Tense',             color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   desc: 'Edge-of-your-seat suspense' },
  { id: 'dark',              label: 'Dark',              color: '#64748b', bg: 'rgba(100,116,139,0.12)', desc: 'Bleak, morally complex' },
  { id: 'feel-good',         label: 'Feel-good',         color: 'var(--lb-orange)', bg: 'rgba(196,162,110,0.12)',  desc: 'Heartwarming and uplifting' },
  { id: 'emotional',         label: 'Emotional',         color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  desc: 'Moving, deeply human' },
  { id: 'funny',             label: 'Funny',             color: '#10b981', bg: 'rgba(16,185,129,0.12)',  desc: 'Comedy, satire, laughs' },
  { id: 'epic',              label: 'Epic',              color: '#f97316', bg: 'rgba(249,115,22,0.12)',  desc: 'Grand scale, action, adventure' },
  { id: 'scary',             label: 'Scary',             color: '#dc2626', bg: 'rgba(220,38,38,0.12)',   desc: 'Horror, supernatural' },
  { id: 'romantic',          label: 'Romantic',          color: '#ec4899', bg: 'rgba(236,72,153,0.12)',  desc: 'Love stories and relationships' },
  { id: 'thought-provoking', label: 'Thought-provoking', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', desc: 'Philosophy, social commentary' },
  { id: 'cult-classic',      label: 'Cult classic',      color: 'var(--lb-green)', bg: 'rgba(132,136,113,0.12)', desc: 'Beloved, iconic, timeless' },
];

const DURATIONS = [
  { id: 'short',  label: 'Quick',    sub: '< 45 min',      icon: '⚡' },
  { id: 'medium', label: 'Standard', sub: '45 – 120 min',  icon: '🎬' },
  { id: 'long',   label: 'Epic',     sub: '> 120 min',     icon: '🌙' },
  { id: 'any',    label: 'Any',      sub: 'No limit',      icon: '∞'  },
];

const CONTEXTS = [
  { id: 'solo',    label: 'Solo',         icon: '🎧' },
  { id: 'friends', label: 'With friends', icon: '🎉' },
  { id: 'date',    label: 'Date night',   icon: '💕' },
  { id: 'family',  label: 'Family',       icon: '🏠' },
];

const EXCLUDES = [
  { id: 'dark',              label: 'Sad / depressing' },
  { id: 'scary',             label: 'Scary / horror'   },
  { id: 'tense',             label: 'Violent / gory'   },
  { id: 'emotional',         label: 'Emotionally heavy' },
  { id: 'mind-bending',      label: 'Confusing plots'  },
  { id: 'thought-provoking', label: 'Slow / arthouse'  },
];

const GENRES = [
  'Action','Adventure','Animation','Comedy','Crime','Documentary',
  'Drama','Fantasy','History','Horror','Mystery','Romance',
  'Science Fiction','Thriller','War','Western',
];

const LABEL = { fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--lb-text-muted)' };

function MoodCard({ mood, selected, onToggle }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={() => onToggle(mood.id)}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: selected || hov ? mood.bg : 'var(--lb-bg-2)',
        border: `1px solid ${selected ? mood.color : hov ? mood.color + '88' : 'var(--lb-border)'}`,
        borderRadius: 6, padding: '14px 16px', cursor: 'pointer',
        textAlign: 'left', transition: 'all 0.15s', position: 'relative', outline: 'none',
      }}>
      {selected && <span style={{ position: 'absolute', top: 8, right: 8, width: 16, height: 16, borderRadius: '50%', background: mood.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 900, color: '#fff' }}>✓</span>}
      <div style={{ fontSize: 14, fontWeight: 700, color: selected || hov ? mood.color : '#fff', marginBottom: 4, transition: 'color 0.15s' }}>{mood.label}</div>
      <div style={{ fontSize: 11, color: 'var(--lb-text)', lineHeight: 1.3 }}>{mood.desc}</div>
    </button>
  );
}

function Step({ n, label, active, done }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700,
        background: done ? 'var(--lb-green)' : active ? 'var(--lb-bg-3)' : 'var(--lb-bg-2)',
        border: `2px solid ${done || active ? 'var(--lb-green)' : 'var(--lb-border)'}`,
        color: done ? 'var(--lb-bg)' : active ? 'var(--lb-green)' : 'var(--lb-text-muted)',
      }}>{done ? '✓' : n}</div>
      <span style={{ fontSize: 12, fontWeight: 600, color: active ? '#fff' : 'var(--lb-text-muted)' }}>{label}</span>
    </div>
  );
}

const EXAMPLES = [
  'A short sci-fi film for a relaxing evening, nothing too intense',
  'Something like Interstellar but less dramatic',
  'A funny movie to watch with friends tonight',
  'Vreau un film horror scurt, potrivit pentru seară',
  'Un film emoționant despre relații, nu violent',
  'Recomandă-mi ceva asemănător cu Inception',
];

function AISearch({ user }) {
  const [query, setQuery]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState('');

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const { data } = await client.post('/recommendations/natural-search', { query });
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Search failed. Check your OpenAI API key.');
    } finally {
      setLoading(false);
    }
  };

  const parsed = result?.parsed;

  return (
    <div>
      {/* Input */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ position: 'relative' }}>
          <textarea
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); search(); } }}
            placeholder="Describe what you want to watch…"
            rows={3}
            style={{
              width: '100%', resize: 'vertical', fontSize: 15,
              padding: '14px 16px', borderRadius: 8,
              border: '1px solid var(--lb-border-2)',
              background: 'var(--lb-bg-2)', color: 'var(--lb-text-bright)',
              lineHeight: 1.5,
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--lb-text-muted)' }}>
            Enter · Search &nbsp;|&nbsp; Works in any language
          </div>
          <button onClick={search} disabled={!query.trim() || loading}
            style={{
              padding: '9px 22px', borderRadius: 6, border: 'none',
              background: 'var(--lb-green)', color: 'var(--lb-bg)',
              fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase', cursor: query.trim() ? 'pointer' : 'not-allowed',
              opacity: !query.trim() || loading ? 0.5 : 1,
            }}>
            {loading ? 'Thinking…' : '✦ Find films'}
          </button>
        </div>
      </div>

      {/* Example prompts */}
      {!result && !loading && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ ...LABEL, marginBottom: 12 }}>Try an example</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {EXAMPLES.map(ex => (
              <button key={ex} onClick={() => setQuery(ex)}
                style={{
                  textAlign: 'left', padding: '10px 14px', borderRadius: 6,
                  border: '1px solid var(--lb-border)', background: 'var(--lb-bg-2)',
                  color: 'var(--lb-text)', fontSize: 13, cursor: 'pointer',
                  transition: 'border-color 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--lb-green)'; e.currentTarget.style.color = 'var(--lb-text-bright)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--lb-border)'; e.currentTarget.style.color = 'var(--lb-text)'; }}
              >
                "{ex}"
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: '12px 16px', borderRadius: 6, background: 'rgba(196,112,112,0.1)', border: '1px solid var(--lb-danger)', color: 'var(--lb-danger)', fontSize: 13, marginBottom: 20 }}>
          ⚠ {error}
        </div>
      )}

      {/* What GPT understood */}
      {parsed && (
        <div style={{ marginBottom: 20, padding: '14px 18px', borderRadius: 6, background: 'var(--lb-bg-2)', border: '1px solid var(--lb-border)' }}>
          <div style={{ ...LABEL, marginBottom: 8 }}>AI understood</div>
          <div style={{ fontSize: 13, color: 'var(--lb-text-2)', marginBottom: 10, fontStyle: 'italic' }}>
            "{parsed.explanation}"
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {parsed.similar_to && (
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 2, background: 'rgba(99,102,241,0.15)', color: '#818cf8', fontWeight: 600 }}>
                Similar to: {parsed.similar_to}
              </span>
            )}
            {(parsed.moods || []).map(m => (
              <span key={m} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 2, background: 'var(--lb-green-dim)', color: 'var(--lb-green)', fontWeight: 600 }}>
                {m}
              </span>
            ))}
            {(parsed.genres || []).map(g => (
              <span key={g} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 2, background: 'rgba(59,130,246,0.15)', color: '#60a5fa', fontWeight: 600 }}>
                {g}
              </span>
            ))}
            {parsed.duration && parsed.duration !== 'any' && (
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 2, background: 'rgba(196,162,110,0.15)', color: 'var(--lb-orange)', fontWeight: 600 }}>
                {parsed.duration}
              </span>
            )}
            {(parsed.exclude_moods || []).map(m => (
              <span key={m} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 2, background: 'rgba(196,112,112,0.15)', color: 'var(--lb-danger)', fontWeight: 600 }}>
                ✕ {m}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="movie-grid">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ aspectRatio: '2/3' }} />
          ))}
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{result.movies.length} films found</span>
            <button onClick={search} style={{ fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 3, border: '1px solid var(--lb-border-2)', background: 'var(--lb-bg-2)', color: 'var(--lb-text)', cursor: 'pointer' }}>
              🔀 Try again
            </button>
          </div>
          {result.movies.length === 0
            ? <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--lb-text-muted)', fontSize: 14 }}>
                No films found. Try a different description.
              </div>
            : <div className="movie-grid">
                {result.movies.map(m => <MovieCard key={m.tmdb_id} movie={m} />)}
              </div>
          }
        </div>
      )}
    </div>
  );
}

export default function DiscoverPage() {
  const { user } = useAuth();
  const [mode, setMode]             = useState('wizard'); // 'wizard' | 'ai'
  const [step, setStep]             = useState(1);
  const [selectedMoods, setMoods]   = useState([]);
  const [duration, setDuration]     = useState('any');
  const [genres, setGenres]         = useState([]);
  const [context, setContext]       = useState('solo');
  const [excludeMoods, setExclude]  = useState([]);
  const [movies, setMovies]         = useState([]);
  const [loading, setLoading]       = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [savedList, setSavedList]   = useState(null);

  // Load saved preferences
  useEffect(() => {
    if (!user) return;
    client.get('/users/me/preferences').then(({ data }) => {
      if (data.preferences) {
        const p = data.preferences;
        if (p.moods?.length)       setMoods(p.moods);
        if (p.duration)            setDuration(p.duration);
        if (p.context)             setContext(p.context);
        if (p.exclude_moods?.length) setExclude(p.exclude_moods);
      }
    }).catch(() => {});
  }, [user]);

  const toggleMood   = (id) => setMoods(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
  const toggleExclude= (id) => setExclude(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);

  const luckyMoods = () => {
    const shuffled = [...MOODS].sort(() => Math.random() - 0.5);
    setMoods(shuffled.slice(0, 2).map(m => m.id));
  };

  const discover = useCallback(async () => {
    if (!selectedMoods.length) return;
    setLoading(true);
    setShowResults(true);
    try {
      const params = new URLSearchParams({
        moods:         selectedMoods.join(','),
        duration,
        context,
        exclude_moods: excludeMoods.join(','),
        limit:         18,
      });
      if (user)          params.set('user_id', user.id);
      if (genres.length) params.set('genre', genres.join(','));

      const { data } = await client.get(`/recommendations/mood-context?${params}`);
      setMovies(data.movies || []);

      // Save preferences
      if (user) {
        client.put('/users/me/preferences', {
          moods: selectedMoods, duration, context, exclude_moods: excludeMoods,
        }).catch(() => {});
      }
    } finally {
      setLoading(false);
    }
  }, [selectedMoods, duration, context, excludeMoods, user]);

  const saveAsPlaylist = async () => {
    const title = `${CONTEXTS.find(c => c.id === context)?.label || ''} picks · ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
    const { data } = await client.post('/lists', { title, description: `Mood: ${selectedMoods.join(', ')}. Context: ${context}. Duration: ${duration}.`, is_public: false });
    const listId = data.list?.id;
    if (listId) {
      await Promise.all(movies.slice(0, 12).map(m => client.post(`/lists/${listId}/movies`, { tmdbId: m.tmdb_id }).catch(() => {})));
      setSavedList(listId);
    }
  };

  const moodLabels = selectedMoods.map(id => MOODS.find(m => m.id === id)?.label).filter(Boolean);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--lb-bg)' }}>
      <Navbar />

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '36px var(--page-px) 80px' }}>

        {/* Header + mode toggle */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ ...LABEL, color: 'var(--lb-green)', marginBottom: 6 }}>Discover</div>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ margin: '0 0 6px', fontSize: 'clamp(20px,4vw,28px)', fontWeight: 700 }}>
                {mode === 'ai' ? 'Ask AI for a recommendation' : 'What are you in the mood for?'}
              </h1>
              <p style={{ fontSize: 14, color: 'var(--lb-text)', margin: 0 }}>
                {mode === 'ai'
                  ? 'Describe what you want in plain language — any language works.'
                  : 'Answer 3 quick questions and we\'ll find your perfect film.'}
              </p>
            </div>
            <div style={{ display: 'flex', background: 'var(--lb-bg-2)', border: '1px solid var(--lb-border)', borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
              {[['wizard','🎛 Wizard'], ['ai','✦ Ask AI']].map(([id, label]) => (
                <button key={id} onClick={() => setMode(id)}
                  style={{
                    padding: '8px 16px', fontSize: 11, fontWeight: 700,
                    letterSpacing: '0.05em', textTransform: 'uppercase',
                    background: mode === id ? 'var(--lb-green)' : 'none',
                    color: mode === id ? 'var(--lb-bg)' : 'var(--lb-text-muted)',
                    border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                  }}>{label}</button>
              ))}
            </div>
          </div>
        </div>

        {/* AI search mode */}
        {mode === 'ai' && <AISearch user={user} />}

        {mode === 'wizard' && (<>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 28, flexWrap: 'wrap' }}>
          <Step n={1} label="Mood"    active={step === 1} done={step > 1} />
          <div style={{ flex: 1, height: 1, background: 'var(--lb-border)', minWidth: 20 }} />
          <Step n={2} label="Time"    active={step === 2} done={step > 2} />
          <div style={{ flex: 1, height: 1, background: 'var(--lb-border)', minWidth: 20 }} />
          <Step n={3} label="Context" active={step === 3} done={showResults} />
        </div>

        {/* Step 1 — Mood */}
        {step === 1 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={LABEL}>Choose your vibe (pick any)</div>
              <button onClick={luckyMoods} style={{ fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 3, border: '1px solid var(--lb-border-2)', background: 'var(--lb-bg-2)', color: 'var(--lb-text)', cursor: 'pointer' }}>
                🎲 I'm feeling lucky
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10, marginBottom: 24 }}>
              {MOODS.map(m => (
                <MoodCard key={m.id} mood={m} selected={selectedMoods.includes(m.id)} onToggle={toggleMood} />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setStep(2)} disabled={!selectedMoods.length}
                style={{ padding: '10px 24px', borderRadius: 4, border: 'none', background: 'var(--lb-green)', color: 'var(--lb-bg)', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: selectedMoods.length ? 'pointer' : 'not-allowed', opacity: selectedMoods.length ? 1 : 0.5 }}>
                Next →
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Duration + Genre */}
        {step === 2 && (
          <div>
            <div style={{ ...LABEL, marginBottom: 12 }}>How much time do you have?</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 28 }}>
              {DURATIONS.map(d => (
                <button key={d.id} onClick={() => setDuration(d.id)}
                  style={{
                    padding: '16px 10px', borderRadius: 6, cursor: 'pointer', textAlign: 'center',
                    background: duration === d.id ? 'var(--lb-green-dim)' : 'var(--lb-bg-2)',
                    border: `2px solid ${duration === d.id ? 'var(--lb-green)' : 'var(--lb-border)'}`,
                    transition: 'all 0.15s',
                  }}>
                  <div style={{ fontSize: 18, marginBottom: 6 }}>{d.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: duration === d.id ? 'var(--lb-green)' : '#fff', marginBottom: 3 }}>{d.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--lb-text-muted)' }}>{d.sub}</div>
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={LABEL}>Genre (pick any — optional)</div>
              {genres.length > 0 && (
                <button onClick={() => setGenres([])} style={{ fontSize: 10, color: 'var(--lb-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  Clear all
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
              {GENRES.map(g => {
                const active = genres.includes(g);
                return (
                  <button key={g}
                    onClick={() => setGenres(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])}
                    style={{ padding: '5px 14px', borderRadius: 3, fontSize: 11, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase', border: `1px solid ${active ? 'var(--lb-green)' : 'var(--lb-border-2)'}`, background: active ? 'var(--lb-green-dim)' : 'var(--lb-bg-2)', color: active ? 'var(--lb-green)' : 'var(--lb-text)', transition: 'all 0.12s' }}>
                    {active ? '✓ ' : ''}{g}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={() => setStep(1)} style={{ padding: '10px 20px', borderRadius: 4, border: '1px solid var(--lb-border-2)', background: 'var(--lb-bg-2)', color: 'var(--lb-text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>← Back</button>
              <button onClick={() => setStep(3)} style={{ padding: '10px 24px', borderRadius: 4, border: 'none', background: 'var(--lb-green)', color: 'var(--lb-bg)', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}>Next →</button>
            </div>
          </div>
        )}

        {/* Step 3 — Context */}
        {step === 3 && (
          <div>
            <div style={{ ...LABEL, marginBottom: 16 }}>Who are you watching with?</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
              {CONTEXTS.map(c => (
                <button key={c.id} onClick={() => setContext(c.id)}
                  style={{
                    padding: '18px 10px', borderRadius: 6, cursor: 'pointer', textAlign: 'center',
                    background: context === c.id ? 'var(--lb-green-dim)' : 'var(--lb-bg-2)',
                    border: `2px solid ${context === c.id ? 'var(--lb-green)' : 'var(--lb-border)'}`,
                  }}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>{c.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: context === c.id ? 'var(--lb-green)' : '#fff' }}>{c.label}</div>
                </button>
              ))}
            </div>

            <div style={{ marginBottom: 24 }}>
              <div style={{ ...LABEL, marginBottom: 10 }}>Exclude (optional)</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {EXCLUDES.map(e => (
                  <button key={e.id} onClick={() => toggleExclude(e.id)}
                    style={{
                      padding: '5px 14px', borderRadius: 3, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      border: `1px solid ${excludeMoods.includes(e.id) ? 'var(--lb-danger)' : 'var(--lb-border-2)'}`,
                      background: excludeMoods.includes(e.id) ? 'rgba(196,112,112,0.12)' : 'var(--lb-bg-2)',
                      color: excludeMoods.includes(e.id) ? 'var(--lb-danger)' : 'var(--lb-text)',
                    }}>
                    {excludeMoods.includes(e.id) ? '✕ ' : ''}{e.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={() => setStep(2)} style={{ padding: '10px 20px', borderRadius: 4, border: '1px solid var(--lb-border-2)', background: 'var(--lb-bg-2)', color: 'var(--lb-text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>← Back</button>
              <button onClick={discover} style={{ padding: '12px 28px', borderRadius: 4, border: 'none', background: 'var(--lb-green)', color: 'var(--lb-bg)', fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}>
                Find films ✦
              </button>
            </div>
          </div>
        )}

        {/* Results */}
        {showResults && (
          <div style={{ marginTop: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>
                  {loading ? 'Finding films…' : `${movies.length} films`}
                </span>
                {moodLabels.map(l => (
                  <span key={l} style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 2, background: 'var(--lb-green-dim)', color: 'var(--lb-green)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{l}</span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={discover} style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 3, border: '1px solid var(--lb-border-2)', background: 'var(--lb-bg-2)', color: 'var(--lb-text)', cursor: 'pointer' }}>
                  🔀 Shuffle
                </button>
                {user && movies.length > 0 && !savedList && (
                  <button onClick={saveAsPlaylist} style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 3, border: '1px solid var(--lb-border-2)', background: 'var(--lb-bg-2)', color: 'var(--lb-text)', cursor: 'pointer' }}>
                    💾 Save as list
                  </button>
                )}
                {savedList && (
                  <Link to={`/lists/${savedList}`} style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 3, border: '1px solid var(--lb-green)', background: 'var(--lb-green-dim)', color: 'var(--lb-green)', textDecoration: 'none' }}>
                    ✓ Saved — view list
                  </Link>
                )}
                <button onClick={() => { setStep(1); setShowResults(false); setMovies([]); setSavedList(null); }}
                  style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 3, border: '1px solid var(--lb-border-2)', background: 'var(--lb-bg-2)', color: 'var(--lb-text)', cursor: 'pointer' }}>
                  ← New search
                </button>
              </div>
            </div>

            {loading ? (
              <div className="movie-grid">
                {Array.from({ length: 12 }).map((_, i) => <div key={i} className="skeleton" style={{ aspectRatio: '2/3' }} />)}
              </div>
            ) : movies.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--lb-text-muted)', fontSize: 14 }}>
                No films found for this combination. Try different filters.
              </div>
            ) : (
              <div className="movie-grid">
                {movies.map(m => <MovieCard key={m.tmdb_id} movie={m} />)}
              </div>
            )}
          </div>
        )}

        </>)}  {/* end mode === 'wizard' */}

      </div>
    </div>
  );
}
