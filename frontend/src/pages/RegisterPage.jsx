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

  const LABEL_STYLE = {
    display: 'block', fontSize: '11px', fontWeight: 700,
    letterSpacing: '0.08em', textTransform: 'uppercase',
    color: 'var(--lb-text-muted)', marginBottom: '6px',
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
          Have an account?{' '}
          <Link to="/login" style={{ color: 'var(--lb-green)', fontWeight: 600 }}>Sign in</Link>
        </span>
      </nav>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ width: '100%', maxWidth: '380px' }}>
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--lb-green)', marginBottom: '10px' }}>
              Join Cinemate
            </div>
            <h1 style={{ fontSize: '26px', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>Create your account</h1>
            <p style={{ fontSize: '13px', color: 'var(--lb-text)', marginTop: '8px' }}>Start your film journal today</p>
          </div>

          <div style={{ background: 'var(--lb-bg-2)', border: '1px solid var(--lb-border)', borderRadius: '6px', padding: '28px' }}>
            <form onSubmit={handleSubmit}>
              {[
                { key: 'username', label: 'Username', type: 'text', placeholder: 'dragos' },
                { key: 'email', label: 'Email', type: 'email', placeholder: 'you@example.com' },
              ].map(({ key, label, type, placeholder }) => (
                <div key={key} style={{ marginBottom: '16px' }}>
                  <label style={LABEL_STYLE}>{label}</label>
                  <input type={type} placeholder={placeholder} required {...field(key)} />
                </div>
              ))}

              <div style={{ marginBottom: '16px' }}>
                <label style={LABEL_STYLE}>Password</label>
                <input type="password" placeholder="Min. 8 characters" required {...field('password')} />
                <PasswordStrength password={form.password} />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={LABEL_STYLE}>Confirm password</label>
                <input type="password" placeholder="••••••••" required {...field('confirm')} />
                {form.confirm && form.password !== form.confirm && (
                  <div style={{ fontSize: '11px', color: 'var(--lb-danger)', marginTop: '5px' }}>Passwords don't match</div>
                )}
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
                {loading ? 'Creating account…' : 'Create account'}
              </button>
            </form>
          </div>

          <p style={{ fontSize: '12px', color: 'var(--lb-text-muted)', textAlign: 'center', marginTop: '20px' }}>
            Already registered?{' '}
            <Link to="/login" style={{ color: 'var(--lb-green)', fontWeight: 600 }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}