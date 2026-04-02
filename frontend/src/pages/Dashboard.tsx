import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Area, AreaChart,
} from 'recharts';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import { DeveloperAnalytics, LeaderboardEntry } from '../types';

const BADGE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  newcomer:         { label: 'Newcomer',   color: '#9ca3af', bg: 'rgba(156,163,175,0.08)', border: 'rgba(156,163,175,0.2)' },
  consistent:       { label: 'Consistent', color: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.2)'  },
  improving:        { label: 'Improving',  color: 'var(--red)', bg: 'var(--red-dim)',  border: 'var(--red-dim)'  },
  declining:        { label: 'Declining',  color: '#f97316', bg: 'rgba(249,115,22,0.08)',  border: 'rgba(249,115,22,0.2)'  },
  pattern_offender: { label: 'Watch List', color: '#ef4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.2)'   },
};

function scoreColor(s: number): string {
  if (s >= 8.5) return 'var(--red)';
  if (s >= 7)   return '#10b981';
  if (s >= 5)   return '#fbbf24';
  if (s >= 3)   return '#f97316';
  return '#ef4444';
}

function scoreGrade(s: number): string {
  if (s >= 8.5) return 'A';
  if (s >= 7)   return 'B';
  if (s >= 5)   return 'C';
  if (s >= 3)   return 'D';
  return 'F';
}

const SCORE_DIMENSIONS = [
  { key: 'correctness',     label: 'Core Correctness',    description: 'Factual accuracy and logical soundness', color: '#10b981' },
  { key: 'security',        label: 'Security Posture',    description: 'Protection against common vulnerabilities', color: 'var(--red)' },
  { key: 'readability',     label: 'Code Readability',    description: 'Clarity, naming, and documentation', color: '#fbbf24' },
  { key: 'performance',     label: 'Runtime Efficiency',  description: 'Execution speed and resource usage', color: '#38bdf8' },
  { key: 'maintainability', label: 'Maintainability',     description: 'Architectural health and modularity', color: '#f472b6' },
];

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string; color: string }>;
  label?: string;
}

function ChartTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg)', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 0, padding: '0.625rem 0.875rem', fontSize: '12px',
    }}>
      <p style={{ color: 'var(--text-2)', margin: '0 0 0.375rem', fontSize: '11px' }}>{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color, margin: '0.15rem 0', "fontFamily": "'Geist Mono', monospace" }}>
          {p.dataKey === 'score' ? 'Score' : '4-wk avg'}: {p.value?.toFixed(1)}
        </p>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [analytics, setAnalytics]     = useState<DeveloperAnalytics | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading]         = useState(true);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput]     = useState('');
  const [goalDate, setGoalDate]       = useState('');

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.developers.analytics(user.id).catch(() => null),
      api.teams.leaderboard(1).catch(() => []),
    ])
      .then(([a, l]) => {
        if (a) setAnalytics(a as DeveloperAnalytics);
        setLeaderboard(l as LeaderboardEntry[]);
      })
      .finally(() => setLoading(false));
  }, [user]);

  const badge     = BADGE_CONFIG[user?.badge || 'newcomer'];
  const score     = user?.current_score ?? 0;
  const grade     = scoreGrade(score);
  const color     = scoreColor(score);
  const circumference = 2 * Math.PI * 48;
  const offset    = circumference - (score / 10) * circumference;

  const chartData = (analytics?.trend ?? []).map(t => ({
    week:    new Date(t.week_start).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
    score:   +t.avg_score,
    rolling: +t.rolling_4w_avg,
  }));

  const latestTrend   = analytics?.trend ? analytics.trend[analytics.trend.length - 1] : undefined;
  const weeklyReviews = latestTrend?.reviews_count  ?? 0;
  const weeklyBugs    = latestTrend?.bug_count       ?? 0;
  const scoreDelta    = latestTrend?.score_delta     ?? 0;
  const teamRank      = latestTrend?.rank_in_team;
  const streakDays    = (user as any)?.streak_days   ?? 0;
  const scoreGoal     = (user as any)?.score_goal    ?? 0;
  const goalDeadline  = (user as any)?.score_goal_deadline;
  const goalProgress  = scoreGoal > 0 ? Math.min((score / scoreGoal) * 100, 100) : 0;

  async function saveGoal() {
    const g = parseFloat(goalInput);
    if (!g || !goalDate) return;
    await api.users.updateGoal(g, goalDate).catch(console.error);
    setEditingGoal(false);
    window.location.reload();
  }

  // Divider
  const Divider = () => (
    <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', margin: '0' }} />
  );

  // Section label
  const Label = ({ children }: { children: React.ReactNode }) => (
    <p style={{ fontSize: '0.6rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.14em', margin: '0 0 0.875rem', fontWeight: 600 }}>
      {children}
    </p>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingTop: '6.5rem', paddingBottom: '4rem' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 1.5rem' }}>

        {/* ── Page header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <p style={{ fontSize: '0.6rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.14em', margin: '0 0 0.4rem' }}>Dashboard</p>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: '#fff', margin: 0, letterSpacing: '-0.025em' }}>
              {user?.name?.split(' ')[0] ?? 'Developer'}
            </h1>
          </div>
          <Link to="/playground" style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.6rem 1.25rem', background: 'var(--red)', borderRadius: 0,
            color: '#fff', fontSize: '0.8125rem', fontWeight: 500, textDecoration: 'none',
            transition: 'background 0.2s',
          }}>
            New review
            <span style={{ width: '1.5rem', height: '1.5rem', borderRadius: '50%', background: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
            </span>
          </Link>
        </div>

        {/* ── Row 1: Score hero + breakdown + quick stats ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 200px', gap: '1rem', marginBottom: '1rem' }}>

          {/* Score ring card */}
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 0, padding: '1.75rem 1.5rem',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem',
          }}>
            {/* SVG ring */}
            <div style={{ position: 'relative', width: '120px', height: '120px' }}>
              <svg width="120" height="120" style={{ transform: 'rotate(-90deg)' }}>
                {/* Track */}
                <circle cx="60" cy="60" r="48" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="7" />
                {/* Progress */}
                <circle
                  cx="60" cy="60" r="48" fill="none"
                  stroke={color} strokeWidth="7" strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  style={{ transition: 'stroke-dashoffset 1.4s cubic-bezier(0.32,0.72,0,1)', filter: `drop-shadow(0 0 8px ${color}50)` }}
                />
              </svg>
              {/* Center text */}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0' }}>
                <span style={{ fontSize: '1.875rem', fontWeight: 700, color, lineHeight: 1, "fontFamily": "'Geist Mono', monospace" }}>
                  {score.toFixed(1)}
                </span>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '2px' }}>
                  / 10
                </span>
              </div>
            </div>

            {/* Grade + badge */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                <span style={{
                  width: '2rem', height: '2rem', borderRadius: 0,
                  background: `${color}15`, border: `1px solid ${color}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.875rem', fontWeight: 700, color,
                }}>
                  {grade}
                </span>
                <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-2)' }}>
                  {badge.label}
                </span>
              </div>

              <Divider />

              <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                <span style={{ color: 'var(--text-2)' }}>{user?.total_reviews ?? 0} reviews</span>
                {streakDays > 0 && (
                  <span style={{ color: '#fbbf24', fontWeight: 500 }}>{streakDays}d streak</span>
                )}
              </div>
            </div>
          </div>

          {/* Score breakdown — Redesigned High-End List */}
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 0, padding: '1.75rem 2rem',
          }}>
            <Label>Dimension Analysis</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {SCORE_DIMENSIONS.map(dim => {
                const rawVal = analytics?.score_breakdown?.[dim.key as keyof typeof analytics.score_breakdown] ?? score;
                const dimScore = +rawVal;
                
                return (
                  <div key={dim.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                    <div style={{ 
                      width: '3px', height: '34px', background: dim.color, 
                      boxShadow: `0 0 10px ${dim.color}30`, flexShrink: 0 
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.25rem' }}>
                        <div>
                          <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 600, color: '#fff', letterSpacing: '0.01em' }}>
                            {dim.label}
                          </p>
                          <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--text-3)' }}>
                            {dim.description}
                          </p>
                        </div>
                        <span style={{ 
                          fontSize: '0.875rem', "fontFamily": "'Geist Mono', monospace", 
                          color: dim.color, fontWeight: 700 
                        }}>
                          {dimScore.toFixed(1)}
                        </span>
                      </div>
                      <div style={{ height: '1px', background: 'rgba(255,255,255,0.03)', marginTop: '0.5rem' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick stats — right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[
              {
                label: 'Team rank',
                value: teamRank ? `#${teamRank}` : '—',
                sub: 'in your team',
                color: teamRank === 1 ? '#fbbf24' : undefined,
              },
              {
                label: 'This week',
                value: weeklyReviews,
                sub: 'reviews',
                color: weeklyReviews > 0 ? '#10b981' : undefined,
              },
              {
                label: 'Score trend',
                value: scoreDelta === 0 ? '—' : `${scoreDelta > 0 ? '+' : ''}${scoreDelta.toFixed(1)}`,
                sub: 'vs last week',
                color: scoreDelta > 0 ? '#10b981' : scoreDelta < 0 ? '#ef4444' : undefined,
              },
              {
                label: 'Bugs found',
                value: weeklyBugs,
                sub: 'this week',
                color: weeklyBugs > 3 ? '#f87171' : undefined,
              },
            ].map(stat => (
              <div key={stat.label} style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 0, padding: '0.875rem 1rem',
                flex: 1,
              }}>
                <p style={{ fontSize: '0.6rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 0.25rem' }}>{stat.label}</p>
                <p style={{ fontSize: '1.375rem', fontWeight: 700, color: stat.color ?? '#fff', margin: '0 0 0.125rem', "fontFamily": "'Geist Mono', monospace", lineHeight: 1 }}>{loading ? '—' : stat.value}</p>
                <p style={{ fontSize: '0.65rem', color: 'var(--text-3)', margin: 0 }}>{stat.sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Row 2: Chart + Top issues ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1rem', marginBottom: '1rem' }}>

          {/* Trend chart */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 0, padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <Label>8-week score trend</Label>
                {chartData.length > 0 && (
                  <p style={{ fontSize: '1.5rem', fontWeight: 700, color: scoreColor(chartData[chartData.length - 1]?.score ?? 0), margin: 0, "fontFamily": "'Geist Mono', monospace", lineHeight: 1 }}>
                    {chartData[chartData.length - 1]?.score.toFixed(1)}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.7rem', color: 'var(--text-2)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <span style={{ width: '16px', height: '2px', background: 'var(--red)', display: 'inline-block', borderRadius: 0 }} />
                  Weekly
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <span style={{ width: '16px', height: '1px', background: '#10b981', display: 'inline-block', borderRadius: 0, opacity: 0.6 }} />
                  4-wk avg
                </span>
              </div>
            </div>

            {chartData.length === 0 ? (
              <div style={{ height: '160px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.875rem' }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-3)', margin: 0 }}>No historical trend data detected</p>
                <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.15)', margin: 0, textAlign: 'center', maxWidth: '400px', lineHeight: 1.6 }}>
                  Insights are generated from your <span style={{ color: 'var(--text-2)' }}>non-playground</span> repository reviews. 
                  Snapshots are captured weekly on Sundays.
                </p>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <Link to="/repos" style={{ fontSize: '0.7rem', color: 'var(--red)', textDecoration: 'none', border: '1px solid var(--red-dim)', padding: '0.4rem 0.75rem' }}>
                    Start a repo review
                  </Link>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                  <defs>
                    <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor='var(--red)' stopOpacity={0.15} />
                      <stop offset="95%" stopColor='var(--red)' stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke='var(--bg-2)' vertical={false} />
                  <XAxis dataKey="week" tick={{ fill: 'var(--text-3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 10]} tick={{ fill: 'var(--text-3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--bg-2)', strokeWidth: 1 }} />
                  <Area type="monotone" dataKey="score" stroke='var(--red)' strokeWidth={2} fill="url(#scoreGrad)" dot={{ fill: 'var(--red)', r: 3, strokeWidth: 0 }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="rolling" stroke="#10b981" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Top issues */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 0, padding: '1.5rem' }}>
            <Label>Top issues (90 days)</Label>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                {[...Array(5)].map((_, i) => (
                  <div key={i} style={{ height: '2rem', borderRadius: 0, background: 'var(--bg-1)' }} />
                ))}
              </div>
            ) : analytics?.top_issues?.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                {analytics.top_issues.map((issue, i) => (
                  <div key={issue.slug} style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.625rem 0',
                    borderBottom: i < analytics.top_issues.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  }}>
                    <span style={{ fontSize: '0.7rem', "fontFamily": "'Geist Mono', monospace", color: 'var(--text-3)', width: '1rem', textAlign: 'right' }}>{i + 1}</span>
                    <span style={{ flex: 1, fontSize: '0.8125rem', color: 'rgba(255,255,255,0.55)' }}>{issue.label}</span>
                    <span style={{
                      fontSize: '0.65rem', "fontFamily": "'Geist Mono', monospace",
                      padding: '0.15rem 0.5rem', borderRadius: 0,
                      background: i === 0 ? 'rgba(248,113,113,0.1)' : 'var(--bg-2)',
                      color: i === 0 ? '#f87171' : 'var(--text-2)',
                    }}>
                      {issue.count}×
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '140px', gap: '0.375rem' }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-3)', margin: 0 }}>No issues yet</p>
                <Link to="/playground" style={{ fontSize: '0.75rem', color: 'var(--red)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  Submit a review
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* ── Row 3: Goal + Leaderboard ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1rem', marginBottom: '1rem' }}>

          {/* Score goal card */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 0, padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <Label>Score goal</Label>
              <button
                onClick={() => setEditingGoal(e => !e)}
                style={{ fontSize: '0.7rem', color: 'var(--text-2)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                {editingGoal ? 'Cancel' : scoreGoal ? 'Edit' : 'Set goal'}
              </button>
            </div>

            {editingGoal ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                <input
                  type="number" placeholder="Target (e.g. 8.0)" min="1" max="10" step="0.5"
                  value={goalInput} onChange={e => setGoalInput(e.target.value)}
                  style={{ padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 0, color: '#fff', fontSize: '0.8rem', outline: 'none', width: '100%', boxSizing: 'border-box' }}
                />
                <input
                  type="date" value={goalDate} onChange={e => setGoalDate(e.target.value)}
                  style={{ padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 0, color: '#fff', fontSize: '0.8rem', outline: 'none', width: '100%', boxSizing: 'border-box' }}
                />
                <button onClick={saveGoal} style={{ padding: '0.5rem', background: 'var(--red)', border: 'none', borderRadius: 0, color: '#fff', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 500 }}>
                  Save goal
                </button>
              </div>
            ) : scoreGoal ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '2rem', fontWeight: 700, color: '#fff', "fontFamily": "'Geist Mono', monospace", lineHeight: 1 }}>{score.toFixed(1)}</span>
                  <span style={{ fontSize: '1rem', color: 'var(--text-2)', "fontFamily": "'Geist Mono', monospace" }}>/ {scoreGoal}</span>
                </div>
                <div style={{ height: '6px', borderRadius: 0, background: 'var(--bg-2)', marginBottom: '0.75rem', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 0,
                    width: `${goalProgress}%`, background: goalProgress >= 100 ? '#10b981' : 'var(--red)',
                    transition: 'width 1.2s cubic-bezier(0.32,0.72,0,1)',
                    boxShadow: `0 0 8px ${goalProgress >= 100 ? '#10b98150' : 'var(--accent-dim)'}`,
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem' }}>
                  <span style={{ color: goalProgress >= 100 ? '#10b981' : 'rgba(255,255,255,0.35)' }}>
                    {goalProgress >= 100 ? 'Goal reached' : `${(scoreGoal - score).toFixed(1)} to go`}
                  </span>
                  {goalDeadline && (
                    <span style={{ color: 'var(--text-3)' }}>
                      by {new Date(goalDeadline).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100px', gap: '0.375rem' }}>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-3)', margin: 0 }}>No goal set</p>
                <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.12)', margin: 0, textAlign: 'center', lineHeight: 1.5 }}>
                  Set a target score to track your progress over time
                </p>
              </div>
            )}
          </div>

          {/* Leaderboard preview */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 0, padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <Label>Team leaderboard</Label>
              <Link to="/leaderboard" style={{ fontSize: '0.72rem', color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                View all
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </Link>
            </div>

            {leaderboard.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '120px', gap: '0.375rem' }}>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-3)', margin: 0 }}>No team members yet</p>
                <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.12)', margin: 0 }}>Register more users to populate the leaderboard</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {leaderboard.slice(0, 5).map((dev) => {
                  const isMe   = dev.id === user?.id;
                  const delta  = dev.weekly_delta ?? 0;
                  const medals = ['', '#fbbf24', '#9ca3af', '#cd7f32'];
                  return (
                    <div
                      key={dev.id}
                      style={{
                        display: 'grid', gridTemplateColumns: '1.5rem 2rem 1fr auto auto',
                        gap: '0.75rem', alignItems: 'center',
                        padding: '0.625rem 0.875rem',
                        borderRadius: 0,
                        background: isMe ? 'var(--accent-dim)' : 'transparent',
                        border: `1px solid ${isMe ? 'var(--accent-dim)' : 'transparent'}`,
                      }}
                    >
                      <span style={{
                        fontSize: '0.75rem', "fontFamily": "'Geist Mono', monospace", textAlign: 'center',
                        color: medals[dev.team_rank] ?? 'var(--text-3)',
                        fontWeight: dev.team_rank <= 3 ? 700 : 400,
                      }}>
                        {dev.team_rank}
                      </span>
                      <div style={{
                        width: '1.75rem', height: '1.75rem', borderRadius: '50%',
                        background: isMe ? 'var(--accent-dim)' : 'var(--bg-2)',
                        border: `1px solid ${isMe ? 'var(--accent)' : 'var(--border)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.7rem', fontWeight: 600, color: isMe ? 'var(--accent)' : 'var(--text-2)',
                        flexShrink: 0,
                      }}>
                        {dev.name.charAt(0).toUpperCase()}
                      </div>
                      <span style={{ fontSize: '0.8125rem', color: isMe ? '#fff' : 'var(--text-2)', fontWeight: isMe ? 500 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {dev.name}{isMe && <span style={{ marginLeft: '0.375rem', fontSize: '0.65rem', color: 'var(--red)' }}>you</span>}
                      </span>
                      <span style={{ fontSize: '0.72rem', "fontFamily": "'Geist Mono', monospace", color: delta > 0 ? '#10b981' : delta < 0 ? '#ef4444' : 'var(--text-3)' }}>
                        {delta > 0 ? '+' : ''}{delta !== 0 ? delta.toFixed(1) : '—'}
                      </span>
                      <span style={{ fontSize: '0.875rem', fontWeight: 700, "fontFamily": "'Geist Mono', monospace", color: scoreColor(dev.current_score), minWidth: '2.5rem', textAlign: 'right' }}>
                        {dev.current_score.toFixed(1)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Row 4: Recent reviews ── */}
        {analytics?.recent_reviews && analytics.recent_reviews.length > 0 && (
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 0, padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <Label>Recent reviews</Label>
              <Link to="/history" style={{ fontSize: '0.72rem', color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                View all
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              {analytics.recent_reviews.slice(0, 4).map((review, i) => {
                const g = scoreGrade(review.score_overall);
                const c = scoreColor(review.score_overall);
                return (
                  <div
                    key={review.id}
                    style={{
                      display: 'grid', gridTemplateColumns: '2rem 1fr auto auto',
                      gap: '0.875rem', alignItems: 'center',
                      padding: '0.75rem 0',
                      borderBottom: i < Math.min(analytics.recent_reviews.length, 4) - 1
                        ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    }}
                  >
                    <div style={{
                      width: '2rem', height: '2rem', borderRadius: '0.4rem',
                      background: `${c}12`, border: `1px solid ${c}25`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.75rem', fontWeight: 700, color: c,
                    }}>
                      {g}
                    </div>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--text-2)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {review.summary || review.pr_title || 'Playground review'}
                    </p>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-3)', "fontFamily": "'Geist Mono', monospace", whiteSpace: 'nowrap' }}>
                      {new Date(review.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                    </span>
                    <span style={{ fontSize: '0.875rem', fontWeight: 700, "fontFamily": "'Geist Mono', monospace", color: c, minWidth: '2.5rem', textAlign: 'right' }}>
                      {review.score_overall.toFixed(1)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
