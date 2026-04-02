import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const NAV_LINKS = [
  { label: 'Playground', href: '/playground' },
  { label: 'PRs',        href: '/prs'        },
  { label: 'Repos',      href: '/repos'      },
  { label: 'History',    href: '/history'    },
  { label: 'Dashboard',  href: '/dashboard'  },
  { label: 'Leaderboard',href: '/leaderboard'},
];

export default function Navbar() {
  const [menuOpen, setMenuOpen]     = useState(false);
  const [scrolled, setScrolled]     = useState(false);
  const { isAuthenticated, user, logout } = useAuth();
  const location = useLocation();

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);
  useEffect(() => setMenuOpen(false), [location.pathname]);

  return (
    <>
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        background: scrolled ? 'rgba(12,12,12,0.97)' : 'var(--bg)',
        borderBottom: '1px solid var(--border)',
        transition: 'background 0.2s',
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 1.5rem', display: 'flex', alignItems: 'center', height: '52px', gap: '2rem' }}>

          {/* Logo */}
          <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
            <span style={{ width: '8px', height: '8px', background: 'var(--red)', display: 'inline-block' }} />
            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-1)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              CODEX
            </span>
          </Link>

          {/* Vertical divider */}
          <span style={{ width: '1px', height: '20px', background: 'var(--border)', flexShrink: 0 }} />

          {/* Desktop links */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0', flex: 1 }}>
            {NAV_LINKS.map(link => {
              const active = location.pathname === link.href;
              return (
                <Link
                  key={link.href}
                  to={link.href}
                  style={{
                    padding: '0.375rem 0.875rem',
                    fontSize: '0.6875rem',
                    fontWeight: active ? 600 : 400,
                    textTransform: 'uppercase',
                    letterSpacing: '0.12em',
                    color: active ? 'var(--text-1)' : 'var(--text-3)',
                    textDecoration: 'none',
                    borderBottom: active ? '1px solid var(--red)' : '1px solid transparent',
                    transition: 'color 0.15s, border-color 0.15s',
                    lineHeight: '52px',
                    marginBottom: '-1px',
                  }}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          {/* Auth */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
            {isAuthenticated ? (
              <>
                <span style={{ fontSize: '0.6875rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {user?.name?.split(' ')[0]}
                </span>
                <button
                  onClick={logout}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.6875rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'inherit' }}
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn-ghost" style={{ padding: '0.375rem 0.875rem', fontSize: '0.6875rem' }}>
                  Sign in
                </Link>
                <Link to="/register" className="btn-primary" style={{ padding: '0.375rem 0.875rem', fontSize: '0.6875rem' }}>
                  Get started
                </Link>
              </>
            )}
          </div>

          {/* Hamburger */}
          <button
            onClick={() => setMenuOpen(o => !o)}
            style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem', color: 'var(--text-2)' }}
            className="mobile-hamburger"
          >
            {menuOpen ? '✕' : '≡'}
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 40,
          background: 'var(--bg)',
          paddingTop: '52px',
          display: 'flex', flexDirection: 'column',
          borderTop: '1px solid var(--border)',
        }}>
          {NAV_LINKS.map(link => (
            <Link
              key={link.href}
              to={link.href}
              style={{
                padding: '1rem 1.5rem',
                borderBottom: '1px solid var(--border)',
                color: location.pathname === link.href ? 'var(--text-1)' : 'var(--text-2)',
                textDecoration: 'none',
                fontSize: '0.875rem',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
              }}
            >
              {link.label}
            </Link>
          ))}
          <div style={{ padding: '1.5rem', display: 'flex', gap: '0.75rem' }}>
            {isAuthenticated ? (
              <button onClick={logout} className="btn-ghost">Sign out</button>
            ) : (
              <>
                <Link to="/login" className="btn-ghost">Sign in</Link>
                <Link to="/register" className="btn-primary">Get started</Link>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
