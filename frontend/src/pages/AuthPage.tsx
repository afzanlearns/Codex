import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { User } from '../types';

interface AuthFormProps {
  mode: 'login' | 'register';
}

export default function AuthPage({ mode }: AuthFormProps) {
  const [name, setName]       = useState('');
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate  = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      let res;
      if (mode === 'register') {
        res = await api.auth.register({ name, email, password });
      } else {
        res = await api.auth.login({ email, password });
      }
      const { token, user } = res as { token: string; user: User };
      login(token, user);
      navigate('/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mesh-bg min-h-[100dvh] flex items-center justify-center px-4">
      <div
        className="w-full max-w-sm"
        style={{ opacity: 0, animation: 'fade-up 0.7s cubic-bezier(0.32,0.72,0,1) forwards' }}
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="text-2xl font-semibold tracking-tight">
            cod<span className="text-violet-400">ex</span>
          </Link>
          <p className="text-white/30 text-sm mt-2">
            {mode === 'login' ? 'Sign in to your account' : 'Create your account'}
          </p>
        </div>

        <div className="bezel-outer">
          <div className="bezel-inner p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <div>
                  <label className="block text-xs text-white/40 mb-1.5 uppercase tracking-wider">
                    Full name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-2.5
                               text-sm text-white placeholder:text-white/20 outline-none
                               focus:border-violet-500/50 transition-colors duration-300"
                    placeholder="Jane Smith"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs text-white/40 mb-1.5 uppercase tracking-wider">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-2.5
                             text-sm text-white placeholder:text-white/20 outline-none
                             focus:border-violet-500/50 transition-colors duration-300"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1.5 uppercase tracking-wider">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-2.5
                             text-sm text-white placeholder:text-white/20 outline-none
                             focus:border-violet-500/50 transition-colors duration-300"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20
                               rounded-xl px-4 py-3">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full justify-center mt-2 disabled:opacity-50"
              >
                {loading ? (
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  mode === 'login' ? 'Sign in' : 'Create account'
                )}
              </button>
            </form>

            <div className="mt-5 pt-5 border-t border-white/[0.06] text-center">
              <p className="text-xs text-white/30">
                {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                <Link
                  to={mode === 'login' ? '/register' : '/login'}
                  className="text-violet-400 hover:text-violet-300 transition-colors"
                >
                  {mode === 'login' ? 'Sign up' : 'Sign in'}
                </Link>
              </p>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-white/15 mt-6">
          Or{' '}
          <Link to="/playground" className="text-white/30 hover:text-white/50 transition-colors">
            try the playground without an account →
          </Link>
        </p>
      </div>
    </div>
  );
}
