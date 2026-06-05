import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/ui/Navbar';
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

// ── Main ───────────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const [stats, setStats]         = useState(readCache(STATS_CACHE_KEY));
  const [charts, setCharts]       = useState(readCache(CHARTS_CACHE_KEY));
  const [statsLoading, setStatsLoading]   = useState(!readCache(STATS_CACHE_KEY));
  const [chartsLoading, setChartsLoading] = useState(!readCache(CHARTS_CACHE_KEY));

  useEffect(() => {
    if (!statsLoading) return;
    client.get('/activity/analytics')
      .then(r => { setStats(r.data); writeCache(STATS_CACHE_KEY, r.data); })
      .catch(() => setStats(null))
      .finally(() => setStatsLoading(false));

    client.get('/activity/analytics/charts')
      .then(r => { setCharts(r.data); writeCache(CHARTS_CACHE_KEY, r.data); })
      .catch(() => setCharts(null))
      .finally(() => setChartsLoading(false));
  }, []);

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
        <div style={{ marginBottom: '32px' }}>
          <div style={LABEL}>Personal</div>
          <h1 style={{ margin: '4px 0 0', fontSize: '26px', fontWeight: 700, color: 'var(--lb-text-bright)' }}>
            Watch Statistics
          </h1>
        </div>

        {statsLoading && (
          <div style={{ color: 'var(--lb-text-muted)', textAlign: 'center', padding: '80px', fontSize: '14px' }}>
            Loading your stats…
          </div>
        )}

        {!statsLoading && !stats && (
          <div style={{ textAlign: 'center', padding: '80px', color: 'var(--lb-text-muted)', fontSize: '14px' }}>
            Start watching and rating movies to see your stats here.
          </div>
        )}

        {stats && (
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
