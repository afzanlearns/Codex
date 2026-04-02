import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

interface PRItem {
  id: number;
  pr_number: number;
  title: string;
  state: string;
  developer_name: string;
  github_username: string;
  repo_name: string;
  additions: number;
  deletions: number;
  changed_files: number;
  github_url: string;
  created_at: string;
  merged_at?: string;
  review_id?: number;
  score_overall?: number;
  review_summary?: string;
  reviewed_at?: string;
  conclusion?: string;
  webhook_active: boolean;
}

function scoreColor(s: number): string {
  const s100 = s * 10;
  if (s100 >= 80) return '#4ade80';
  if (s100 >= 60) return '#fbbf24';
  if (s100 >= 40) return '#fb923c';
  return '#f87171';
}

function scoreGrade(s: number): string {
  const s100 = s * 10;
  if (s100 >= 85) return 'A';
  if (s100 >= 70) return 'B';
  if (s100 >= 50) return 'C';
  if (s100 >= 30) return 'D';
  return 'F';
}

export default function PRs() {
  const [prs, setPrs]           = useState<PRItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<'all' | 'open' | 'merged'>('all');
  const [search, setSearch]     = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api.prs.list({ state: filter === 'all' ? undefined : filter, limit: 100 })
      .then(data => setPrs(data as PRItem[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filter]);

  const filtered = prs.filter(pr =>
    pr.title.toLowerCase().includes(search.toLowerCase()) ||
    pr.repo_name.toLowerCase().includes(search.toLowerCase()) ||
    pr.developer_name.toLowerCase().includes(search.toLowerCase())
  );

  const openCount     = prs.filter(p => p.state === 'open').length;
  const reviewedCount = prs.filter(p => p.review_id).length;
  const avgScore      = prs.filter(p => p.score_overall).length > 0
    ? prs.filter(p => p.score_overall).reduce((a, p) => a + (p.score_overall || 0), 0) / prs.filter(p => p.score_overall).length
    : 0;

  const tabStyle = (key: string): React.CSSProperties => ({
    padding: '0.5rem 1rem', background: 'none', border: 'none', cursor: 'pointer',
    fontFamily: 'inherit', fontSize: '0.6875rem', textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: filter === key ? 'var(--text-1)' : 'var(--text-3)',
    borderBottom: filter === key ? '1px solid var(--red)' : '1px solid transparent',
    transition: 'color 0.15s, border-color 0.15s',
    marginBottom: '-1px',
  });

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', paddingTop: '52px' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2.5rem 1.5rem' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <p style={{ fontSize: '0.6rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: '0.375rem' }}>
              // Pull request reviews
            </p>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.02em' }}>
              Pull Requests
            </h1>
          </div>
          <Link to="/repos" style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.5rem 1rem', background: 'var(--bg-2)',
            border: '1px solid var(--border-2)', color: 'var(--text-2)',
            fontSize: '0.7rem', fontFamily: 'inherit', textDecoration: 'none',
            textTransform: 'uppercase', letterSpacing: '0.1em',
          }}>
            Install webhook on repo
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </Link>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', border: '1px solid var(--border)', marginBottom: '1.5rem' }}>
          {[
            { label: 'Total PRs',   value: prs.length            },
            { label: 'Open',        value: openCount, color: '#fbbf24' },
            { label: 'Reviewed',    value: reviewedCount, color: '#4ade80' },
            { label: 'Avg Score',   value: avgScore > 0 ? `${Math.round(avgScore * 10)}/100` : '—', color: avgScore > 0 ? scoreColor(avgScore) : undefined },
          ].map((stat, i) => (
            <div key={stat.label} style={{
              padding: '1.25rem', borderRight: i < 3 ? '1px solid var(--border)' : 'none',
            }}>
              <p style={{ fontSize: '1.75rem', fontWeight: 700, color: stat.color || 'var(--text-1)', margin: '0 0 0.25rem', letterSpacing: '-0.02em' }}>{stat.value}</p>
              <p style={{ fontSize: '0.6rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>{stat.label}</p>
            </div>
          ))}
        </div>

        {/* No webhook notice */}
        {prs.length === 0 && !loading && (
          <div style={{ padding: '2rem', background: 'rgba(196,30,30,0.06)', border: '1px solid rgba(196,30,30,0.2)', marginBottom: '1.5rem' }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-1)', margin: '0 0 0.5rem', fontWeight: 600 }}>
              No pull requests yet
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', margin: '0 0 1rem', lineHeight: '1.6' }}>
              To see PRs here automatically: go to Repos, find a connected repository,
              and click "Install webhook". Every new PR will then appear here and be
              reviewed automatically by Codex AI.
            </p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', margin: 0, fontFamily: 'inherit' }}>
              Note: You need a public URL for webhooks. Use ngrok locally:
              <code style={{ display: 'block', marginTop: '0.375rem', padding: '0.5rem', background: 'var(--bg-3)', border: '1px solid var(--border)' }}>
                npx ngrok http 3001
              </code>
            </p>
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex' }}>
            {(['all', 'open', 'merged'] as const).map(key => (
              <button key={key} onClick={() => setFilter(key)} style={tabStyle(key)}>
                {key === 'all' ? `All (${prs.length})` : key === 'open' ? `Open (${openCount})` : `Merged (${prs.filter(p => p.state === 'merged').length})`}
              </button>
            ))}
          </div>
          <input
            type="text" placeholder="Search PRs..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ marginLeft: 'auto', marginBottom: '0.5rem', padding: '0.375rem 0.75rem', background: 'var(--bg-2)', border: '1px solid var(--border-2)', color: 'var(--text-1)', fontSize: '0.75rem', fontFamily: 'inherit', outline: 'none', width: '220px' }}
          />
        </div>

        {/* PR table */}
        <div style={{ border: '1px solid var(--border)', borderTop: 'none' }}>

          {/* Table header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '3rem 1fr 150px 80px 100px 120px',
            padding: '0.625rem 1.25rem', borderBottom: '1px solid var(--border)',
            background: 'var(--bg-1)',
            fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-3)',
          }}>
            <span>Score</span>
            <span>Pull Request</span>
            <span>Repository</span>
            <span>Changes</span>
            <span>Status</span>
            <span style={{ textAlign: 'right' }}>Date</span>
          </div>

          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
              <span className="loader" />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>Loading pull requests...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center' }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-3)', margin: 0 }}>No pull requests match your filter</p>
            </div>
          ) : (
            filtered.map((pr, i) => {
              const hasReview = !!pr.review_id;
              const score     = pr.score_overall;
              const grade     = score ? scoreGrade(score) : null;
              const color     = score ? scoreColor(score) : 'var(--text-3)';
              const isPending = pr.state === 'open' && !hasReview;

              return (
                <div
                  key={pr.id}
                  onClick={() => navigate(`/prs/${pr.id}`)}
                  style={{
                    display: 'grid', gridTemplateColumns: '3rem 1fr 150px 80px 100px 120px',
                    padding: '1rem 1.25rem', cursor: 'pointer', alignItems: 'center',
                    borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                    background: 'transparent', transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-1)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Score */}
                  <div>
                    {hasReview && score ? (
                      <div style={{
                        width: '2rem', height: '2rem',
                        border: `1px solid ${color}40`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: `${color}10`,
                      }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color }}>{grade}</span>
                      </div>
                    ) : isPending ? (
                      <div style={{ width: '2rem', height: '2rem', border: '1px solid rgba(251,191,36,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(251,191,36,0.05)' }}>
                        <span style={{ fontSize: '0.5rem', color: '#fbbf24', textTransform: 'uppercase' }}>pend</span>
                      </div>
                    ) : (
                      <div style={{ width: '2rem', height: '2rem', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '0.5rem', color: 'var(--text-3)', textTransform: 'uppercase' }}>—</span>
                      </div>
                    )}
                  </div>

                  {/* PR info */}
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-1)', margin: '0 0 0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pr.title}
                    </p>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-3)', margin: 0 }}>
                      #{pr.pr_number} · {pr.developer_name || pr.github_username}
                    </p>
                  </div>

                  {/* Repo */}
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-2)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {pr.repo_name?.split('/')[1] || pr.repo_name}
                  </p>

                  {/* Changes */}
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-3)', margin: 0, fontFamily: 'inherit' }}>
                    <span style={{ color: '#4ade80' }}>+{pr.additions}</span>
                    {' '}
                    <span style={{ color: '#f87171' }}>-{pr.deletions}</span>
                  </p>

                  {/* Status */}
                  <div>
                    {pr.state === 'merged' ? (
                      <span style={{ fontSize: '0.6rem', padding: '0.15rem 0.5rem', background: 'var(--red-dim)', border: '1px solid var(--red-border)', color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Merged</span>
                    ) : hasReview ? (
                      <span style={{ fontSize: '0.6rem', padding: '0.15rem 0.5rem', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Reviewed</span>
                    ) : (
                      <span style={{ fontSize: '0.6rem', padding: '0.15rem 0.5rem', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)', color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Pending</span>
                    )}
                  </div>

                  {/* Date */}
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-3)', margin: 0, textAlign: 'right' }}>
                    {new Date(pr.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
