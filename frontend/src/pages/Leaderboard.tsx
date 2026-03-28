import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { LeaderboardEntry } from '../types';
import AnimatedEntry from '../components/AnimatedEntry';
import ScoreRing from '../components/ScoreRing';

const BADGE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  newcomer:         { label: 'Newcomer',   color: 'text-white/40',    bg: 'bg-white/[0.05]' },
  consistent:       { label: 'Consistent', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  improving:        { label: 'Improving',  color: 'text-violet-400',  bg: 'bg-violet-500/10' },
  declining:        { label: 'Declining',  color: 'text-orange-400',  bg: 'bg-orange-500/10' },
  pattern_offender: { label: 'Watch',      color: 'text-red-400',     bg: 'bg-red-500/10' },
};

function RankMedal({ rank }: { rank: number }) {
  const medals = ['', '🥇', '🥈', '🥉'];
  if (rank <= 3) return <span className="text-base">{medals[rank]}</span>;
  return <span className="text-sm font-mono text-white/25">{rank}</span>;
}

export default function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.teams.leaderboard(1)
      .then(setEntries)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const top3 = entries.slice(0, 3);
  const rest  = entries.slice(3);

  return (
    <div className="min-h-[100dvh] pt-28 pb-16 px-4 md:px-8 max-w-5xl mx-auto">
      <AnimatedEntry>
        <div className="mb-10">
          <span className="eyebrow mb-3">Rankings</span>
          <h1 className="text-3xl font-semibold tracking-tight mt-3">Team Leaderboard</h1>
          <p className="text-white/30 mt-2 text-sm">
            Powered by MySQL RANK() window functions — updates after every review.
          </p>
        </div>
      </AnimatedEntry>

      {/* ── Top 3 podium ── */}
      {!loading && top3.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[top3[1], top3[0], top3[2]].filter(Boolean).map((dev, visualIdx) => {
            const isCenter = visualIdx === 1;
            const delta = dev.weekly_delta ?? 0;
            const badge = BADGE_CONFIG[dev.badge] ?? BADGE_CONFIG.newcomer;
            return (
              <AnimatedEntry key={dev.id} delay={visualIdx * 80}>
                <div className={`bezel-outer ${isCenter ? 'border-violet-500/30' : ''}`}>
                  <div className={`bezel-inner p-5 flex flex-col items-center text-center gap-3
                    ${isCenter ? 'bg-violet-500/[0.05]' : ''}`}>
                    {isCenter && (
                      <div className="w-px h-6 bg-gradient-to-b from-violet-500/0 to-violet-500/40" />
                    )}
                    <ScoreRing score={dev.current_score} size={isCenter ? 90 : 70} />
                    <div>
                      <p className="text-sm font-medium text-white/80">{dev.name}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full mt-1.5 inline-block
                                        ${badge.color} ${badge.bg}`}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-white/25">{dev.total_reviews} reviews</span>
                      <span className="text-white/10">·</span>
                      <span style={{ color: delta >= 0 ? '#10b981' : '#ef4444' }}>
                        {delta >= 0 ? '+' : ''}{delta.toFixed(1)}
                      </span>
                    </div>
                    <div className="text-lg">
                      <RankMedal rank={dev.team_rank} />
                    </div>
                  </div>
                </div>
              </AnimatedEntry>
            );
          })}
        </div>
      )}

      {/* ── Full table ── */}
      <AnimatedEntry delay={300}>
        <div className="bezel-outer">
          <div className="bezel-inner">
            {/* Table header */}
            <div className="grid grid-cols-[40px_1fr_80px_80px_80px_80px] gap-4 px-5 py-3
                            border-b border-white/[0.06] text-[10px] uppercase tracking-widest text-white/20">
              <span>#</span>
              <span>Developer</span>
              <span className="text-right">Reviews</span>
              <span className="text-right">Δ Week</span>
              <span className="text-right">Badge</span>
              <span className="text-right">Score</span>
            </div>

            {loading ? (
              <div className="p-5 space-y-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-12 rounded-xl bg-white/[0.03] animate-pulse" />
                ))}
              </div>
            ) : (
              <div>
                {entries.map((dev, i) => {
                  const delta = dev.weekly_delta ?? 0;
                  const badge = BADGE_CONFIG[dev.badge] ?? BADGE_CONFIG.newcomer;
                  return (
                    <div
                      key={dev.id}
                      className="grid grid-cols-[40px_1fr_80px_80px_80px_80px] gap-4 px-5 py-3.5
                                 border-b border-white/[0.04] hover:bg-white/[0.02]
                                 transition-colors duration-300 items-center"
                      style={{
                        opacity: 0,
                        animation: `fade-up 0.5s cubic-bezier(0.32,0.72,0,1) ${i * 40}ms forwards`,
                      }}
                    >
                      <span className="w-6 flex justify-center">
                        <RankMedal rank={dev.team_rank} />
                      </span>

                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-white/[0.06] border border-white/[0.08]
                                        flex items-center justify-center text-xs font-medium shrink-0">
                          {dev.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm text-white/70 truncate">{dev.name}</span>
                      </div>

                      <span className="text-xs text-white/30 text-right font-mono">
                        {dev.total_reviews}
                      </span>

                      <span
                        className="text-xs text-right font-mono"
                        style={{ color: delta >= 0 ? '#10b981' : '#ef4444' }}
                      >
                        {delta >= 0 ? '+' : ''}{delta.toFixed(1)}
                      </span>

                      <div className="flex justify-end">
                        <span className={`text-[9px] px-2 py-0.5 rounded-full ${badge.color} ${badge.bg}`}>
                          {badge.label}
                        </span>
                      </div>

                      <span className="text-sm font-semibold text-white/80 text-right font-mono">
                        {dev.current_score.toFixed(1)}
                      </span>
                    </div>
                  );
                })}

                {rest.length === 0 && entries.length === 0 && (
                  <div className="py-16 text-center text-white/20 text-sm">
                    No developers yet. Start reviewing code to appear here.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </AnimatedEntry>
    </div>
  );
}
