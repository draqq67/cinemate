import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--lb-bg)', display: 'flex', flexDirection: 'column' }}>
      <nav style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0 32px', height: '52px',
        borderBottom: '1px solid var(--lb-border)', background: 'var(--lb-nav-bg)',
      }}>
        <Link to="/" style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#fff', textDecoration: 'none' }}>
          <span style={{ color: 'var(--lb-green)' }}>C</span>INEMATE
        </Link>
        <span style={{ fontSize: '12px', color: 'var(--lb-text-muted)' }}>
          No account?{' '}
          <Link to="/register" style={{ color: 'var(--lb-green)', fontWeight: 600 }}>Sign up</Link>
        </span>
      </nav>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ width: '100%', maxWidth: '360px' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--lb-green)', marginBottom: '10px' }}>
              Welcome back
            </div>
            <h1 style={{ fontSize: '26px', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>Sign in to Cinemate</h1>
            <p style={{ fontSize: '13px', color: 'var(--lb-text)', marginTop: '8px' }}>Continue your film journal</p>
          </div>

          <div style={{ background: 'var(--lb-bg-2)', border: '1px solid var(--lb-border)', borderRadius: '6px', padding: '28px' }}>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--lb-text-muted)', marginBottom: '6px' }}>
                  Email
                </label>
                <input
                  type="email" value={form.email} placeholder="you@example.com"
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  style={{ width: '100%' }} required
                />
              </div>
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--lb-text-muted)', marginBottom: '6px' }}>
                  Password
                </label>
                <input
                  type="password" value={form.password} placeholder="••••••••"
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  style={{ width: '100%' }} required
                />
              </div>

              {error && (
                <div style={{
                  fontSize: '12px', color: 'var(--lb-danger)', marginBottom: '16px',
                  padding: '9px 12px', background: 'rgba(248,113,113,0.1)',
                  border: '1px solid rgba(248,113,113,0.25)', borderRadius: '4px',
                }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} style={{
                width: '100%', padding: '11px', background: 'var(--lb-green)', border: 'none',
                borderRadius: '4px', color: 'var(--lb-bg)', fontSize: '12px', fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
              }}>
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>

          <p style={{ fontSize: '12px', color: 'var(--lb-text-muted)', textAlign: 'center', marginTop: '20px' }}>
            New here?{' '}
            <Link to="/register" style={{ color: 'var(--lb-green)', fontWeight: 600 }}>Create an account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
