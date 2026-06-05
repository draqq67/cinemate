import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';

export default function VideoPlayer({ streamUrl, title, posterPath, tmdbId, onProgress, subtitles = [] }) {
  const videoRef      = useRef(null);
  const hlsRef        = useRef(null);
  const containerRef  = useRef(null);
  const controlsTimer = useRef(null);

  const [status, setStatus]                 = useState('loading');
  const [playing, setPlaying]               = useState(false);
  const [progress, setProgress]             = useState(0);
  const [duration, setDuration]             = useState(0);
  const [buffered, setBuffered]             = useState(0);
  const [volume, setVolume]                 = useState(1);
  const [muted, setMuted]                   = useState(false);
  const [fullscreen, setFullscreen]         = useState(false);
  const [showControls, setShowControls]     = useState(true);
  const [selectedSub, setSelectedSub]       = useState(null);
  const [showSubMenu, setShowSubMenu]       = useState(false);

  const POSTER = posterPath
    ? `https://image.tmdb.org/t/p/w780${posterPath}`
    : null;

  // ── Stream setup ───────────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!streamUrl || !video) return;

    const onReady      = () => setStatus('ready');
    const onFatalError = () => setStatus('error');
    const isHLS        = streamUrl.includes('.m3u8');

    if (!isHLS) {
      video.src = streamUrl;
      video.load();
      video.addEventListener('canplay', onReady,      { once: true });
      video.addEventListener('error',   onFatalError, { once: true });
      return () => {
        video.removeEventListener('canplay', onReady);
        video.removeEventListener('error',   onFatalError);
        video.src = '';
      };
    }

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, backBufferLength: 90, maxBufferLength: 30 });
      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, onReady);
      hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) onFatalError(); });
      return () => { hls.destroy(); hlsRef.current = null; };
    }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
      video.addEventListener('loadedmetadata', onReady,      { once: true });
      video.addEventListener('error',          onFatalError, { once: true });
      return () => {
        video.removeEventListener('loadedmetadata', onReady);
        video.removeEventListener('error',          onFatalError);
      };
    }

    const t = setTimeout(() => setStatus('error'), 0);
    return () => clearTimeout(t);
  }, [streamUrl]);

  // ── Activate selected subtitle track ───────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const t = setTimeout(() => {
      for (let i = 0; i < video.textTracks.length; i++) {
        const track = video.textTracks[i];
        track.mode = (selectedSub && track.label === selectedSub.label) ? 'showing' : 'disabled';
      }
    }, 80);
    return () => clearTimeout(t);
  }, [selectedSub]);

  // ── Video event listeners ──────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay         = () => setPlaying(true);
    const onPause        = () => setPlaying(false);
    const onEnded        = () => setPlaying(false);
    const onTimeUpdate   = () => {
      setProgress(video.currentTime);
      if (video.buffered.length > 0)
        setBuffered(video.buffered.end(video.buffered.length - 1));
    };
    const onDuration     = () => setDuration(video.duration || 0);
    const onVolumeChange = () => { setVolume(video.volume); setMuted(video.muted); };

    video.addEventListener('play',           onPlay);
    video.addEventListener('pause',          onPause);
    video.addEventListener('ended',          onEnded);
    video.addEventListener('timeupdate',     onTimeUpdate);
    video.addEventListener('durationchange', onDuration);
    video.addEventListener('volumechange',   onVolumeChange);

    return () => {
      video.removeEventListener('play',           onPlay);
      video.removeEventListener('pause',          onPause);
      video.removeEventListener('ended',          onEnded);
      video.removeEventListener('timeupdate',     onTimeUpdate);
      video.removeEventListener('durationchange', onDuration);
      video.removeEventListener('volumechange',   onVolumeChange);
    };
  }, []);

  // ── Fullscreen listener ────────────────────────────────────────────────────
  useEffect(() => {
    const onFsChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // ── Progress saving every 30s ──────────────────────────────────────────────
  useEffect(() => {
    if (!tmdbId || !onProgress || !playing) return;
    const interval = setInterval(() => {
      if (videoRef.current) onProgress(Math.floor(videoRef.current.currentTime));
    }, 30000);
    return () => clearInterval(interval);
  }, [playing, tmdbId, onProgress]);

  // ── Controls auto-hide ─────────────────────────────────────────────────────
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(controlsTimer.current);
    if (playing) controlsTimer.current = setTimeout(() => setShowControls(false), 3000);
  }, [playing]);

  useEffect(() => () => clearTimeout(controlsTimer.current), []);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video || status !== 'ready') return;
    playing ? video.pause() : video.play();
  };

  const seek = (e) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    video.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
  };

  const changeVolume = (e) => {
    const v = parseFloat(e.target.value);
    if (videoRef.current) { videoRef.current.volume = v; videoRef.current.muted = v === 0; }
  };

  const toggleMute      = () => { if (videoRef.current) videoRef.current.muted = !videoRef.current.muted; };
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    document.fullscreenElement ? document.exitFullscreen() : containerRef.current.requestFullscreen();
  };

  const selectSub = (sub) => {
    setSelectedSub(sub);
    setShowSubMenu(false);
  };

  const fmt = (s) => {
    if (!s || isNaN(s)) return '0:00';
    const h   = Math.floor(s / 3600);
    const m   = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
      : `${m}:${String(sec).padStart(2, '0')}`;
  };

  const pct    = duration > 0 ? (progress / duration) * 100 : 0;
  const bufPct = duration > 0 ? (buffered / duration) * 100 : 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      onMouseMove={resetControlsTimer}
      onMouseLeave={() => playing && setShowControls(false)}
      onClick={() => showSubMenu && setShowSubMenu(false)}
      style={{
        position: 'relative', width: '100%', aspectRatio: '16/9',
        background: '#000', borderRadius: '10px', overflow: 'hidden',
        cursor: showControls ? 'default' : 'none',
      }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Video element */}
      <video
        ref={videoRef}
        onClick={togglePlay}
        poster={POSTER || undefined}
        preload="metadata"
        playsInline
        crossOrigin="anonymous"
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
      >
        {selectedSub && (
          <track
            key={selectedSub.url}
            kind="subtitles"
            label={selectedSub.label}
            srcLang={selectedSub.language}
            src={selectedSub.url}
            default
          />
        )}
      </video>

      {/* Loading spinner */}
      {status === 'loading' && (
        <div style={overlay}>
          <div style={{
            width: 44, height: 44,
            border: '3px solid rgba(255,255,255,0.15)',
            borderTopColor: '#fff', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
        </div>
      )}

      {/* Error state */}
      {status === 'error' && (
        <div style={{ ...overlay, flexDirection: 'column', gap: 10 }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none"
            stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span style={{ color: '#fff', fontSize: 15, fontWeight: 500 }}>Stream unavailable</span>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Could not load video</span>
        </div>
      )}

      {/* Big play button when paused */}
      {status === 'ready' && !playing && (
        <div onClick={togglePlay} style={{ ...overlay, cursor: 'pointer', background: 'transparent' }}>
          <div style={{
            width: 68, height: 68, borderRadius: '50%',
            background: 'rgba(255,255,255,0.12)',
            border: '1.5px solid rgba(255,255,255,0.25)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: 0, height: 0,
              borderTop: '13px solid transparent',
              borderBottom: '13px solid transparent',
              borderLeft: '22px solid #fff',
              marginLeft: 5,
            }} />
          </div>
        </div>
      )}

      {/* Controls bar */}
      {status === 'ready' && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'linear-gradient(transparent, rgba(0,0,0,0.88))',
          padding: '40px 16px 14px',
          opacity: showControls ? 1 : 0,
          transition: 'opacity 0.3s',
          pointerEvents: showControls ? 'auto' : 'none',
        }}>

          {/* Title */}
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginBottom: 10, fontWeight: 500 }}>
            {title}
          </div>

          {/* Seek bar */}
          <div onClick={seek} style={{
            height: 4, background: 'rgba(255,255,255,0.18)',
            borderRadius: 2, cursor: 'pointer', marginBottom: 12,
            position: 'relative',
          }}>
            <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${bufPct}%`, background: 'rgba(255,255,255,0.28)', borderRadius: 2 }} />
            <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: '#fff', borderRadius: 2 }} />
            <div style={{ position: 'absolute', top: '50%', left: `${pct}%`, transform: 'translate(-50%, -50%)', width: 13, height: 13, borderRadius: '50%', background: '#fff', boxShadow: '0 0 4px rgba(0,0,0,0.5)' }} />
          </div>

          {/* Button row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>

            <Btn onClick={togglePlay}>{playing ? <PauseIcon /> : <PlayIcon />}</Btn>
            <Btn onClick={toggleMute}>{muted || volume === 0 ? <MuteIcon /> : <VolumeIcon />}</Btn>

            <input
              type="range" min="0" max="1" step="0.05"
              value={muted ? 0 : volume}
              onChange={changeVolume}
              style={{ width: 72, accentColor: '#fff', cursor: 'pointer' }}
            />

            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginLeft: 2, fontVariantNumeric: 'tabular-nums' }}>
              {fmt(progress)} / {fmt(duration)}
            </span>

            <div style={{ flex: 1 }} />

            {/* CC button — only shown when subtitles are available */}
            {subtitles.length > 0 && (
              <div style={{ position: 'relative' }}>
                {/* Subtitle dropdown */}
                {showSubMenu && (
                  <div
                    onClick={e => e.stopPropagation()}
                    style={{
                      position: 'absolute', bottom: 36, right: 0,
                      background: 'rgba(18,18,18,0.96)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 8, minWidth: 180,
                      padding: '6px 0',
                      boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
                    }}
                  >
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', padding: '4px 14px 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Subtitles
                    </div>
                    {[null, ...subtitles].map((sub) => (
                      <button
                        key={sub ? sub.url : '__off'}
                        onClick={() => selectSub(sub)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          width: '100%', padding: '7px 14px',
                          background: 'none', border: 'none',
                          color: (!selectedSub && !sub) || (selectedSub?.url === sub?.url)
                            ? '#fff' : 'rgba(255,255,255,0.55)',
                          fontSize: 13, cursor: 'pointer', textAlign: 'left',
                        }}
                      >
                        <span style={{
                          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                          background: (!selectedSub && !sub) || (selectedSub?.url === sub?.url)
                            ? '#fff' : 'transparent',
                          border: '1px solid rgba(255,255,255,0.4)',
                        }} />
                        {sub ? `${sub.label} (${sub.language})` : 'Off'}
                      </button>
                    ))}
                  </div>
                )}
                <Btn
                  onClick={(e) => { e.stopPropagation(); setShowSubMenu(m => !m); }}
                  active={!!selectedSub}
                >
                  <CcIcon />
                </Btn>
              </div>
            )}

            <Btn onClick={toggleFullscreen}>
              {fullscreen ? <ExitFsIcon /> : <FsIcon />}
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const overlay = {
  position: 'absolute', inset: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(0,0,0,0.55)',
};

function Btn({ onClick, children, active }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'rgba(255,255,255,0.15)' : 'none',
        border: 'none', cursor: 'pointer',
        color: '#fff', padding: 4, borderRadius: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: 0.85,
      }}
    >
      {children}
    </button>
  );
}

function PlayIcon()   { return <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>; }
function PauseIcon()  { return <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>; }
function VolumeIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>; }
function MuteIcon()   { return <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>; }
function FsIcon()     { return <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>; }
function ExitFsIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>; }
function CcIcon()     { return <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 7H9.5v-.5h-2v3h2V13H12v1c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h4c.55 0 1 .45 1 1v1zm7 0h-2.5v-.5h-2v3h2V13H19v1c0 .55-.45 1-1 1h-4c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h4c.55 0 1 .45 1 1v1z"/></svg>; }
