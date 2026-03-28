import { Link } from 'react-router-dom';
import AnimatedEntry from '../components/AnimatedEntry';

const FEATURES = [
  {
    title: 'AI-Powered Reviews',
    body: 'Every PR reviewed in seconds. Scored on correctness, security, readability, performance, and maintainability.',
    span: 'col-span-1 md:col-span-2 row-span-1',
    accent: 'from-violet-500/10 to-transparent',
  },
  {
    title: 'MySQL Intelligence Engine',
    body: 'Stored procedures, triggers, window functions, and event scheduler — the database is the hero.',
    span: 'col-span-1 row-span-2',
    accent: 'from-emerald-500/10 to-transparent',
  },
  {
    title: 'Developer Score Trends',
    body: '8-week rolling analytics. See who\'s improving, who repeats mistakes, who\'s at risk.',
    span: 'col-span-1 row-span-1',
    accent: 'from-sky-500/10 to-transparent',
  },
  {
    title: 'Team Leaderboard',
    body: 'RANK() and LAG() window functions power a live team ranking with week-over-week deltas.',
    span: 'col-span-1 row-span-1',
    accent: 'from-amber-500/10 to-transparent',
  },
  {
    title: 'Custom Rule Engine',
    body: 'Define plain-English rules per repo. Stored in MySQL, injected into every review prompt.',
    span: 'col-span-1 md:col-span-2 row-span-1',
    accent: 'from-rose-500/10 to-transparent',
  },
];

const STATS = [
  { value: '< 5s',   label: 'Time to review' },
  { value: '15+',    label: 'DB tables' },
  { value: '4',      label: 'Stored procedures' },
  { value: '3',      label: 'Triggers' },
];

export default function Landing() {
  return (
    <div className="mesh-bg min-h-[100dvh] relative">
      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="relative z-10 pt-40 pb-32 px-4 md:px-8 max-w-6xl mx-auto">
        <div className="grid md:grid-cols-2 gap-16 items-center">

          {/* Left — Typography block */}
          <div>
            <AnimatedEntry delay={0}>
              <span className="eyebrow mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse-glow" />
                DBMS Mini Project — AI SaaS
              </span>
            </AnimatedEntry>

            <AnimatedEntry delay={100}>
              <h1 className="text-5xl md:text-6xl font-semibold leading-[1.08] tracking-tight mt-6">
                Code reviews
                <br />
                <span className="text-white/30">powered by</span>
                <br />
                <span className="bg-gradient-to-r from-violet-400 to-emerald-400 bg-clip-text text-transparent">
                  AI + MySQL
                </span>
              </h1>
            </AnimatedEntry>

            <AnimatedEntry delay={200}>
              <p className="mt-6 text-base text-white/40 leading-relaxed max-w-md">
                Codex automatically reviews pull requests, scores developers over time, and
                surfaces team-wide insights — entirely driven by a deeply normalized MySQL
                database with stored procedures, triggers, and window functions.
              </p>
            </AnimatedEntry>

            <AnimatedEntry delay={300}>
              <div className="flex items-center gap-3 mt-10 flex-wrap">
                <Link
                  to="/playground"
                  className="btn-primary group"
                >
                  Try the playground
                  <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-sm
                                   transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                    ↗
                  </span>
                </Link>
                <Link to="/login" className="btn-ghost">Sign in</Link>
              </div>
            </AnimatedEntry>
          </div>

          {/* Right — Stats grid */}
          <AnimatedEntry delay={200} className="hidden md:block">
            <div className="bezel-outer">
              <div className="bezel-inner p-6">
                <div className="grid grid-cols-2 gap-4">
                  {STATS.map(s => (
                    <div key={s.label} className="bg-white/[0.03] rounded-2xl p-5 border border-white/[0.06]">
                      <p className="text-3xl font-semibold text-white">{s.value}</p>
                      <p className="text-xs text-white/30 mt-1 uppercase tracking-wider">{s.label}</p>
                    </div>
                  ))}
                </div>
                {/* Live review preview */}
                <div className="mt-4 bg-white/[0.03] rounded-2xl p-5 border border-white/[0.06]">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs text-white/30 font-mono">review #4821 · just now</span>
                  </div>
                  <div className="space-y-2">
                    {[
                      { label: 'Correctness',    score: 8.5, color: '#10b981' },
                      { label: 'Security',       score: 9.2, color: '#8b5cf6' },
                      { label: 'Readability',    score: 7.1, color: '#f59e0b' },
                    ].map(item => (
                      <div key={item.label} className="flex items-center gap-3">
                        <span className="text-xs text-white/30 w-24 shrink-0">{item.label}</span>
                        <div className="flex-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-1000"
                            style={{ width: `${item.score * 10}%`, background: item.color }}
                          />
                        </div>
                        <span className="text-xs font-mono" style={{ color: item.color }}>
                          {item.score}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </AnimatedEntry>
        </div>
      </section>

      {/* ── Feature Bento ─────────────────────────────────────── */}
      <section className="relative z-10 py-24 px-4 md:px-8 max-w-6xl mx-auto">
        <AnimatedEntry>
          <div className="text-center mb-16">
            <span className="eyebrow">What makes it different</span>
            <h2 className="text-3xl md:text-4xl font-semibold mt-4 tracking-tight">
              The database is the engine
            </h2>
            <p className="text-white/30 mt-3 max-w-md mx-auto">
              Not just a storage layer — MySQL runs the business logic.
            </p>
          </div>
        </AnimatedEntry>

        {/* Asymmetrical bento grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-[180px]">
          {FEATURES.map((feat, i) => (
            <AnimatedEntry key={feat.title} delay={i * 80} className={feat.span}>
              <div className="bezel-outer h-full">
                <div
                  className="bezel-inner h-full p-6 flex flex-col justify-end"
                  style={{ background: `radial-gradient(ellipse at top left, ${feat.accent.split(' ')[0].replace('from-', '').replace('/10', '')}18 0%, transparent 60%)` }}
                >
                  <h3 className="text-base font-semibold text-white/90">{feat.title}</h3>
                  <p className="mt-2 text-sm text-white/40 leading-relaxed">{feat.body}</p>
                </div>
              </div>
            </AnimatedEntry>
          ))}
        </div>
      </section>

      {/* ── CTA Banner ────────────────────────────────────────── */}
      <section className="relative z-10 py-32 px-4 text-center">
        <AnimatedEntry>
          <div className="bezel-outer max-w-2xl mx-auto">
            <div className="bezel-inner px-8 py-12">
              <span className="eyebrow mb-4">No setup required</span>
              <h2 className="text-3xl font-semibold mt-4 tracking-tight">
                Paste code. Get a review.
              </h2>
              <p className="text-white/30 mt-3 mb-8">
                No GitHub connection needed. The playground works instantly.
              </p>
              <Link to="/playground" className="btn-primary group">
                Open playground
                <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-sm
                                 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                  ↗
                </span>
              </Link>
            </div>
          </div>
        </AnimatedEntry>
      </section>
    </div>
  );
}
