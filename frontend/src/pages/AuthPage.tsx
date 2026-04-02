import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { User } from '../types';

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const { login }  = useAuth();
  const navigate   = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = mode === 'register'
        ? await api.auth.register({ name, email, password })
        : await api.auth.login({ email, password });
      const { token, user } = res as { token: string; user: User };
      login(token, user);
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.75rem 1rem',
    background: 'var(--bg-2)', border: '1px solid var(--border-2)',
    color: 'var(--text-1)', fontSize: '0.8125rem',
    outline: 'none', boxSizing: 'border-box',
    fontFamily: 'inherit', transition: 'border-color 0.15s',
  };

  return (
    <div style={{
      minHeight: '100dvh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1.5rem', paddingTop: 'calc(52px + 3rem)',
    }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>

        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <span style={{ width: '8px', height: '8px', background: 'var(--red)', display: 'inline-block' }} />
            <Link to="/" style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-1)', textTransform: 'uppercase', letterSpacing: '0.1em', textDecoration: 'none' }}>CODEX</Link>
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-1)', marginBottom: '0.375rem' }}>
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </h1>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>
            {mode === 'login' ? 'Welcome back.' : 'Start reviewing code instantly.'}
          </p>
        </div>

        {/* Form */}
        <div style={{ border: '1px solid var(--border)', background: 'var(--bg-1)', padding: '2rem' }}>
          <form onSubmit={handleSubmit}>
            {mode === 'register' && (
              <div style={{ marginBottom: '1rem' }}>
                <p className="label" style={{ marginBottom: '0.5rem' }}>Full name</p>
                <input
                  type="text" value={name} onChange={e => setName(e.target.value)}
                  required placeholder="Jane Smith" style={inputStyle}
                />
              </div>
            )}
            <div style={{ marginBottom: '1rem' }}>
              <p className="label" style={{ marginBottom: '0.5rem' }}>Email</p>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                required placeholder="you@example.com" style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <p className="label" style={{ marginBottom: '0.5rem' }}>Password</p>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                required minLength={8} placeholder="••••••••" style={inputStyle}
              />
            </div>

            {error && (
              <div style={{ padding: '0.75rem 1rem', background: 'var(--red-dim)', border: '1px solid var(--red-border)', color: '#f87171', fontSize: '0.8rem', marginBottom: '1rem' }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary" style={{ width: '100%', justifyContent: 'center', opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer', gap: '0.5rem' }}>
              {loading ? <><span className="loader" style={{ width: '12px', height: '12px' }} /> Please wait</> : (
                <>
                  {mode === 'login' ? 'Sign in' : 'Create account'}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </>
              )}
            </button>
          </form>

          {/* GitHub */}
          <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border)' }}>
            <a
              href="http://localhost:3001/api/auth/github"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
                width: '100%', padding: '0.75rem',
                background: 'var(--bg-3)', border: '1px solid var(--border-2)',
                color: 'var(--text-2)', fontSize: '0.75rem', textDecoration: 'none',
                textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'inherit',
                transition: 'border-color 0.15s, color 0.15s', boxSizing: 'border-box',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.745 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
              </svg>
              Continue with GitHub
            </a>
          </div>
        </div>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.75rem', color: 'var(--text-3)' }}>
          {mode === 'login' ? "No account? " : 'Already have one? '}
          <Link to={mode === 'login' ? '/register' : '/login'} style={{ color: 'var(--red)', textDecoration: 'none' }}>
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </Link>
        </p>
        <p style={{ textAlign: 'center', marginTop: '0.75rem', fontSize: '0.7rem', color: 'var(--text-3)' }}>
          Or{' '}
          <Link to="/playground" style={{ color: 'var(--text-2)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
            try playground without an account 
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </Link>
        </p>
      </div>
    </div>
  );
}
