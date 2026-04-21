import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';

export default function VideoPlayer({ streamUrl, title, posterPath, tmdbId, onProgress }) {
  const videoRef      = useRef(null);
  const hlsRef        = useRef(null);
  const containerRef  = useRef(null);
  const controlsTimer = useRef(null);

  const [status, setStatus]           = useState('loading');
  const [playing, setPlaying]         = useState(false);
  const [progress, setProgress]       = useState(0);
  const [duration, setDuration]       = useState(0);
  const [buffered, setBuffered]       = useState(0);
  const [volume, setVolume]           = useState(1);
  const [muted, setMuted]             = useState(false);
  const [fullscreen, setFullscreen]   = useState(false);
  const [showControls, setShowControls] = useState(true);

  const POSTER = posterPath
    ? `https://image.tmdb.org/t/p/w780${posterPath}`
    : null;

  // ── HLS setup ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!streamUrl || !video) return;

    let hls = null;

    const onManifest = () => setStatus('ready');
    const onFatalError = () => setStatus('error');

    if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, backBufferLength: 90 });
      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, onManifest);
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) onFatalError();
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
      video.addEventListener('loadedmetadata', onManifest, { once: true });
      video.addEventListener('error', onFatalError, { once: true });
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus('error');
    }

    return () => {
      if (hls) { hls.destroy(); hlsRef.current = null; }
    };
  }, [streamUrl]);

  // ── Video event listeners ──────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay         = () => setPlaying(true);
    const onPause        = () => setPlaying(false);
    const onEnded        = () => setPlaying(false);
    const onTimeUpdate   = () => {
      setProgress(video.currentTime);
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };
    const onDuration     = () => setDuration(video.duration || 0);
    const onVolumeChange = () => {
      setVolume(video.volume);
      setMuted(video.muted);
    };

    video.addEventListener('play',         onPlay);
    video.addEventListener('pause',        onPause);
    video.addEventListener('ended',        onEnded);
    video.addEventListener('timeupdate',   onTimeUpdate);
    video.addEventListener('durationchange', onDuration);
    video.addEventListener('volumechange', onVolumeChange);

    return () => {
      video.removeEventListener('play',         onPlay);
      video.removeEventListener('pause',        onPause);
      video.removeEventListener('ended',        onEnded);
      video.removeEventListener('timeupdate',   onTimeUpdate);
      video.removeEventListener('durationchange', onDuration);
      video.removeEventListener('volumechange', onVolumeChange);
    };
  }, []);

  // ── Fullscreen listener ────────────────────────────────────────────────────
  useEffect(() => {
    const onFsChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // ── Progress saving ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tmdbId || !onProgress || !playing) return;
    const interval = setInterval(() => {
      if (videoRef.current) {
        onProgress(Math.floor(videoRef.current.currentTime));
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [playing, tmdbId, onProgress]);

  // ── Controls auto-hide ─────────────────────────────────────────────────────
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(controlsTimer.current);
    if (playing) {
      controlsTimer.current = setTimeout(() => setShowControls(false), 3000);
    }
  }, [playing]);

  useEffect(() => {
    return () => clearTimeout(controlsTimer.current);
  }, []);

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
    if (videoRef.current) {
      videoRef.current.volume = v;
      videoRef.current.muted  = v === 0;
    }
  };

  const toggleMute = () => {
    if (videoRef.current) videoRef.current.muted = !videoRef.current.muted;
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    document.fullscreenElement
      ? document.exitFullscreen()
      : containerRef.current.requestFullscreen();
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

  return (
    <div
      ref={containerRef}
      onMouseMove={resetControlsTimer}
      onMouseLeave={() => playing && setShowControls(false)}
      style={{
        position: 'relative', width: '100%', aspectRatio: '16/9',
        background: '#000', borderRadius: '10px', overflow: 'hidden',
        cursor: showControls ? 'default' : 'none',
      }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <video
        ref={videoRef}
        onClick={togglePlay}
        poster={POSTER || undefined}
        preload="metadata"
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
      />

      {/* Loading */}
      {status === 'loading' && (
        <div style={overlayStyle}>
          <div style={{
            width: 40, height: 40,
            border: '3px solid rgba(255,255,255,0.2)',
            borderTopColor: '#fff', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div style={{ ...overlayStyle, flexDirection: 'column', gap: 8 }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>Stream unavailable</span>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Could not load video</span>
        </div>
      )}

      {/* Big play button */}
      {status === 'ready' && !playing && (
        <div onClick={togglePlay} style={{ ...overlayStyle, cursor: 'pointer' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)',
            border: '1.5px solid rgba(255,255,255,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: 0, height: 0,
              borderTop: '12px solid transparent',
              borderBottom: '12px solid transparent',
              borderLeft: '20px solid #fff',
              marginLeft: 4,
            }} />
          </div>
        </div>
      )}

      {/* Controls */}
      {status === 'ready' && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
          padding: '32px 16px 12px',
          opacity: showControls ? 1 : 0,
          transition: 'opacity 0.3s',
          pointerEvents: showControls ? 'auto' : 'none',
        }}>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginBottom: 8, fontWeight: 500 }}>
            {title}
          </div>

          {/* Seek bar */}
          <div
            onClick={seek}
            style={{
              height: 4, background: 'rgba(255,255,255,0.2)',
              borderRadius: 2, cursor: 'pointer', marginBottom: 10,
              position: 'relative',
            }}
          >
            <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${bufPct}%`, background: 'rgba(255,255,255,0.3)', borderRadius: 2 }} />
            <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: '#fff', borderRadius: 2 }} />
            <div style={{
              position: 'absolute', top: '50%', left: `${pct}%`,
              transform: 'translate(-50%, -50%)',
              width: 12, height: 12, borderRadius: '50%', background: '#fff',
            }} />
          </div>

          {/* Buttons row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <IconBtn onClick={togglePlay}>
              {playing ? <PauseIcon /> : <PlayIcon />}
            </IconBtn>

            <IconBtn onClick={toggleMute}>
              {muted || volume === 0 ? <MuteIcon /> : <VolumeIcon />}
            </IconBtn>

            <input
              type="range" min="0" max="1" step="0.05"
              value={muted ? 0 : volume}
              onChange={changeVolume}
              style={{ width: 70, accentColor: '#fff', cursor: 'pointer' }}
            />

            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginLeft: 4 }}>
              {fmt(progress)} / {fmt(duration)}
            </span>

            <div style={{ flex: 1 }} />

            <IconBtn onClick={toggleFullscreen}>
              {fullscreen ? <ExitFsIcon /> : <FsIcon />}
            </IconBtn>
          </div>
        </div>
      )}
    </div>
  );
}

const overlayStyle = {
  position: 'absolute', inset: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(0,0,0,0.5)',
};

function IconBtn({ onClick, children }) {
  return (
    <button onClick={onClick} style={{
      background: 'none', border: 'none', cursor: 'pointer',
      color: '#fff', padding: 4, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    }}>
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