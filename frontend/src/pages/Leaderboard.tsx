import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { LeaderboardEntry } from '../types';

const BADGE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  newcomer:         { label: 'Newcomer',   color: '#9ca3af', bg: 'rgba(156,163,175,0.1)' },
  consistent:       { label: 'Consistent', color: '#10b981', bg: 'rgba(16,185,129,0.1)'  },
  improving:        { label: 'Improving',  color: 'var(--red)', bg: 'var(--red-dim)'  },
  declining:        { label: 'Declining',  color: '#f97316', bg: 'rgba(249,115,22,0.1)'  },
  pattern_offender: { label: 'Watch',      color: '#ef4444', bg: 'rgba(239,68,68,0.1)'   },
};

const MedalIcon = ({ rank }: { rank: number }) => {
  const colors = {
    1: '#fbbf24', // Gold
    2: '#9ca3af', // Silver
    3: '#cd7f32', // Bronze
  };
  const color = colors[rank as keyof typeof colors] || 'transparent';
  if (rank > 3) return <span style={{ color: 'var(--text-3)', fontSize: '0.75rem', fontFamily: 'var(--mono)' }}>{rank}</span>;
  
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 4px ${color}40)` }}>
      <circle cx="12" cy="8" r="6" />
      <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
    </svg>
  );
};

function scoreColor(s: number) {
  if (s >= 8.5) return 'var(--red)';
  if (s >= 7)   return '#10b981';
  if (s >= 5)   return '#f59e0b';
  return '#ef4444';
}

export default function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    api.teams.leaderboard(1)
      .then(data => setEntries(data as LeaderboardEntry[]))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingTop: '7rem', paddingBottom: '4rem' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 2rem' }}>

        {/* Header */}
        <div style={{ marginBottom: '2.5rem' }}>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.5rem' }}>Rankings</p>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 600, color: '#fff', margin: '0 0 0.5rem', letterSpacing: '-0.02em' }}>Team Leaderboard</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', margin: 0 }}>
            Powered by MySQL RANK() window functions — updates after every review.
          </p>
        </div>

        {error && (
          <div style={{ padding: '1rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 0, color: '#f87171', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        {/* Table card */}
        <div style={{ background: 'var(--bg-1)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 0, overflow: 'hidden' }}>

          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '48px 1fr 80px 80px 90px 70px',
            gap: '1rem',
            padding: '0.75rem 1.5rem',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            fontSize: '0.65rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--text-3)',
          }}>
            <span>#</span>
            <span>Developer</span>
            <span style={{ textAlign: 'right' }}>Reviews</span>
            <span style={{ textAlign: 'right' }}>Δ Week</span>
            <span style={{ textAlign: 'right' }}>Badge</span>
            <span style={{ textAlign: 'right' }}>Score</span>
          </div>

          {loading ? (
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[...Array(5)].map((_, i) => (
                <div key={i} style={{ height: '3rem', borderRadius: 0, background: 'var(--bg-1)' }} />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-3)', fontSize: '0.875rem' }}>
              No developers yet. Submit reviews to appear here.
            </div>
          ) : (
            entries.map(dev => {
              const delta = dev.weekly_delta ?? 0;
              const badge = BADGE_CONFIG[dev.badge] ?? BADGE_CONFIG.newcomer;
              return (
                <div
                  key={dev.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '48px 1fr 80px 80px 90px 70px',
                    gap: '1rem',
                    padding: '0.875rem 1.5rem',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ display: 'flex', justifyContent: 'center' }}>
                    <MedalIcon rank={dev.team_rank} />
                  </span>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                    <div style={{
                      width: '2rem', height: '2rem', borderRadius: '50%',
                      background: 'var(--bg-2)', border: '1px solid rgba(255,255,255,0.08)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.75rem', fontWeight: 500, flexShrink: 0, color: '#fff',
                    }}>
                      {(dev?.name || 'D').charAt(0).toUpperCase()}
                    </div>
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {dev?.name ?? 'Developer'}
                    </span>
                  </div>

                  <span style={{ fontSize: '0.75rem', color: 'var(--text-2)', "fontFamily": "'Geist Mono', monospace", textAlign: 'right' }}>
                    {dev.total_reviews}
                  </span>

                  <span style={{ fontSize: '0.75rem', "fontFamily": "'Geist Mono', monospace", textAlign: 'right', color: Number(delta) >= 0 ? '#10b981' : '#ef4444' }}>
                    {Number(delta) >= 0 ? '+' : ''}{Number(delta).toFixed(1)}
                  </span>

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: '0.65rem', padding: '0.2rem 0.6rem', borderRadius: 0, fontWeight: 500, color: badge?.color || '#fff', background: badge?.bg || 'transparent' }}>
                      {badge?.label || 'Newcomer'}
                    </span>
                  </div>

                  <span style={{ fontSize: '0.9rem', fontWeight: 600, "fontFamily": "'Geist Mono', monospace", textAlign: 'right', color: scoreColor(Number(dev.current_score)) }}>
                    {Number(dev.current_score).toFixed(1)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
