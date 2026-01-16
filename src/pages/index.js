import { useState } from 'react';
import { useAuth, AuthProvider } from '@/hooks/useAuth';

function LoginForm() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
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

        {/* Login Card */}
        <div className="card">
          <div className="card-body" style={{ padding: 'var(--spacing-xl)' }}>
            <h2 style={{
              marginBottom: 'var(--spacing-lg)',
              textAlign: 'center'
            }}>
              Masuk
            </h2>

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

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 'var(--spacing-md)' }}>
                <label
                  htmlFor="username"
                  className="text-secondary text-sm"
                  style={{ display: 'block', marginBottom: 'var(--spacing-xs)' }}
                >
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
                <label
                  htmlFor="password"
                  className="text-secondary text-sm"
                  style={{ display: 'block', marginBottom: 'var(--spacing-xs)' }}
                >
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

              <button
                type="submit"
                className="btn btn-primary btn-lg w-full"
                disabled={loading}
              >
                {loading ? 'Memproses...' : 'Masuk'}
              </button>
            </form>
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
