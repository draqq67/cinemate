import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/ui/Navbar';
import ErrorState from '../components/ui/ErrorState';
import client from '../api/client';

const STATS_CACHE_KEY   = 'analytics_stats_v2';
const CHARTS_CACHE_KEY  = 'analytics_charts_v2';
const CACHE_TTL         = 5 * 60 * 1000; // 5 minutes

function readCache(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { sessionStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
}

function writeCache(key, data) {
  try { sessionStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch {}
}

const POSTER = 'https://image.tmdb.org/t/p/w185';
const LABEL  = { fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--lb-text-muted)' };
const CARD   = { background: 'var(--lb-bg-2)', border: '1px solid var(--lb-border)', borderRadius: '6px', padding: '20px 24px' };

// ── Stat card ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent = 'var(--lb-green)' }) {
  return (
    <div style={{ ...CARD, textAlign: 'center' }}>
      <div style={{ fontSize: '30px', fontWeight: 700, color: accent, lineHeight: 1 }}>{value}</div>
      <div style={{ ...LABEL, marginTop: '6px' }}>{label}</div>
      {sub && <div style={{ fontSize: '11px', color: 'var(--lb-text-muted)', marginTop: '3px' }}>{sub}</div>}
    </div>
  );
}

// ── Activity heatmap (GitHub-style — last 52 weeks) ───────────────────────────
function Heatmap({ byDate }) {
  const dateMap = {};
  (byDate || []).forEach(({ day, count }) => { dateMap[day] = count; });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDay = new Date(today);
  startDay.setDate(startDay.getDate() - 364);
  // Align to Sunday
  startDay.setDate(startDay.getDate() - startDay.getDay());

  const weeks = [];
  const cur = new Date(startDay);
  while (cur <= today) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const iso = cur.toISOString().slice(0, 10);
      const count = dateMap[iso] || 0;
      const isFuture = cur > today;
      week.push({ iso, count, isFuture });
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }

  const maxCount = Math.max(...(byDate || []).map(d => d.count), 1);

  const cellColor = (count, isFuture) => {
    if (isFuture) return 'transparent';
    if (count === 0) return 'var(--lb-bg-3)';
    const intensity = Math.min(count / maxCount, 1);
    if (intensity < 0.25) return 'rgba(0,224,84,0.20)';
    if (intensity < 0.50) return 'rgba(0,224,84,0.40)';
    if (intensity < 0.75) return 'rgba(0,224,84,0.65)';
    return 'rgba(0,224,84,0.90)';
  };

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthLabels = [];
  weeks.forEach((week, wi) => {
    const d = new Date(week[0].iso);
    if (d.getDate() <= 7) monthLabels.push({ wi, label: months[d.getMonth()] });
  });

  return (
    <div>
      <div style={{ position: 'relative', height: 12, marginBottom: 4 }}>
        {monthLabels.map(({ wi, label }) => (
          <span key={wi} style={{
            position: 'absolute', left: wi * 13, fontSize: 9,
            color: 'var(--lb-text-muted)', letterSpacing: '0.05em',
          }}>{label}</span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '2px' }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {week.map(({ iso, count, isFuture }) => (
              <div
                key={iso}
                title={count > 0 ? `${iso}: ${count} film${count > 1 ? 's' : ''}` : iso}
                style={{
                  width: 11, height: 11, borderRadius: 2,
                  background: cellColor(count, isFuture),
                  cursor: count > 0 ? 'default' : 'default',
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Rating distribution histogram ─────────────────────────────────────────────
function RatingHistogram({ dist }) {
  const max = Math.max(...dist.map(d => d.count), 1);
  const total = dist.reduce((s, d) => s + d.count, 0);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '90px' }}>
      {dist.map(({ score, count }) => (
        <div key={score} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
          {count > 0 && (
            <div style={{ fontSize: '9px', color: 'var(--lb-text-muted)' }}>
              {Math.round((count / total) * 100)}%
            </div>
          )}
          <div style={{
            width: '100%', background: score >= 8 ? 'var(--lb-green)' : score >= 5 ? 'var(--lb-orange)' : '#f87171',
            borderRadius: '2px 2px 0 0', opacity: count === 0 ? 0.1 : 0.85,
            height: `${Math.max(2, Math.round((count / max) * 65))}px`,
            transition: 'height 0.4s',
          }} />
          <div style={{ fontSize: '9px', color: 'var(--lb-text-muted)' }}>{score}</div>
        </div>
      ))}
    </div>
  );
}

// ── Decade bar chart ───────────────────────────────────────────────────────────
function DecadeChart({ data }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {data.map(({ decade, count }) => (
        <div key={decade} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: 38, fontSize: '11px', color: 'var(--lb-text-2)', fontWeight: 600, flexShrink: 0 }}>
            {decade}s
          </div>
          <div style={{ flex: 1, background: 'var(--lb-bg-3)', borderRadius: '2px', height: '6px', overflow: 'hidden' }}>
            <div style={{
              height: '100%', background: 'var(--lb-green)', borderRadius: '2px',
              width: `${Math.round((count / max) * 100)}%`,
              transition: 'width 0.5s ease',
            }} />
          </div>
          <div style={{ fontSize: '11px', color: 'var(--lb-text-muted)', width: 28, textAlign: 'right' }}>{count}</div>
        </div>
      ))}
    </div>
  );
}

// ── Monthly sparkline ─────────────────────────────────────────────────────────
function MonthChart({ data }) {
  if (!data.length) return <div style={{ color: 'var(--lb-text-muted)', fontSize: '12px' }}>No data yet</div>;
  // Use 90th-percentile as visual ceiling so a single import spike doesn't flatten everything else
  const sorted  = [...data].map(d => d.count).sort((a, b) => a - b);
  const p90     = sorted[Math.floor(sorted.length * 0.9)] || 1;
  const visMax  = Math.max(p90, 1);
  const absMax  = Math.max(...data.map(d => d.count), 1);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '80px' }}>
        {data.map(({ month, count }) => {
          const clipped = Math.min(count, visMax);
          const isSpike = count > visMax;
          return (
          <div key={month} title={`${month}: ${count} films`}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
            <div style={{
              width: '100%', background: isSpike ? 'var(--lb-admin)' : 'var(--lb-orange)',
              borderRadius: '2px 2px 0 0',
              height: `${Math.max(2, Math.round((clipped / visMax) * 65))}px`,
              opacity: 0.85,
              borderTop: isSpike ? '2px dashed rgba(255,255,255,0.4)' : 'none',
            }} />
            <div style={{ fontSize: '8px', color: 'var(--lb-text-muted)', textAlign: 'center', lineHeight: 1 }}>
              {month.slice(5)}
            </div>
          </div>
          );
        })}
      </div>
      {absMax > visMax && (
        <div style={{ fontSize: '10px', color: 'var(--lb-text-muted)', marginTop: '6px' }}>
          ◆ Capped at {visMax} — peak month: {absMax} films (bulk import). Hover bars for exact count.
        </div>
      )}
    </div>
  );
}

// ── Genre rating table ────────────────────────────────────────────────────────
function GenreRatings({ data }) {
  const maxCount = Math.max(...data.map(d => d.count), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
      {data.map(g => (
        <div key={g.name} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: 96, fontSize: '11px', color: 'var(--lb-text-2)', fontWeight: 600, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {g.name}
          </div>
          <div style={{ flex: 1, background: 'var(--lb-bg-3)', borderRadius: '2px', height: '5px', overflow: 'hidden' }}>
            <div style={{
              height: '100%', background: 'var(--lb-green)', borderRadius: '2px',
              width: `${Math.round((g.count / maxCount) * 100)}%`,
            }} />
          </div>
          <div style={{ fontSize: '11px', color: 'var(--lb-text-muted)', width: 22, textAlign: 'right', flexShrink: 0 }}>{g.count}</div>
          <div style={{
            fontSize: '11px', fontWeight: 700, width: 32, textAlign: 'right', flexShrink: 0,
            color: g.avg_score >= 7 ? 'var(--lb-green)' : g.avg_score >= 5 ? 'var(--lb-orange)' : 'var(--lb-danger)',
          }}>
            ★{g.avg_score}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Bar chart (generic) ───────────────────────────────────────────────────────
function BarChart({ data, color = 'var(--lb-green)', labelKey, valueKey }) {
  const max = Math.max(...data.map(d => d[valueKey]), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '80px' }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
          {d[valueKey] > 0 && <div style={{ fontSize: '9px', color: 'var(--lb-text-muted)' }}>{d[valueKey]}</div>}
          <div style={{
            width: '100%', background: color, borderRadius: '2px 2px 0 0',
            height: `${Math.max(2, Math.round((d[valueKey] / max) * 60))}px`,
            opacity: 0.85,
          }} />
          <div style={{ fontSize: '9px', color: 'var(--lb-text-muted)', textAlign: 'center' }}>{d[labelKey]}</div>
        </div>
      ))}
    </div>
  );
}

// ── Chart skeleton ────────────────────────────────────────────────────────────
function ChartSkeleton({ height = 120 }) {
  return (
    <div style={{
      height, background: 'var(--lb-bg-3)', borderRadius: '4px',
      animation: 'pulse 1.5s ease-in-out infinite',
    }} />
  );
}

// ── Behaviour tab ─────────────────────────────────────────────────────────────
// ── Deep Stats Tab ────────────────────────────────────────────────────────────
function DeepStatsTab() {
  const [taste, setTaste]       = useState(null);
  const [dirs, setDirs]         = useState(null);
  const [actors, setActors]     = useState(null);
  const [social, setSocial]     = useState(null);
  const [miles, setMiles]       = useState(null);
  const [regret, setRegret]     = useState(null);
  const [dirsLoading, setDirsLoading] = useState(true);
  const POSTER = 'https://image.tmdb.org/t/p/w92';
  const PROFILE = 'https://image.tmdb.org/t/p/w92';

  useEffect(() => {
    client.get('/activity/analytics/taste-profile').then(r => setTaste(r.data)).catch(() => setTaste({}));
    // Directors triggers TMDB population — may be slow on first load
    client.get('/activity/analytics/directors')
      .then(r => { setDirs(r.data); setDirsLoading(false); })
      .catch(() => { setDirs({}); setDirsLoading(false); });
    // Actors uses same cache populated by directors endpoint
    setTimeout(() => {
      client.get('/activity/analytics/actors').then(r => setActors(r.data)).catch(() => setActors({}));
    }, 500); // slight delay so directors runs first
    client.get('/activity/analytics/social-stats').then(r => setSocial(r.data)).catch(() => setSocial({}));
    client.get('/activity/analytics/milestones').then(r => setMiles(r.data)).catch(() => setMiles({}));
    client.get('/activity/analytics/regret').then(r => setRegret(r.data)).catch(() => setRegret({}));
  }, []);

  const rb = taste?.rating_behaviour;
  const con = taste?.contrarian;
  const rec = taste?.recency_bias;
  const auteur = dirs?.auteur_score;

  const sectionTitle = (t, sub) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--lb-text-bright)' }}>{t}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--lb-text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );

  const statRow = (label, value, note, color = 'var(--lb-green)') => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--lb-border)' }}>
      <div>
        <span style={{ fontSize: 13, color: 'var(--lb-text-2)' }}>{label}</span>
        {note && <div style={{ fontSize: 11, color: 'var(--lb-text-muted)', marginTop: 2 }}>{note}</div>}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── TASTE PROFILE ─────────────────────────────────────────────── */}
      {taste && (
        <div style={CARD}>
          {sectionTitle('🎭 Taste profile', 'How you watch and rate')}
          {rb && (<>
            {statRow('Rating generosity',
              `${rb.your_avg > 0 ? rb.your_avg.toFixed(1) : '—'} / 10`,
              `Platform avg: ${rb.platform_avg?.toFixed(1)} — you rate ${rb.generosity_delta > 0 ? '+' : ''}${rb.generosity_delta?.toFixed(1)} vs average`,
              rb.generosity_delta > 0.5 ? '#10b981' : rb.generosity_delta < -0.5 ? 'var(--lb-danger)' : 'var(--lb-text-2)'
            )}
            {statRow('Rating consistency',
              `${rb.consistency_pct}%`,
              `${rb.total_rated} rated out of ${rb.total_watched} watched`,
              rb.consistency_pct >= 70 ? 'var(--lb-green)' : 'var(--lb-orange)'
            )}
          </>)}
          {con && con.total > 0 && (<>
            {statRow('Contrarian score',
              `${con.contrarian_pct}%`,
              `${con.contrarian_count}/${con.total} ratings diverge ≥3 pts from platform · ${con.harsher_count} harsher, ${con.kinder_count} kinder`,
              con.contrarian_pct > 30 ? 'var(--lb-orange)' : 'var(--lb-text-2)'
            )}
          </>)}
          {rec && rec.delta !== null && (<>
            {statRow('Recency bias',
              rec.delta > 0 ? `+${rec.delta} pts` : `${rec.delta} pts`,
              `Recent 30d avg: ${rec.recent_avg} · Older avg: ${rec.older_avg}`,
              Math.abs(rec.delta) > 0.5 ? 'var(--lb-orange)' : 'var(--lb-text-2)'
            )}
          </>)}
        </div>
      )}

      {/* ── DECADE AFFINITY ───────────────────────────────────────────── */}
      {taste?.decade_affinity?.length > 0 && (
        <div style={CARD}>
          {sectionTitle('📅 Decade affinity')}
          {(() => {
            const max = Math.max(...taste.decade_affinity.map(d => d.watches), 1);
            return taste.decade_affinity.map(d => (
              <div key={d.decade} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ width: 42, fontSize: 11, fontWeight: 600, color: 'var(--lb-text-2)', flexShrink: 0 }}>{d.decade}s</div>
                <div style={{ flex: 1, background: 'var(--lb-bg-3)', borderRadius: 2, height: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: 'var(--lb-green)', width: `${Math.round(d.watches / max * 100)}%` }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--lb-text-muted)', width: 26, textAlign: 'right' }}>{d.watches}</div>
                {d.avg_score > 0 && <div style={{ fontSize: 10, color: 'var(--lb-orange)', width: 28, textAlign: 'right' }}>★{d.avg_score}</div>}
              </div>
            ));
          })()}
        </div>
      )}

      {/* ── RUNTIME PREFERENCE ────────────────────────────────────────── */}
      {taste?.runtime_buckets?.length > 0 && (
        <div style={CARD}>
          {sectionTitle('⏱ Runtime preference')}
          {(() => {
            const max = Math.max(...taste.runtime_buckets.map(b => b.watches), 1);
            return taste.runtime_buckets.map(b => (
              <div key={b.bucket} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ width: 110, fontSize: 11, color: 'var(--lb-text-2)', flexShrink: 0 }}>{b.bucket}</div>
                <div style={{ flex: 1, background: 'var(--lb-bg-3)', borderRadius: 2, height: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: 'var(--lb-orange)', width: `${Math.round(b.watches / max * 100)}%` }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--lb-text-muted)', width: 26, textAlign: 'right' }}>{b.watches}</div>
                {b.avg_score > 0 && <div style={{ fontSize: 10, color: 'var(--lb-orange)', width: 28, textAlign: 'right' }}>★{b.avg_score}</div>}
              </div>
            ));
          })()}
        </div>
      )}

      {/* ── DIRECTOR STATS ────────────────────────────────────────────── */}
      <div style={CARD}>
        {sectionTitle('🎬 Director profile', dirsLoading ? 'Loading from TMDB — may take a moment on first visit…' : undefined)}
        {dirsLoading && <ChartSkeleton height={120} />}
        {!dirsLoading && dirs && (<>
          {auteur && auteur.total_watches > 0 && (
            <div style={{ marginBottom: 16, padding: '12px 14px', background: 'var(--lb-bg-3)', borderRadius: 4 }}>
              <div style={{ fontSize: 11, color: 'var(--lb-text-muted)', marginBottom: 4 }}>Auteur score</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--lb-green)' }}>{auteur.pct}%</div>
              <div style={{ fontSize: 11, color: 'var(--lb-text-muted)' }}>of your watches are from directors you've seen 3+ films from</div>
            </div>
          )}
          {dirs.top_by_count?.length > 0 && (
            <>
              <div style={{ ...LABEL, marginBottom: 10 }}>Most watched directors</div>
              {dirs.top_by_count.slice(0, 7).map(d => (
                <div key={d.director_name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--lb-border)' }}>
                  <span style={{ fontSize: 13, color: 'var(--lb-text-2)' }}>{d.director_name}</span>
                  <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--lb-text-muted)' }}>
                    <span>{d.watches} films</span>
                    {d.avg_score > 0 && <span style={{ color: 'var(--lb-orange)' }}>★ {d.avg_score}</span>}
                  </div>
                </div>
              ))}
            </>
          )}
          {dirs.explore_more?.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ ...LABEL, marginBottom: 10 }}>Directors to explore (you rated high, seen only 1 film)</div>
              {dirs.explore_more.map(d => (
                <div key={d.director_name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--lb-border)' }}>
                  <span style={{ fontSize: 13, color: 'var(--lb-text-2)' }}>{d.director_name}</span>
                  <span style={{ fontSize: 11, color: 'var(--lb-green)' }}>you gave ★ {d.avg_score}</span>
                </div>
              ))}
            </div>
          )}
          {!dirs.top_by_count?.length && (
            <div style={{ fontSize: 13, color: 'var(--lb-text-muted)' }}>Watch some movies to see director stats.</div>
          )}
        </>)}
      </div>

      {/* ── ACTOR STATS ───────────────────────────────────────────────── */}
      <div style={CARD}>
        {sectionTitle('🌟 Actor profile')}
        {!actors && <ChartSkeleton height={100} />}
        {actors && (<>
          {actors.top_by_count?.length > 0 ? (
            <>
              <div style={{ ...LABEL, marginBottom: 10 }}>Most seen actors</div>
              {actors.top_by_count.slice(0, 8).map(a => (
                <div key={a.actor_name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--lb-border)' }}>
                  {a.profile_path
                    ? <img src={`${PROFILE}${a.profile_path}`} alt="" style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: '50%', flexShrink: 0 }} />
                    : <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--lb-bg-4)', flexShrink: 0 }} />
                  }
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--lb-text-2)' }}>{a.actor_name}</span>
                  <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--lb-text-muted)', flexShrink: 0 }}>
                    <span>{a.appearances} films</span>
                    {a.avg_score > 0 && <span style={{ color: 'var(--lb-orange)' }}>★ {a.avg_score}</span>}
                  </div>
                </div>
              ))}
              {actors.reliable?.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ ...LABEL, marginBottom: 8 }}>Your reliable actors (consistently above your avg)</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {actors.reliable.map(a => (
                      <div key={a.actor_name} style={{ padding: '4px 12px', borderRadius: 20, background: 'var(--lb-green-dim)', border: '1px solid var(--lb-green)', fontSize: 11, color: 'var(--lb-green)' }}>
                        {a.actor_name} <span style={{ opacity: 0.7 }}>+{a.above_your_avg}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {actors.blind_spots?.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ ...LABEL, marginBottom: 8 }}>Platform blind spots (highly rated actors you've never seen)</div>
                  {actors.blind_spots.map(a => (
                    <div key={a.actor_name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--lb-border)' }}>
                      <span style={{ fontSize: 13, color: 'var(--lb-text-2)' }}>{a.actor_name}</span>
                      <span style={{ fontSize: 11, color: 'var(--lb-text-muted)' }}>{a.platform_films} films · avg ★{a.platform_avg}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--lb-text-muted)' }}>Director data loads first — actor stats appear after.</div>
          )}
        </>)}
      </div>

      {/* ── SOCIAL STATS ─────────────────────────────────────────────── */}
      {social && (
        <div style={CARD}>
          {sectionTitle('👥 Social taste')}
          {social.overlap?.length > 0 ? (
            <>
              <div style={{ ...LABEL, marginBottom: 10 }}>Taste overlap with people you follow</div>
              {social.overlap.map(u => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--lb-border)' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--lb-bg-3)', border: '1px solid var(--lb-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--lb-green)', flexShrink: 0 }}>
                    {u.username.slice(0,2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: 'var(--lb-text-bright)' }}>{u.username}</div>
                    <div style={{ fontSize: 11, color: 'var(--lb-text-muted)' }}>{u.shared_movies} films in common</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: parseFloat(u.overlap_pct) > 30 ? 'var(--lb-green)' : 'var(--lb-orange)' }}>
                    {u.overlap_pct}%
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--lb-text-muted)' }}>Follow users to see taste overlap.</div>
          )}
          {social.disagreements?.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ ...LABEL, marginBottom: 10 }}>Biggest rating disagreements</div>
              {social.disagreements.slice(0, 5).map((d, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--lb-border)' }}>
                  {d.poster_path && <img src={`${POSTER}${d.poster_path}`} alt="" style={{ width: 24, height: 36, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</div>
                    <div style={{ fontSize: 10, color: 'var(--lb-text-muted)' }}>You: {d.my_score} · {d.their_username}: {d.their_score}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--lb-danger)', flexShrink: 0 }}>Δ{d.diff}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MILESTONES ────────────────────────────────────────────────── */}
      {miles && (
        <div style={CARD}>
          {sectionTitle('🏆 Milestones')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10, marginBottom: 16 }}>
            {miles.milestones?.map(m => (
              <div key={m.n} style={{
                padding: '12px', borderRadius: 6, textAlign: 'center',
                background: m.reached ? 'var(--lb-green-dim)' : 'var(--lb-bg-3)',
                border: `1px solid ${m.reached ? 'var(--lb-green)' : 'var(--lb-border)'}`,
              }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: m.reached ? 'var(--lb-green)' : 'var(--lb-text-muted)' }}>
                  {m.reached ? '✓' : `${m.pct_to_next}%`}
                </div>
                <div style={{ fontSize: 10, color: 'var(--lb-text-muted)', marginTop: 3 }}>{m.n} films</div>
              </div>
            ))}
          </div>
          {statRow('Longest streak ever', `${miles.longest_streak} days`, 'consecutive days with at least 1 watch')}
          {statRow('This year vs last', `${miles.this_year} vs ${miles.last_year}`, 'films watched')}
          {miles.genre_completion?.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ ...LABEL, marginBottom: 10 }}>Genre completion</div>
              {miles.genre_completion.slice(0, 6).map(g => (
                <div key={g.name} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <div style={{ width: 80, fontSize: 11, color: 'var(--lb-text-2)', flexShrink: 0 }}>{g.name}</div>
                  <div style={{ flex: 1, background: 'var(--lb-bg-3)', borderRadius: 2, height: 5, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: g.pct >= 80 ? 'var(--lb-green)' : 'var(--lb-orange)', width: `${g.pct}%` }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--lb-text-muted)', width: 70, textAlign: 'right' }}>{g.watched_count}/{g.catalog_count} ({g.pct}%)</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── REGRET & DISCOVERY ────────────────────────────────────────── */}
      {regret && (
        <div style={CARD}>
          {sectionTitle('🔍 Regret & discovery')}
          {regret.consensus_mismatches?.length > 0 && (
            <>
              <div style={{ ...LABEL, marginBottom: 10 }}>Your biggest opinion splits with the platform</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))', gap: 8, marginBottom: 16 }}>
                {regret.consensus_mismatches.slice(0, 8).map(m => (
                  <Link key={m.tmdb_id} to={`/movie/${m.tmdb_id}`} title={`${m.title} — you: ${m.your_score}, platform: ${m.platform_avg}`}
                    style={{ textDecoration: 'none', position: 'relative' }}>
                    {m.poster_path
                      ? <img src={`${POSTER}${m.poster_path}`} alt="" style={{ width: '100%', borderRadius: 3, display: 'block', aspectRatio: '2/3', objectFit: 'cover' }} />
                      : <div style={{ aspectRatio: '2/3', background: 'var(--lb-bg-3)', borderRadius: 3 }} />
                    }
                    <div style={{
                      position: 'absolute', bottom: 3, right: 3,
                      background: 'rgba(0,0,0,0.85)', borderRadius: 2, fontSize: 9, padding: '1px 3px',
                      color: m.delta > 0 ? 'var(--lb-green)' : 'var(--lb-danger)',
                    }}>
                      {m.delta > 0 ? '+' : ''}{m.delta}
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
          {regret.watchlist_graveyard?.length > 0 && (
            <>
              <div style={{ ...LABEL, marginBottom: 10 }}>Watchlist graveyard (6+ months, never watched)</div>
              {regret.watchlist_graveyard.map(m => (
                <Link key={m.tmdb_id} to={`/movie/${m.tmdb_id}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--lb-border)', textDecoration: 'none' }}>
                  {m.poster_path && <img src={`${POSTER}${m.poster_path}`} alt="" style={{ width: 22, height: 33, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</div>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--lb-text-muted)', flexShrink: 0 }}>{m.days_waiting}d waiting</div>
                </Link>
              ))}
            </>
          )}
          {regret.acclaimed_blind_spots?.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ ...LABEL, marginBottom: 10 }}>Acclaimed films you haven't seen</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))', gap: 8 }}>
                {regret.acclaimed_blind_spots.map(m => (
                  <Link key={m.tmdb_id} to={`/movie/${m.tmdb_id}`} title={`${m.title} — TMDB: ${m.vote_average}`}
                    style={{ textDecoration: 'none' }}>
                    {m.poster_path
                      ? <img src={`${POSTER}${m.poster_path}`} alt="" style={{ width: '100%', borderRadius: 3, display: 'block', aspectRatio: '2/3', objectFit: 'cover' }} />
                      : <div style={{ aspectRatio: '2/3', background: 'var(--lb-bg-3)', borderRadius: 3 }} />
                    }
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BehaviourTab() {
  const [abandon, setAbandon]       = useState(null);
  const [acceptance, setAcceptance] = useState(null);
  const [genome, setGenome]         = useState(null);
  const POSTER = 'https://image.tmdb.org/t/p/w92';

  useEffect(() => {
    client.get('/activity/analytics/abandonment').then(r => setAbandon(r.data.movies || [])).catch(() => setAbandon([]));
    client.get('/activity/analytics/recommendation-acceptance').then(r => setAcceptance(r.data)).catch(() => setAcceptance(null));
    client.get('/recommendations/user-genome').then(r => setGenome(r.data)).catch(() => setGenome({}));
  }, []);



  const maxTag = genome?.tags?.length ? Math.max(...genome.tags.map(t => t.score), 0.001) : 1;
  const maxDistinctive = genome?.distinctive_tags?.length ? Math.max(...genome.distinctive_tags.map(t => t.relative), 0.001) : 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── GENOME TASTE DNA ───────────────────────────────────────────── */}
      <div style={CARD}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--lb-text-bright)' }}>🧬 Taste DNA</div>
          <div style={{ fontSize: 11, color: 'var(--lb-text-muted)', marginTop: 2 }}>
            {genome ? `Based on ${genome.n_liked} films you rated ≥7 (${genome.n_with_genome} have genome data)` : 'Loading from ML service…'}
          </div>
        </div>

        {!genome && <ChartSkeleton height={140} />}

        {genome && genome.distinctive_tags?.length > 0 && (
          <>
            <div style={{ ...LABEL, marginBottom: 10 }}>What makes you unique — tags where you exceed the platform average most</div>
            {genome.distinctive_tags.slice(0, 12).map(t => (
              <div key={t.tag} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
                <div style={{ width: 140, fontSize: 11, color: 'var(--lb-text-2)', fontWeight: 500, flexShrink: 0, textTransform: 'capitalize' }}>{t.tag}</div>
                <div style={{ flex: 1, background: 'var(--lb-bg-3)', borderRadius: 2, height: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: 'var(--lb-green)', width: `${Math.round(t.relative / maxDistinctive * 100)}%` }} />
                </div>
                <div style={{ fontSize: 10, color: 'var(--lb-text-muted)', width: 36, textAlign: 'right' }}>+{(t.relative * 100).toFixed(0)}%</div>
              </div>
            ))}
          </>
        )}

        {genome && genome.tags?.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ ...LABEL, marginBottom: 10 }}>Your strongest genome tags (absolute score in liked films)</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {genome.tags.slice(0, 20).map(t => (
                <span key={t.tag} style={{
                  padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                  background: `rgba(132,136,113,${Math.max(0.1, t.score * 2).toFixed(2)})`,
                  color: 'var(--lb-text-bright)', border: '1px solid rgba(132,136,113,0.3)',
                  textTransform: 'capitalize',
                }}>{t.tag}</span>
              ))}
            </div>
          </div>
        )}

        {genome && !genome.tags?.length && (
          <div style={{ fontSize: 13, color: 'var(--lb-text-muted)' }}>
            Rate at least 10 films ≥7 to see your taste DNA.
          </div>
        )}
      </div>

      {/* Acceptance rate */}
      {acceptance && (
        <div style={CARD}>
          <div style={{ ...LABEL, marginBottom: 16 }}>Recommendation acceptance</div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--lb-green)' }}>{acceptance.acceptance_rate}%</div>
              <div style={LABEL}>overall rate</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--lb-text-2)' }}>{acceptance.total_shown}</div>
              <div style={LABEL}>films shown</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--lb-orange)' }}>{acceptance.total_watched}</div>
              <div style={LABEL}>then watched</div>
            </div>
          </div>
          {acceptance.by_strategy?.map(s => (
            <div key={s.strategy} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 120, fontSize: 11, color: 'var(--lb-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.strategy}</div>
              <div style={{ flex: 1, background: 'var(--lb-bg-3)', borderRadius: 2, height: 5, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'var(--lb-green)', width: `${Math.min(s.acceptance_rate, 100)}%` }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--lb-text-muted)', width: 32, textAlign: 'right' }}>{s.acceptance_rate}%</div>
            </div>
          ))}
        </div>
      )}

      {/* Abandoned films */}
      <div style={CARD}>
        <div style={{ ...LABEL, marginBottom: 16 }}>Abandoned films (watched &lt;20%)</div>
        {!abandon ? <ChartSkeleton height={80} />
          : abandon.length === 0
            ? <div style={{ color: 'var(--lb-text-muted)', fontSize: 13 }}>No abandoned films — nice!</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {abandon.map(m => (
                  <div key={m.tmdb_id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {m.poster_path
                      ? <img src={`${POSTER}${m.poster_path}`} alt="" style={{ width: 28, height: 42, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }} />
                      : <div style={{ width: 28, height: 42, background: 'var(--lb-bg-3)', borderRadius: 2, flexShrink: 0 }} />
                    }
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</div>
                      <div style={{ marginTop: 4, height: 4, background: 'var(--lb-bg-3)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: 'var(--lb-danger)', width: `${m.completion_pct || 0}%` }} />
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--lb-danger)', flexShrink: 0 }}>{m.completion_pct}%</div>
                  </div>
                ))}
              </div>
        }
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const [activeTab, setActiveTab]  = useState('stats');
  const [stats, setStats]         = useState(readCache(STATS_CACHE_KEY));
  const [charts, setCharts]       = useState(readCache(CHARTS_CACHE_KEY));
  const [statsLoading, setStatsLoading]   = useState(!readCache(STATS_CACHE_KEY));
  const [chartsLoading, setChartsLoading] = useState(!readCache(CHARTS_CACHE_KEY));
  const [statsError, setStatsError]   = useState(false);
  const [retryCount, setRetryCount]   = useState(0);

  const retry = () => { setStatsError(false); setStatsLoading(true); setChartsLoading(true); setRetryCount(c => c + 1); };

  useEffect(() => {
    if (!statsLoading) return;
    client.get('/activity/analytics')
      .then(r => { setStats(r.data); setStatsError(false); writeCache(STATS_CACHE_KEY, r.data); })
      .catch(() => { setStats(null); setStatsError(true); })
      .finally(() => setStatsLoading(false));

    client.get('/activity/analytics/charts')
      .then(r => { setCharts(r.data); writeCache(CHARTS_CACHE_KEY, r.data); })
      .catch(() => setCharts(null))
      .finally(() => setChartsLoading(false));
  }, [retryCount]);

  // merge for convenience
  const data = stats ? { ...stats, ...(charts || {}) } : null;

  const totalHours = stats ? Math.round((stats.total_minutes || 0) / 60) : 0;
  const totalDays  = stats ? Math.round((stats.total_minutes || 0) / 1440) : 0;

  // Derive peak watching hour label
  const peakHour = stats?.by_hour?.length
    ? stats.by_hour.reduce((a, b) => b.count > a.count ? b : a, { hour: 0, count: 0 })
    : null;
  const fmtHour = h => h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;

  const modeDist = charts?.rating_dist?.length
    ? charts.rating_dist.reduce((a, b) => b.count > a.count ? b : a, { score: 0, count: 0 })
    : null;

  return (
    <>
      <Navbar />
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 24px 80px' }}>
        <div style={{ marginBottom: '24px' }}>
          <div style={LABEL}>Personal</div>
          <h1 style={{ margin: '4px 0 16px', fontSize: '26px', fontWeight: 700, color: 'var(--lb-text-bright)' }}>
            Watch Statistics
          </h1>
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--lb-border)', flexWrap: 'wrap' }}>
            {[['stats','Overview'],['behaviour','Behaviour'],['deep','Deep Stats']].map(([id, label]) => (
              <button key={id} onClick={() => setActiveTab(id)} style={{
                padding: '8px 18px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: `2px solid ${activeTab === id ? 'var(--lb-green)' : 'transparent'}`,
                color: activeTab === id ? 'var(--lb-green)' : 'var(--lb-text-muted)',
                marginBottom: -1, transition: 'color 0.15s',
              }}>{label}</button>
            ))}
          </div>
        </div>

        {activeTab === 'behaviour' && <BehaviourTab />}
        {activeTab === 'deep'      && <DeepStatsTab />}

        {activeTab === 'stats' && statsLoading && (
          <div style={{ color: 'var(--lb-text-muted)', textAlign: 'center', padding: '80px', fontSize: '14px' }}>
            Loading your stats…
          </div>
        )}

        {activeTab === 'stats' && !statsLoading && statsError && (
          <ErrorState title="Could not load your stats" onRetry={retry} />
        )}

        {activeTab === 'stats' && !statsLoading && !statsError && !stats && (
          <div style={{ textAlign: 'center', padding: '80px', color: 'var(--lb-text-muted)', fontSize: '14px' }}>
            Start watching and rating movies to see your stats here.
          </div>
        )}

        {activeTab === 'stats' && stats && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

            {/* ── Headline stats ─────────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
              <StatCard label="Films watched" value={stats.movies_watched} />
              <StatCard label="Hours watched" value={totalHours} sub={`${totalDays}d total`} />
              <StatCard label="Films rated"   value={stats.rated_count} />
              <StatCard label="Avg rating"    value={stats.avg_rating || '—'} sub="out of 10" />
              <StatCard label="Watchlist"     value={stats.wishlist_count} />
              <StatCard label="Day streak"    value={`${stats.streak}d`} accent={stats.streak >= 7 ? 'var(--lb-green)' : 'var(--lb-orange)'} />
            </div>

            {/* ── Activity heatmap (charts) ──────────────────────────────── */}
            <div style={CARD}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={LABEL}>Activity — past year</div>
                <div style={{ fontSize: '11px', color: 'var(--lb-text-muted)' }}>
                  {charts?.by_date?.length || 0} active days
                </div>
              </div>
              {chartsLoading
                ? <ChartSkeleton height={80} />
                : <div style={{ overflowX: 'auto' }}><Heatmap byDate={charts?.by_date || []} /></div>
              }
            </div>

            {/* ── Rating distribution + hour of day ─────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={CARD}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div style={LABEL}>Rating distribution</div>
                  {modeDist?.count > 0 && (
                    <div style={{ fontSize: '11px', color: 'var(--lb-text-muted)' }}>
                      Favourite: <span style={{ color: 'var(--lb-orange)', fontWeight: 700 }}>{modeDist.score}/10</span>
                    </div>
                  )}
                </div>
                {chartsLoading ? <ChartSkeleton />
                  : charts?.rating_dist?.some(d => d.count > 0)
                    ? <RatingHistogram dist={charts.rating_dist} />
                    : <div style={{ color: 'var(--lb-text-muted)', fontSize: '12px' }}>Rate some films first</div>
                }
              </div>

              <div style={CARD}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div style={LABEL}>By hour of day</div>
                  {peakHour?.count > 0 && (
                    <div style={{ fontSize: '11px', color: 'var(--lb-text-muted)' }}>
                      Peak: <span style={{ color: '#fff', fontWeight: 700 }}>{fmtHour(peakHour.hour)}</span>
                    </div>
                  )}
                </div>
                {stats.by_hour.length > 0 ? (
                  <BarChart
                    data={Array.from({ length: 24 }, (_, h) => {
                      const found = stats.by_hour.find(r => r.hour === h);
                      return { label: h % 6 === 0 ? `${h}h` : '', count: found ? found.count : 0 };
                    })}
                    labelKey="label" valueKey="count" color="var(--lb-orange)"
                  />
                ) : <div style={{ color: 'var(--lb-text-muted)', fontSize: '12px' }}>No data yet</div>}
              </div>
            </div>

            {/* ── Monthly (charts) + day of week (stats — fast) ─────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={CARD}>
                <div style={{ ...LABEL, marginBottom: 16 }}>Monthly activity (2 years)</div>
                {chartsLoading ? <ChartSkeleton /> : <MonthChart data={charts?.by_month || []} />}
              </div>
              <div style={CARD}>
                <div style={{ ...LABEL, marginBottom: 16 }}>By day of week</div>
                <BarChart data={stats.by_day} labelKey="label" valueKey="count" />
              </div>
            </div>

            {/* ── Genre breakdown (charts) ───────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={CARD}>
                <div style={{ ...LABEL, marginBottom: 16 }}>Genres watched</div>
                {chartsLoading ? <ChartSkeleton height={180} />
                  : charts?.genres?.length > 0
                    ? <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                        {charts.genres.slice(0, 10).map(g => (
                          <div key={g.name} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: 96, fontSize: '11px', color: 'var(--lb-text-2)', fontWeight: 600, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</div>
                            <div style={{ flex: 1, background: 'var(--lb-bg-3)', borderRadius: '2px', height: '5px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', background: 'var(--lb-green)', borderRadius: '2px', width: `${Math.round((g.count / charts.genres[0].count) * 100)}%` }} />
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--lb-text-muted)', width: 28, textAlign: 'right' }}>{g.count}</div>
                          </div>
                        ))}
                      </div>
                    : <div style={{ color: 'var(--lb-text-muted)', fontSize: '12px' }}>No data yet</div>
                }
              </div>
              <div style={CARD}>
                <div style={{ ...LABEL, marginBottom: 16 }}>Avg rating by genre</div>
                {chartsLoading ? <ChartSkeleton height={180} />
                  : charts?.genre_ratings?.length > 0
                    ? <GenreRatings data={charts.genre_ratings} />
                    : <div style={{ color: 'var(--lb-text-muted)', fontSize: '12px' }}>Rate films to see genre averages</div>
                }
              </div>
            </div>

            {/* ── Films by decade (charts) ───────────────────────────────── */}
            <div style={CARD}>
              <div style={{ ...LABEL, marginBottom: 16 }}>Films by release decade</div>
              {chartsLoading ? <ChartSkeleton height={100} />
                : charts?.by_decade?.length > 0
                  ? <DecadeChart data={charts.by_decade} />
                  : <div style={{ color: 'var(--lb-text-muted)', fontSize: '12px' }}>No data yet</div>
              }
            </div>

            {/* ── Top rated (charts) ─────────────────────────────────────── */}
            {(chartsLoading || charts?.top_rated?.length > 0) && (
              <div style={CARD}>
                <div style={{ ...LABEL, marginBottom: 16 }}>Your highest-rated films</div>
                {chartsLoading ? <ChartSkeleton height={140} /> : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))', gap: '8px' }}>
                  {(charts?.top_rated || []).map(m => (
                    <Link key={m.tmdb_id} to={`/movie/${m.tmdb_id}`}
                      title={`${m.title} — ${m.score}/10`}
                      style={{ textDecoration: 'none', position: 'relative' }}>
                      {m.poster_path
                        ? <img src={`${POSTER}${m.poster_path}`} alt={m.title}
                            style={{ width: '100%', borderRadius: '3px', display: 'block', aspectRatio: '2/3', objectFit: 'cover' }} />
                        : <div style={{ aspectRatio: '2/3', background: 'var(--lb-bg-3)', borderRadius: '3px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '10px', color: 'var(--lb-text-muted)', textAlign: 'center', padding: '4px' }}>
                            {m.title}
                          </div>
                      }
                      <div style={{
                        position: 'absolute', bottom: 4, right: 4,
                        background: 'rgba(0,0,0,0.75)', borderRadius: '2px',
                        fontSize: '10px', fontWeight: 700, color: 'var(--lb-orange)',
                        padding: '1px 4px',
                      }}>
                        {m.score}
                      </div>
                    </Link>
                  ))}
                </div>
                )}
              </div>
            )}

            {/* ── Recent watches + ratings (stats — fast) ────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {stats.recent_watched.length > 0 && (
                <div style={CARD}>
                  <div style={{ ...LABEL, marginBottom: 16 }}>Recently watched</div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {stats.recent_watched.map(m => (
                      <Link key={m.tmdb_id} to={`/movie/${m.tmdb_id}`} title={m.title}>
                        {m.poster_path
                          ? <img src={`${POSTER}${m.poster_path}`} alt={m.title}
                              style={{ height: 72, borderRadius: '3px', display: 'block' }} />
                          : <div style={{ width: 48, height: 72, background: 'var(--lb-bg-3)', borderRadius: '3px' }} />
                        }
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {stats.recent_ratings.length > 0 && (
                <div style={CARD}>
                  <div style={{ ...LABEL, marginBottom: 16 }}>Recent ratings</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {stats.recent_ratings.slice(0, 6).map(m => (
                      <Link key={m.tmdb_id} to={`/movie/${m.tmdb_id}`}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
                        {m.poster_path
                          ? <img src={`${POSTER}${m.poster_path}`} alt={m.title}
                              style={{ width: 26, height: 38, objectFit: 'cover', borderRadius: '2px', flexShrink: 0 }} />
                          : <div style={{ width: 26, height: 38, background: 'var(--lb-bg-3)', borderRadius: '2px', flexShrink: 0 }} />
                        }
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', color: 'var(--lb-text-2)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</div>
                          {m.year && <div style={{ fontSize: '10px', color: 'var(--lb-text-muted)' }}>{m.year}</div>}
                        </div>
                        <div style={{ flexShrink: 0, textAlign: 'right' }}>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: m.score >= 8 ? 'var(--lb-green)' : m.score >= 5 ? 'var(--lb-orange)' : 'var(--lb-danger)' }}>
                            {m.score}
                          </div>
                          <div style={{ fontSize: '9px', color: 'var(--lb-text-muted)' }}>/10</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </>
  );
}
