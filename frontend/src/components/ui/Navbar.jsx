import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <nav style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 32px', borderBottom: '0.5px solid var(--color-border-tertiary)',
      background: 'var(--color-background-primary)', position: 'sticky', top: 0, zIndex: 100,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
        <Link to="/" style={{ fontSize: '15px', fontWeight: 500, color: 'var(--color-text-primary)', textDecoration: 'none' }}>
          Cinemate
        </Link>
        <div style={{ display: 'flex', gap: '20px' }}>
          {[['/', 'Home'], ['/browse', 'Browse'], ['/watchlist', 'My list']].map(([to, label]) => (
            <Link key={to} to={to} style={{ fontSize: '13px', color: 'var(--color-text-secondary)', textDecoration: 'none' }}>
              {label}
            </Link>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {user ? (
          <>
            <Link to="/profile" style={{ textDecoration: 'none' }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: '#E6F1FB', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '12px', fontWeight: 500, color: '#0C447C',
              }}>
                {user.username.slice(0, 2).toUpperCase()}
              </div>
            </Link>
            <button onClick={handleLogout} style={{
              background: 'none', border: '0.5px solid var(--color-border-secondary)',
              borderRadius: '6px', padding: '5px 12px', fontSize: '12px',
              color: 'var(--color-text-secondary)', cursor: 'pointer',
            }}>
              Sign out
            </button>
          </>
        ) : (
          <Link to="/login" style={{
            fontSize: '13px', color: 'var(--color-text-primary)',
            textDecoration: 'none', fontWeight: 500,
          }}>
            Sign in
          </Link>
        )}
      </div>
    </nav>
  );
}