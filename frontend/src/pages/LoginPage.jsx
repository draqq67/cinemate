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
    <div style={{ minHeight: '100vh', background: 'var(--color-background-primary)' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 32px', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
        <Link to="/" style={{ fontSize: '15px', fontWeight: 500, color: 'var(--color-text-primary)', textDecoration: 'none' }}>Cinemate</Link>
        <span style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>
          No account? <Link to="/register" style={{ color: 'var(--color-text-info)' }}>Sign up</Link>
        </span>
      </nav>

      <div style={{ maxWidth: '360px', margin: '60px auto', padding: '0 24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 500, marginBottom: '4px' }}>Welcome back</h1>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '28px' }}>Sign in to continue watching</p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Email</label>
            <input
              type="email" value={form.email} placeholder="you@example.com"
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              style={{ width: '100%' }} required
            />
          </div>
          <div style={{ marginBottom: '6px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Password</label>
            <input
              type="password" value={form.password} placeholder="••••••••"
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              style={{ width: '100%' }} required
            />
          </div>
          <div style={{ textAlign: 'right', marginBottom: '16px' }}>
            <span style={{ fontSize: '11px', color: 'var(--color-text-info)', cursor: 'pointer' }}>Forgot password?</span>
          </div>

          {error && <div style={{ fontSize: '12px', color: 'var(--color-text-danger)', marginBottom: '12px', padding: '8px 10px', background: 'var(--color-background-danger)', borderRadius: '6px' }}>{error}</div>}

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '10px', background: '#185FA5', border: 'none',
            borderRadius: '6px', color: '#fff', fontSize: '13px', fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
          }}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', textAlign: 'center', marginTop: '16px' }}>
          New here? <Link to="/register" style={{ color: 'var(--color-text-info)' }}>Create an account</Link>
        </p>
      </div>
    </div>
  );
}