import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import { User } from '../types';

export default function GitHubCallback() {
  const navigate  = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token  = params.get('token');
    const error  = params.get('error');

    if (error || !token) {
      navigate('/login');
      return;
    }

    localStorage.setItem('codex_token', token);
    api.auth.me()
      .then(user => {
        login(token, user as User);
        navigate('/dashboard');
      })
      .catch(() => navigate('/login'));
  }, [navigate, login]);

  return (
    <div style={{ minHeight: '100vh', background: '#050505', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ width: '2rem', height: '2rem', borderRadius: '50%', border: '2px solid var(--red-dim)', borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite' }} />
      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.875rem' }}>Signing you in with GitHub…</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
