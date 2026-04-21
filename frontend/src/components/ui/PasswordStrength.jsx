const levels = [
  { label: 'Too short', color: '#E24B4A' },
  { label: 'Weak', color: '#E24B4A' },
  { label: 'Fair', color: '#EF9F27' },
  { label: 'Good', color: '#EF9F27' },
  { label: 'Strong', color: '#639922' },
];

function getStrength(password) {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(score, 4);
}

export default function PasswordStrength({ password }) {
  if (!password) return null;
  const score = getStrength(password);
  const { label, color } = levels[score];
  return (
    <div style={{ marginTop: '6px' }}>
      <div style={{ display: 'flex', gap: '3px', marginBottom: '4px' }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{
            flex: 1, height: '3px', borderRadius: '2px',
            background: i <= score ? color : 'var(--color-border-tertiary)',
            transition: 'background 0.2s',
          }} />
        ))}
      </div>
      <div style={{ fontSize: '11px', color }}>{label}</div>
    </div>
  );
}