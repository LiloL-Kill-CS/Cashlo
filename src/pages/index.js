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
      background: 'var(--color-bg-primary)',
      padding: 'var(--spacing-lg)'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px'
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 'var(--spacing-2xl)' }}>
          <div style={{
            fontSize: '64px',
            fontWeight: '800',
            letterSpacing: '-0.05em',
            marginBottom: 'var(--spacing-sm)'
          }}>
            Cashlo
          </div>
          <p className="text-secondary">Coffee Shop Point of Sale</p>
        </div>

        {/* Login/Register Card */}
        <div className="card">
          <div className="card-body" style={{ padding: 'var(--spacing-xl)' }}>
            {/* Mode Tabs */}
            <div style={{
              display: 'flex',
              gap: 'var(--spacing-sm)',
              marginBottom: 'var(--spacing-lg)',
              borderBottom: '1px solid var(--color-border)',
              paddingBottom: 'var(--spacing-md)'
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

        {/* Demo Info */}
        <div style={{
          marginTop: 'var(--spacing-xl)',
          padding: 'var(--spacing-md)',
          background: 'var(--color-bg-secondary)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)'
        }}>
          <p className="text-sm text-muted" style={{ marginBottom: 'var(--spacing-sm)' }}>
            Akun Demo:
          </p>
          <div style={{ display: 'flex', gap: 'var(--spacing-md)' }}>
            <div>
              <p className="text-sm"><strong>Admin:</strong> admin / admin123</p>
            </div>
            <div>
              <p className="text-sm"><strong>Kasir:</strong> kasir / kasir123</p>
            </div>
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

