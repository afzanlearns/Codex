import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import { DeveloperAnalytics, LeaderboardEntry } from '../types';
import ScoreRing from '../components/ScoreRing';
import AnimatedEntry from '../components/AnimatedEntry';

const BADGE_CONFIG = {
  newcomer:        { label: 'Newcomer',        color: 'text-white/40',    bg: 'bg-white/[0.06]' },
  consistent:      { label: 'Consistent',      color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  improving:       { label: 'Improving',        color: 'text-violet-400',  bg: 'bg-violet-500/10' },
  declining:       { label: 'Declining',        color: 'text-orange-400',  bg: 'bg-orange-500/10' },
  pattern_offender:{ label: 'Watch List',       color: 'text-red-400',     bg: 'bg-red-500/10' },
};

export default function Dashboard() {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState<DeveloperAnalytics | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Default team ID 1 for demo — in production derive from user.team
  const teamId = 1;

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.developers.analytics(user.id),
      api.teams.leaderboard(teamId),
    ])
      .then(([a, l]) => { setAnalytics(a); setLeaderboard(l); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  const badge = BADGE_CONFIG[user?.badge || 'newcomer'];
  const chartData = analytics?.trend.map(t => ({
    week: new Date(t.week_start).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
    score:   +t.avg_score,
    rolling: +t.rolling_4w_avg,
  })) ?? [];

  return (
    <div className="min-h-[100dvh] pt-28 pb-16 px-4 md:px-8 max-w-7xl mx-auto">
      {/* Header */}
      <AnimatedEntry className="mb-8">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <span className="eyebrow mb-2">Dashboard</span>
            <h1 className="text-3xl font-semibold tracking-tight mt-2">
              Welcome back, {user?.name?.split(' ')[0]}
            </h1>
          </div>
          <Link to="/playground" className="btn-primary group">
            New review
            <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-sm
                             transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
              ↗
            </span>
          </Link>
        </div>
      </AnimatedEntry>

      {/* ── Bento Grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 auto-rows-auto">

        {/* Score ring card — 3 cols */}
        <AnimatedEntry delay={50} className="md:col-span-3">
          <div className="bezel-outer h-full">
            <div className="bezel-inner p-6 flex flex-col items-center justify-center gap-4 min-h-[220px]">
              <ScoreRing
                score={user?.current_score ?? 0}
                size={130}
                label="Score"
              />
              <div className="text-center">
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${badge.color} ${badge.bg}`}>
                  {badge.label}
                </span>
                <p className="text-xs text-white/30 mt-2">
                  {user?.total_reviews ?? 0} total reviews
                </p>
              </div>
            </div>
          </div>
        </AnimatedEntry>

        {/* Score breakdown — 5 cols */}
        <AnimatedEntry delay={100} className="md:col-span-5">
          <div className="bezel-outer h-full">
            <div className="bezel-inner p-6 min-h-[220px]">
              <p className="text-xs uppercase tracking-widest text-white/30 mb-5">Score breakdown</p>
              <div className="space-y-3">
                {[
                  { label: 'Correctness',     score: 8.4, color: '#10b981' },
                  { label: 'Security',        score: 9.1, color: '#8b5cf6' },
                  { label: 'Readability',     score: 7.2, color: '#f59e0b' },
                  { label: 'Performance',     score: 7.8, color: '#38bdf8' },
                  { label: 'Maintainability', score: 6.9, color: '#f472b6' },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-3">
                    <span className="text-xs text-white/35 w-28 shrink-0">{item.label}</span>
                    <div className="flex-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${item.score * 10}%`,
                          background: item.color,
                          transition: 'width 1.4s cubic-bezier(0.32,0.72,0,1)',
                        }}
                      />
                    </div>
                    <span className="text-xs font-mono w-7 text-right" style={{ color: item.color }}>
                      {item.score}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </AnimatedEntry>

        {/* Stat cards — 4 cols */}
        <AnimatedEntry delay={150} className="md:col-span-4">
          <div className="grid grid-cols-2 gap-3 h-full">
            {[
              { label: 'This week',  value: analytics?.trend.at(-1)?.reviews_count ?? '—', sub: 'reviews' },
              { label: 'Team rank',  value: analytics?.trend.at(-1)?.rank_in_team  ?? '—', sub: 'position' },
              { label: 'Bugs found', value: analytics?.trend.at(-1)?.bug_count     ?? '—', sub: 'this week' },
              { label: 'Trend',
                value: analytics?.trend.at(-1)?.score_delta != null
                  ? (analytics!.trend.at(-1)!.score_delta >= 0 ? '+' : '') +
                    analytics!.trend.at(-1)!.score_delta.toFixed(1)
                  : '—',
                sub: 'vs last week',
                color: (analytics?.trend.at(-1)?.score_delta ?? 0) >= 0 ? '#10b981' : '#ef4444',
              },
            ].map(s => (
              <div key={s.label} className="bezel-outer">
                <div className="bezel-inner p-4">
                  <p className="text-xs text-white/30 uppercase tracking-wider">{s.label}</p>
                  <p
                    className="text-2xl font-semibold mt-1"
                    style={{ color: s.color ?? 'rgba(255,255,255,0.87)' }}
                  >
                    {loading ? '—' : s.value}
                  </p>
                  <p className="text-[10px] text-white/20 mt-0.5">{s.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </AnimatedEntry>

        {/* Trend chart — 8 cols */}
        <AnimatedEntry delay={200} className="md:col-span-8">
          <div className="bezel-outer">
            <div className="bezel-inner p-6">
              <div className="flex items-center justify-between mb-5">
                <p className="text-xs uppercase tracking-widest text-white/30">8-week trend</p>
                <div className="flex items-center gap-4 text-[10px] text-white/30">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-px bg-violet-400 inline-block" /> Weekly score
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-px bg-emerald-400/50 inline-block border-dashed" /> 4-wk avg
                  </span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis
                    dataKey="week"
                    tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    domain={[0, 10]}
                    tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }}
                    axisLine={false} tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#0e0e0e',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '12px',
                      fontSize: '12px',
                      color: 'rgba(255,255,255,0.7)',
                    }}
                    cursor={{ stroke: 'rgba(255,255,255,0.06)', strokeWidth: 1 }}
                  />
                  <Line
                    type="monotone" dataKey="score"
                    stroke="#8b5cf6" strokeWidth={2}
                    dot={{ fill: '#8b5cf6', r: 3, strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: '#8b5cf6' }}
                  />
                  <Line
                    type="monotone" dataKey="rolling"
                    stroke="#10b981" strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </AnimatedEntry>

        {/* Top issues — 4 cols */}
        <AnimatedEntry delay={250} className="md:col-span-4">
          <div className="bezel-outer h-full">
            <div className="bezel-inner p-6">
              <p className="text-xs uppercase tracking-widest text-white/30 mb-4">Top issues (90d)</p>
              {loading ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-8 rounded-lg bg-white/[0.04] animate-pulse" />
                  ))}
                </div>
              ) : analytics?.top_issues.length ? (
                <div className="space-y-2.5">
                  {analytics.top_issues.map(issue => (
                    <div key={issue.slug} className="flex items-center gap-3">
                      <span className="text-sm text-white/50 w-5 font-mono">
                        {issue.issue_rank}
                      </span>
                      <span className="flex-1 text-sm text-white/60">{issue.label}</span>
                      <span className="text-xs text-white/30 font-mono">{issue.count}×</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-white/20">No issues recorded yet.</p>
              )}
            </div>
          </div>
        </AnimatedEntry>

        {/* Leaderboard preview — full width */}
        <AnimatedEntry delay={300} className="md:col-span-12">
          <div className="bezel-outer">
            <div className="bezel-inner p-6">
              <div className="flex items-center justify-between mb-5">
                <p className="text-xs uppercase tracking-widest text-white/30">Team leaderboard</p>
                <Link to="/leaderboard" className="text-xs text-violet-400/70 hover:text-violet-400
                                                    transition-colors duration-300">
                  View all →
                </Link>
              </div>
              <div className="space-y-2">
                {leaderboard.slice(0, 5).map((dev, i) => {
                  const isMe = dev.id === user?.id;
                  const delta = dev.weekly_delta ?? 0;
                  return (
                    <div
                      key={dev.id}
                      className={`flex items-center gap-4 px-4 py-3 rounded-2xl transition-all duration-300
                        ${isMe ? 'bg-violet-500/[0.08] border border-violet-500/20' : 'hover:bg-white/[0.03]'}`}
                    >
                      <span className="text-sm font-mono text-white/25 w-5">
                        {dev.team_rank}
                      </span>
                      <div className="w-8 h-8 rounded-full bg-white/[0.06] border border-white/10
                                      flex items-center justify-center text-xs font-medium shrink-0">
                        {dev.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="flex-1 text-sm text-white/70 font-medium">
                        {dev.name}
                        {isMe && <span className="ml-2 text-[10px] text-violet-400">(you)</span>}
                      </span>
                      <span
                        className="text-xs font-mono"
                        style={{ color: delta >= 0 ? '#10b981' : '#ef4444' }}
                      >
                        {delta > 0 ? '+' : ''}{delta.toFixed(1)}
                      </span>
                      <span className="text-sm font-semibold text-white/80 w-10 text-right font-mono">
                        {dev.current_score.toFixed(1)}
                      </span>
                    </div>
                  );
                })}
                {loading && [...Array(3)].map((_, i) => (
                  <div key={i} className="h-12 rounded-2xl bg-white/[0.03] animate-pulse" />
                ))}
              </div>
            </div>
          </div>
        </AnimatedEntry>
      </div>
    </div>
  );
}
