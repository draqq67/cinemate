import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import { getUnreadCount } from '../../api/dm';

const NAV_LINKS = [
  ['/', 'Films'],
  ['/browse', 'Browse'],
  ['/discover', 'Discover'],
  ['/lists', 'Lists'],
  ['/users', 'People'],
  ['/activity', 'Activity'],
  ['/analytics', 'Stats'],
  ['/watchlist', 'Watchlist'],
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate  = useNavigate();
  const location  = useLocation();
  const [unread, setUnread] = useState(0);

  // Poll unread DM count every 30s when logged in
  useEffect(() => {
    if (!user) return;
    const poll = () => getUnreadCount().then(({ data }) => setUnread(data.unread || 0)).catch(() => {});
    poll();
    const t = setInterval(poll, 30000);
    return () => clearInterval(t);
  }, [user]);
  const [open, setOpen] = useState(false);

  // Close mobile menu on route change
  const pathname = location.pathname;
  useEffect(() => {
    const timer = setTimeout(() => setOpen(false), 0);
    return () => clearTimeout(timer);
  }, [pathname]);

  const handleLogout = async () => { await logout(); navigate('/login'); };

  const isActive = (path) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  const linkStyle = (path) => ({
    fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em',
    textTransform: 'uppercase', textDecoration: 'none',
    color: isActive(path) ? 'var(--lb-text-bright)' : 'var(--lb-text)',
    padding: '4px 0',
    borderBottom: `2px solid ${isActive(path) ? 'var(--lb-green)' : 'transparent'}`,
    transition: 'color 0.15s, border-color 0.15s',
  });

  const mobileLinkStyle = (path) => ({
    fontSize: '13px', fontWeight: 600, letterSpacing: '0.06em',
    textTransform: 'uppercase', textDecoration: 'none',
    color: isActive(path) ? 'var(--lb-text-bright)' : 'var(--lb-text)',
    padding: '10px 0',
    borderBottom: `1px solid ${isActive(path) ? 'var(--lb-green)' : 'var(--lb-border)'}`,
  });

  return (
    <>
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 var(--page-px)', height: '52px',
        borderBottom: '1px solid var(--lb-border)',
        background: 'var(--lb-nav-bg)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        {/* Logo + desktop links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px', minWidth: 0 }}>
          <Link to="/" style={{
            fontSize: '16px', fontWeight: 700, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'var(--lb-text-bright)', textDecoration: 'none',
            flexShrink: 0,
          }}>
            <span style={{ color: 'var(--lb-green)' }}>C</span>INEMATE
          </Link>

          {/* Desktop nav */}
          <div className="nav-links">
            {NAV_LINKS.map(([to, label]) => (
              <Link key={to} to={to} style={linkStyle(to)}>{label}</Link>
            ))}
            {user && (
              <Link to="/messages" style={{ ...linkStyle('/messages'), position: 'relative' }}>
                Messages
                {unread > 0 && (
                  <span style={{
                    position: 'absolute', top: -6, right: -10,
                    minWidth: 16, height: 16, borderRadius: '50%',
                    background: 'var(--lb-green)', color: 'var(--lb-bg)',
                    fontSize: 9, fontWeight: 800, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', padding: '0 3px',
                  }}>{unread > 9 ? '9+' : unread}</span>
                )}
              </Link>
            )}
            {user?.role === 'admin' && (
              <Link to="/admin" style={{
                ...linkStyle('/admin'),
                color: 'var(--lb-admin)',
                borderBottomColor: isActive('/admin') ? 'var(--lb-admin)' : 'transparent',
              }}>Admin</Link>
            )}
          </div>
        </div>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
          <button onClick={toggle} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            style={{
              background: 'none', border: '1px solid var(--lb-border-2)',
              borderRadius: '4px', padding: '5px 10px', fontSize: '13px',
              color: 'var(--lb-text)', cursor: 'pointer', lineHeight: 1,
            }}>
            {theme === 'dark' ? '☀' : '☾'}
          </button>

          {/* Auth — desktop only */}
          <div className="hide-mobile" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {user ? (
              <>
                <Link to="/profile" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', background: 'var(--lb-bg-3)',
                    border: '2px solid var(--lb-green)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: 'var(--lb-green)',
                  }}>
                    {user.username.slice(0, 2).toUpperCase()}
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--lb-text)', fontWeight: 500 }}>{user.username}</span>
                </Link>
                <Link to="/import" style={{
                  fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em',
                  textTransform: 'uppercase', color: 'var(--lb-text)', textDecoration: 'none',
                  padding: '4px 10px', border: '1px solid var(--lb-border-2)', borderRadius: '4px',
                }}>Import</Link>
                <button onClick={handleLogout} style={{
                  background: 'none', border: '1px solid var(--lb-border-2)',
                  borderRadius: '4px', padding: '4px 12px', fontSize: '11px',
                  fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
                  color: 'var(--lb-text)', cursor: 'pointer',
                }}>Sign out</button>
              </>
            ) : (
              <>
                <Link to="/login" style={{
                  fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em',
                  textTransform: 'uppercase', color: 'var(--lb-text)', textDecoration: 'none',
                }}>Sign in</Link>
                <Link to="/register" style={{
                  fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em',
                  textTransform: 'uppercase', padding: '5px 14px',
                  background: 'var(--lb-green)', color: 'var(--lb-bg)',
                  borderRadius: '4px', textDecoration: 'none',
                }}>Create account</Link>
              </>
            )}
          </div>

          {/* Hamburger — mobile only */}
          <button className="hamburger" onClick={() => setOpen(o => !o)}
            aria-label="Toggle menu">
            {open ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            )}
          </button>
        </div>
      </nav>

      {/* Mobile dropdown */}
      <div className={`nav-mobile-menu ${open ? 'open' : ''}`}>
        {NAV_LINKS.map(([to, label]) => (
          <Link key={to} to={to} style={mobileLinkStyle(to)}>{label}</Link>
        ))}
        {user && (
          <Link to="/messages" style={{ ...mobileLinkStyle('/messages'), display: 'flex', alignItems: 'center', gap: 8 }}>
            Messages
            {unread > 0 && (
              <span style={{ minWidth: 18, height: 18, borderRadius: '50%', background: 'var(--lb-green)', color: 'var(--lb-bg)', fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </Link>
        )}
        {user?.role === 'admin' && (
          <Link to="/admin" style={{ ...mobileLinkStyle('/admin'), color: 'var(--lb-admin)' }}>Admin</Link>
        )}
        <div style={{ borderTop: '1px solid var(--lb-border)', paddingTop: '12px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {user ? (
            <>
              <Link to="/profile" style={{ fontSize: '13px', color: 'var(--lb-text)', textDecoration: 'none' }}>
                ◈ {user.username}
              </Link>
              <Link to="/import" style={{ fontSize: '13px', color: 'var(--lb-text)', textDecoration: 'none' }}>Import</Link>
              <button onClick={handleLogout} style={{
                background: 'none', border: 'none', fontSize: '13px', textAlign: 'left',
                color: 'var(--lb-text-muted)', cursor: 'pointer', padding: 0,
              }}>Sign out</button>
            </>
          ) : (
            <>
              <Link to="/login" style={{ fontSize: '13px', color: 'var(--lb-text)', textDecoration: 'none' }}>Sign in</Link>
              <Link to="/register" style={{
                fontSize: '13px', fontWeight: 600, padding: '8px 16px', textAlign: 'center',
                background: 'var(--lb-green)', color: 'var(--lb-bg)', borderRadius: '4px', textDecoration: 'none',
              }}>Create account</Link>
            </>
          )}
        </div>
      </div>
    </>
  );
}
