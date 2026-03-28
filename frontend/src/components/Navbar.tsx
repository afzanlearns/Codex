import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const NAV_LINKS = [
  { label: 'Playground', href: '/playground' },
  { label: 'Dashboard',  href: '/dashboard' },
  { label: 'Leaderboard', href: '/leaderboard' },
];

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled]  = useState(false);
  const { isAuthenticated, user, logout } = useAuth();
  const location = useLocation();

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  return (
    <>
      {/* Floating pill nav */}
      <nav
        className="fixed top-6 left-1/2 z-40 -translate-x-1/2"
        style={{
          transition: 'all 0.5s cubic-bezier(0.32,0.72,0,1)',
        }}
      >
        <div
          className="glass-pill rounded-full flex items-center gap-1 px-2 py-2"
          style={{
            boxShadow: scrolled
              ? '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)'
              : 'inset 0 1px 0 rgba(255,255,255,0.08)',
          }}
        >
          {/* Logo */}
          <Link
            to="/"
            className="flex items-center gap-2 px-3 py-1.5 rounded-full
                       transition-all duration-300 hover:bg-white/[0.06]"
          >
            <span className="text-sm font-semibold tracking-tight text-white">
              cod<span className="text-violet-400">ex</span>
            </span>
          </Link>

          {/* Divider */}
          <span className="w-px h-4 bg-white/10 mx-1" />

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-0.5">
            {NAV_LINKS.map(link => (
              <Link
                key={link.href}
                to={link.href}
                className={`px-3.5 py-1.5 rounded-full text-sm transition-all duration-300
                  ${location.pathname === link.href
                    ? 'bg-white/[0.08] text-white'
                    : 'text-white/50 hover:text-white hover:bg-white/[0.05]'
                  }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Auth actions */}
          <div className="hidden md:flex items-center gap-1 ml-1">
            {isAuthenticated ? (
              <div className="flex items-center gap-2 pl-2">
                <span className="text-xs text-white/40">{user?.name?.split(' ')[0]}</span>
                <button
                  onClick={logout}
                  className="px-3 py-1.5 rounded-full text-xs text-white/40
                             hover:text-white/70 transition-colors duration-300"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <>
                <Link to="/login" className="btn-ghost !py-1.5 !px-3.5 !text-xs">
                  Sign in
                </Link>
                <Link to="/register" className="btn-primary !py-1.5 !px-3.5 !text-xs">
                  Get started
                  <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px]">
                    ↗
                  </span>
                </Link>
              </>
            )}
          </div>

          {/* Hamburger — mobile */}
          <button
            className="md:hidden relative w-8 h-8 ml-1 flex items-center justify-center"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Toggle menu"
          >
            <span
              className="absolute block w-4 h-px bg-white/70 transition-all duration-400"
              style={{
                transform: menuOpen ? 'rotate(45deg) translateY(0)' : 'translateY(-4px)',
                transition: 'transform 0.4s cubic-bezier(0.32,0.72,0,1)',
              }}
            />
            <span
              className="absolute block w-4 h-px bg-white/70"
              style={{
                opacity: menuOpen ? 0 : 1,
                transition: 'opacity 0.3s cubic-bezier(0.32,0.72,0,1)',
              }}
            />
            <span
              className="absolute block w-4 h-px bg-white/70 transition-all duration-400"
              style={{
                transform: menuOpen ? 'rotate(-45deg) translateY(0)' : 'translateY(4px)',
                transition: 'transform 0.4s cubic-bezier(0.32,0.72,0,1)',
              }}
            />
          </button>
        </div>
      </nav>

      {/* Mobile fullscreen overlay */}
      <div
        className="fixed inset-0 z-30 md:hidden backdrop-blur-2xl bg-black/85 flex flex-col
                   items-center justify-center gap-2"
        style={{
          opacity:          menuOpen ? 1 : 0,
          pointerEvents:    menuOpen ? 'all' : 'none',
          transition:       'opacity 0.4s cubic-bezier(0.32,0.72,0,1)',
        }}
      >
        {NAV_LINKS.map((link, i) => (
          <Link
            key={link.href}
            to={link.href}
            className="text-2xl font-medium text-white/80 hover:text-white py-3"
            style={{
              opacity:    menuOpen ? 1 : 0,
              transform:  menuOpen ? 'translateY(0)' : 'translateY(16px)',
              transition: `opacity 0.5s cubic-bezier(0.32,0.72,0,1) ${100 + i * 60}ms,
                           transform 0.5s cubic-bezier(0.32,0.72,0,1) ${100 + i * 60}ms`,
            }}
          >
            {link.label}
          </Link>
        ))}
        <div
          className="flex flex-col items-center gap-3 mt-6"
          style={{
            opacity:    menuOpen ? 1 : 0,
            transform:  menuOpen ? 'translateY(0)' : 'translateY(16px)',
            transition: 'opacity 0.5s cubic-bezier(0.32,0.72,0,1) 340ms, transform 0.5s cubic-bezier(0.32,0.72,0,1) 340ms',
          }}
        >
          {isAuthenticated ? (
            <button onClick={logout} className="btn-ghost">Sign out</button>
          ) : (
            <>
              <Link to="/login"    className="btn-ghost">Sign in</Link>
              <Link to="/register" className="btn-primary">Get started</Link>
            </>
          )}
        </div>
      </div>
    </>
  );
}
