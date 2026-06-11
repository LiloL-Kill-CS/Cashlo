import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

function LoginForm() {
  const { login, register, user } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' or 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('admin');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // If already logged in, redirect
  if (user) {
    if (typeof window !== 'undefined') {
      window.location.href = '/pos';
    }
    return <div className="flex items-center justify-center min-h-screen">Mengalihkan...</div>;
  }

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(username, password);
      window.location.href = '/pos';
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await register(username, password, name, role);
      setSuccess('Akun berhasil dibuat! Silakan login.');
      setMode('login');
      setPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(1200px 600px at 50% -10%, #1A1A1A 0%, var(--color-bg-primary) 60%)',
      padding: 'var(--spacing-lg)'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px'
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 'var(--spacing-2xl)' }}>
          <div style={{
            width: '64px',
            height: '64px',
            margin: '0 auto var(--spacing-md)',
            borderRadius: 'var(--radius-lg)',
            background: 'linear-gradient(145deg, #1F1F1F, #0A0A0A)',
            border: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '34px',
            fontWeight: '800',
            letterSpacing: '-0.05em',
            color: 'var(--color-accent)',
            boxShadow: '0 0 40px rgba(201, 138, 75, 0.18)'
          }}>
            C
          </div>
          <div style={{
            fontSize: '44px',
            fontWeight: '800',
            letterSpacing: '-0.05em',
            lineHeight: 1.1
          }}>
            Cashlo
          </div>
          <p className="text-secondary" style={{ marginTop: 'var(--spacing-xs)' }}>Coffee Shop Point of Sale</p>
        </div>

        {/* Login/Register Card */}
        <div className="card" style={{ boxShadow: 'var(--shadow-xl)' }}>
          <div className="card-body" style={{ padding: 'var(--spacing-xl)' }}>
            {/* Mode Tabs — segmented control */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 'var(--spacing-xs)',
              marginBottom: 'var(--spacing-lg)',
              padding: 'var(--spacing-xs)',
              background: 'var(--color-bg-tertiary)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)'
            }}>
              <button
                type="button"
                className={`btn ${mode === 'login' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
              >
                Masuk
              </button>
              <button
                type="button"
                className={`btn ${mode === 'register' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => { setMode('register'); setError(''); setSuccess(''); }}
              >
                Daftar Baru
              </button>
            </div>

            {error && (
              <div style={{
                padding: 'var(--spacing-md)',
                background: 'var(--color-error-bg)',
                color: 'var(--color-error)',
                borderRadius: 'var(--radius-md)',
                marginBottom: 'var(--spacing-md)',
                fontSize: 'var(--font-size-sm)'
              }}>
                {error}
              </div>
            )}

            {success && (
              <div style={{
                padding: 'var(--spacing-md)',
                background: 'rgba(34, 197, 94, 0.1)',
                color: '#22c55e',
                borderRadius: 'var(--radius-md)',
                marginBottom: 'var(--spacing-md)',
                fontSize: 'var(--font-size-sm)'
              }}>
                {success}
              </div>
            )}

            {mode === 'login' ? (
              <form onSubmit={handleLogin}>
                <div style={{ marginBottom: 'var(--spacing-md)' }}>
                  <label htmlFor="username" className="text-secondary text-sm" style={{ display: 'block', marginBottom: 'var(--spacing-xs)' }}>
                    Username
                  </label>
                  <input
                    type="text"
                    id="username"
                    className="input"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="Masukkan username"
                    required
                    autoFocus
                  />
                </div>

                <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                  <label htmlFor="password" className="text-secondary text-sm" style={{ display: 'block', marginBottom: 'var(--spacing-xs)' }}>
                    Password
                  </label>
                  <input
                    type="password"
                    id="password"
                    className="input"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Masukkan password"
                    required
                  />
                </div>

                <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>
                  {loading ? 'Memproses...' : 'Masuk'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister}>
                <div style={{ marginBottom: 'var(--spacing-md)' }}>
                  <label className="text-secondary text-sm" style={{ display: 'block', marginBottom: 'var(--spacing-xs)' }}>
                    Nama Lengkap / Nama Toko
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Contoh: Warung Kopi Pak Budi"
                    required
                  />
                </div>

                <div style={{ marginBottom: 'var(--spacing-md)' }}>
                  <label className="text-secondary text-sm" style={{ display: 'block', marginBottom: 'var(--spacing-xs)' }}>
                    Username
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="Username untuk login"
                    required
                  />
                </div>

                <div style={{ marginBottom: 'var(--spacing-md)' }}>
                  <label className="text-secondary text-sm" style={{ display: 'block', marginBottom: 'var(--spacing-xs)' }}>
                    Password
                  </label>
                  <input
                    type="password"
                    className="input"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    required
                    minLength={6}
                  />
                </div>

                <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                  <label className="text-secondary text-sm" style={{ display: 'block', marginBottom: 'var(--spacing-xs)' }}>
                    Role
                  </label>
                  <select className="input" value={role} onChange={e => setRole(e.target.value)}>
                    <option value="admin">Admin (Full Access)</option>
                    <option value="kasir">Kasir (POS Only)</option>
                  </select>
                </div>

                <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>
                  {loading ? 'Membuat Akun...' : 'Daftar Sekarang'}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          textAlign: 'center',
          marginTop: 'var(--spacing-xl)',
          color: 'var(--color-text-muted)',
          fontSize: 'var(--font-size-xs)'
        }}>
          © 2024 Cashlo. Premium Coffee Shop POS
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return <LoginForm />;
}

