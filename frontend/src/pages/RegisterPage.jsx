import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import PasswordStrength from '../components/ui/PasswordStrength';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', username: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) return setError('Passwords do not match');
    if (form.password.length < 8) return setError('Password must be at least 8 characters');
    setLoading(true);
    try {
      await register(form.email, form.username, form.password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const field = (key) => ({
    value: form[key],
    onChange: (e) => setForm(f => ({ ...f, [key]: e.target.value })),
    style: { width: '100%' },
  });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background-primary)' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 32px', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
        <Link to="/" style={{ fontSize: '15px', fontWeight: 500, color: 'var(--color-text-primary)', textDecoration: 'none' }}>Cinemate</Link>
        <span style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>
          Have an account? <Link to="/login" style={{ color: 'var(--color-text-info)' }}>Sign in</Link>
        </span>
      </nav>

      <div style={{ maxWidth: '360px', margin: '48px auto', padding: '0 24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 500, marginBottom: '4px' }}>Create account</h1>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '24px' }}>Start watching and get recommendations</p>

        <form onSubmit={handleSubmit}>
          {[
            { key: 'username', label: 'Username', type: 'text', placeholder: 'dragos' },
            { key: 'email', label: 'Email', type: 'email', placeholder: 'you@example.com' },
          ].map(({ key, label, type, placeholder }) => (
            <div key={key} style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>{label}</label>
              <input type={type} placeholder={placeholder} required {...field(key)} />
            </div>
          ))}

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Password</label>
            <input type="password" placeholder="Min. 8 characters" required {...field('password')} />
            <PasswordStrength password={form.password} />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Confirm password</label>
            <input type="password" placeholder="••••••••" required {...field('confirm')} />
            {form.confirm && form.password !== form.confirm && (
              <div style={{ fontSize: '11px', color: 'var(--color-text-danger)', marginTop: '4px' }}>Passwords don't match</div>
            )}
          </div>

          {error && <div style={{ fontSize: '12px', color: 'var(--color-text-danger)', marginBottom: '12px', padding: '8px 10px', background: 'var(--color-background-danger)', borderRadius: '6px' }}>{error}</div>}

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '10px', background: '#185FA5', border: 'none',
            borderRadius: '6px', color: '#fff', fontSize: '13px', fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
          }}>
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', textAlign: 'center', marginTop: '16px' }}>
          Already registered? <Link to="/login" style={{ color: 'var(--color-text-info)' }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}