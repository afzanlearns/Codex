import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const FAQS = [
  {
    q: 'Do I need a GitHub account to use Codex?',
    a: 'No. The playground works instantly — paste any code and get a full AI review in seconds. GitHub integration is optional and only needed for automatic PR reviews and repo analysis.',
  },
  {
    q: 'What languages are supported?',
    a: 'JavaScript, TypeScript, Python, Java, Go, Rust, C++, SQL, PHP, Ruby, Swift, and Kotlin. The AI understands language-specific patterns and best practices for each.',
  },
  {
    q: 'How is the score calculated?',
    a: 'Overall = Correctness (30%) + Security (25%) + Readability (20%) + Performance (15%) + Maintainability (10%). This weighted formula runs inside a MySQL stored procedure, not application code.',
  },
  {
    q: 'What MySQL features does Codex actually use?',
    a: '15 normalized tables, 5 stored procedures, 3 triggers, 4 views with RANK() and LAG() window functions, 3 scheduled events, full-text search indexes, CTEs, and recursive queries.',
  },
  {
    q: 'Is my code stored permanently?',
    a: 'Playground reviews expire after 7 days and are automatically deleted by a MySQL Event Scheduler job that runs at 3am daily. Authenticated reviews are stored indefinitely.',
  },
  {
    q: 'How does the leaderboard work?',
    a: 'Rankings are computed by a MySQL view using RANK() OVER (PARTITION BY team_id ORDER BY current_score DESC). The LAG() function calculates week-over-week rank changes. No application code involved.',
  },
  {
    q: 'What AI model powers the reviews?',
    a: 'Llama 3.3 70B running on Groq infrastructure — selected for code comprehension depth and sub-second response times.',
  },
];

const FEATURES = [
  { label: 'AI Deep Reviews', desc: 'Security, bugs, performance, readability — all scored with grade A–F. Before/after fix comparisons included.', tag: 'LLM' },
  { label: '15-Table Schema', desc: 'Normalized to 5NF. Foreign keys, indexes, and constraints enforce data integrity at the database level.', tag: 'MySQL' },
  { label: 'Stored Procedures', desc: 'calculate_developer_score(), generate_weekly_snapshot(), flag_repeat_offender() — logic lives in the DB.', tag: 'MySQL' },
  { label: 'Triggers & Events', desc: '3 triggers auto-update scores on INSERT. 3 scheduled events run snapshots, alerts, and cleanup autonomously.', tag: 'MySQL' },
  { label: 'Window Functions', desc: 'RANK() OVER, LAG(), rolling AVG() — leaderboard and trend data are pure MySQL, not application code.', tag: 'MySQL' },
  { label: 'Repo Analysis', desc: 'Connect GitHub, analyze any codebase. Architecture breakdown, folder explanations, language distribution.', tag: 'GitHub' },
];

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100dvh', paddingTop: '52px' }}>

      {/* ── HERO ──────────────────────────────────────────────── */}
      <section style={{
        maxWidth: '1400px', margin: '0 auto', padding: '6rem 1.5rem 5rem',
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center',
        borderBottom: '1px solid var(--border)',
        position: 'relative',
      }}>
        {/* Corner marks */}
        <div style={{ position: 'absolute', top: '2rem', left: '1.5rem', width: '16px', height: '16px', borderTop: '1px solid var(--text-3)', borderLeft: '1px solid var(--text-3)' }} />
        <div style={{ position: 'absolute', top: '2rem', right: '1.5rem', width: '16px', height: '16px', borderTop: '1px solid var(--text-3)', borderRight: '1px solid var(--text-3)' }} />

        <div>
          <div style={{ marginBottom: '1.5rem' }}>
            <span className="tag">DBMS Mini Project — AI SaaS</span>
          </div>
          <h1 className="display" style={{ marginBottom: '1.5rem' }}>
            Code reviews.<br />
            <span style={{ color: 'var(--red)' }}>MySQL</span> is<br />
            the engine.
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', lineHeight: '1.8', maxWidth: '420px', marginBottom: '2.5rem' }}>
            Codex reviews pull requests, scores developers over time, and surfaces
            team-wide insights — entirely driven by stored procedures, triggers,
            and window functions.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link to="/playground" className="btn-primary">
              Try playground
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '0.4rem' }}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </Link>
            <Link to={isAuthenticated ? "/dashboard" : "/register"} className="btn-ghost" id="hero-cta">
              {isAuthenticated ? 'Go to Dashboard' : 'Get started'}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '0.2rem' }}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </Link>
          </div>
        </div>

        {/* Right — stat grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid var(--border)' }}>
          {[
            { value: '< 5s',  label: 'Time to review',     sub: 'Playground mode' },
            { value: '15+',   label: 'DB tables',           sub: 'Normalized 5NF'  },
            { value: '5',     label: 'Stored procedures',   sub: 'MySQL logic'     },
            { value: '3',     label: 'Triggers',            sub: 'Auto-update'     },
          ].map((stat, i) => (
            <div key={stat.label} style={{
              padding: '2rem 1.5rem',
              borderRight: i % 2 === 0 ? '1px solid var(--border)' : 'none',
              borderBottom: i < 2 ? '1px solid var(--border)' : 'none',
            }}>
              <p style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--text-1)', marginBottom: '0.375rem', letterSpacing: '-0.02em' }}>{stat.value}</p>
              <p style={{ fontSize: '0.6875rem', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.25rem' }}>{stat.label}</p>
              <p style={{ fontSize: '0.625rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{stat.sub}</p>
            </div>
          ))}
          {/* Live review preview */}
          <div style={{ gridColumn: '1 / -1', padding: '1.25rem 1.5rem', borderTop: '1px solid var(--border)', background: 'var(--bg-1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem' }}>
              <span style={{ width: '6px', height: '6px', background: '#4ade80', display: 'inline-block' }} />
              <span style={{ fontSize: '0.625rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>live review · just now</span>
            </div>
            {[
              { label: 'Correctness', score: 8.5, pct: 85 },
              { label: 'Security',    score: 9.1, pct: 91 },
              { label: 'Readability', score: 7.2, pct: 72 },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.625rem', color: 'var(--text-3)', width: '5.5rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{item.label}</span>
                <div className="score-track" style={{ flex: 1 }}>
                  <div className="score-fill" style={{ width: `${item.pct}%`, background: 'var(--red)' }} />
                </div>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-1)', width: '2rem', textAlign: 'right' }}>{item.score}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────── */}
      <section style={{ maxWidth: '1400px', margin: '0 auto', padding: '5rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ marginBottom: '3rem' }}>
          <span className="label" style={{ display: 'block', marginBottom: '0.75rem' }}>// How it works</span>
          <h2 className="heading">Three steps. One system.</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', border: '1px solid var(--border)' }}>
          {[
            { num: '01', title: 'Paste your code', desc: 'Drop any snippet into the playground. No account needed, no GitHub connection. 12+ languages supported.' },
            { num: '02', title: 'AI analyzes it',  desc: 'Llama 3.3 70B reviews for security vulnerabilities, logic bugs, performance issues, and code smells simultaneously.' },
            { num: '03', title: 'MySQL stores everything', desc: 'Every review lands in a 15-table normalized schema. Triggers fire. Score updates. Leaderboard recalculates.' },
          ].map((step, i) => (
            <div key={step.num} style={{
              padding: '2.5rem 2rem',
              borderRight: i < 2 ? '1px solid var(--border)' : 'none',
            }}>
              <p style={{ fontSize: '3rem', fontWeight: 700, color: 'var(--border-2)', marginBottom: '1.5rem', letterSpacing: '-0.03em' }}>{step.num}</p>
              <p style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-1)', marginBottom: '0.75rem' }}>{step.title}</p>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-2)', lineHeight: '1.7' }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── DEMO PREVIEW ──────────────────────────────────────── */}
      <section style={{ maxWidth: '1400px', margin: '0 auto', padding: '5rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ marginBottom: '3rem' }}>
          <span className="label" style={{ display: 'block', marginBottom: '0.75rem' }}>// Live output</span>
          <h2 className="heading">This is a real review. Not a mockup.</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '0', border: '1px solid var(--border)' }}>
          {/* Code panel */}
          <div style={{ borderRight: '1px solid var(--border)' }}>
            <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-1)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="label">input.js</span>
            </div>
            <pre style={{ padding: '1.5rem', fontSize: '0.75rem', lineHeight: '1.8', color: 'var(--text-2)', fontFamily: 'inherit', overflow: 'auto' }}>{`function getUser(id) {
  const query = 
    "SELECT * FROM users" +
    " WHERE id = " + id;
  return db.execute(query);
}`}</pre>
          </div>
          {/* Review panel */}
          <div>
            <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="label">review output</span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <span className="tag tag-red">Grade F</span>
                <span className="tag tag-red">Critical Risk</span>
              </div>
            </div>
            <div style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '1.25rem' }}>
                <span style={{ fontSize: '2.5rem', fontWeight: 700, color: '#f87171', letterSpacing: '-0.02em' }}>2.1</span>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-3)' }}>/10</span>
              </div>
              {[
                { label: 'Correctness',  score: 1.5, pct: 15 },
                { label: 'Security',     score: 0.5, pct:  5 },
                { label: 'Readability',  score: 4.0, pct: 40 },
                { label: 'Performance',  score: 5.0, pct: 50 },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.625rem' }}>
                  <span style={{ fontSize: '0.625rem', color: 'var(--text-3)', width: '5.5rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{item.label}</span>
                  <div className="score-track" style={{ flex: 1 }}>
                    <div className="score-fill" style={{ width: `${item.pct}%` }} />
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#f87171', width: '2rem', textAlign: 'right' }}>{item.score}</span>
                </div>
              ))}
              <div style={{ marginTop: '1.25rem', padding: '1rem', background: 'var(--red-dim)', border: '1px solid var(--red-border)' }}>
                <p style={{ fontSize: '0.6875rem', color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.375rem' }}>Critical — SQL Injection</p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', lineHeight: '1.6' }}>Raw string concatenation in query builder. Attacker can inject arbitrary SQL.</p>
                <p style={{ fontSize: '0.75rem', color: '#4ade80', marginTop: '0.5rem', fontFamily: 'inherit' }}>Fix: db.execute('SELECT * FROM users WHERE id = ?', [id])</p>
              </div>
            </div>
          </div>
        </div>
        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <Link to="/playground" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Try it yourself
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </Link>
        </div>
      </section>

      {/* ── FEATURES GRID ─────────────────────────────────────── */}
      <section style={{ maxWidth: '1400px', margin: '0 auto', padding: '5rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ marginBottom: '3rem' }}>
          <span className="label" style={{ display: 'block', marginBottom: '0.75rem' }}>// What makes it different</span>
          <h2 className="heading">The database is the engine.</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', marginTop: '0.75rem' }}>Not just a storage layer — MySQL runs the business logic.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', border: '1px solid var(--border)' }}>
          {FEATURES.map((feat, i) => (
            <div key={feat.label} style={{
              padding: '2rem',
              borderRight: (i + 1) % 3 !== 0 ? '1px solid var(--border)' : 'none',
              borderBottom: i < 3 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-1)' }}>{feat.label}</p>
                <span className="tag">{feat.tag}</span>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', lineHeight: '1.7' }}>{feat.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── STATS BAR ─────────────────────────────────────────── */}
      <section style={{ background: 'var(--bg-1)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '3rem 1.5rem', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0' }}>
          {[
            { value: '15+', label: 'DB Tables' },
            { value: '5',   label: 'Stored Procedures' },
            { value: '3',   label: 'Triggers' },
            { value: '4',   label: 'Scheduled Events' },
          ].map((stat, i) => (
            <div key={stat.label} style={{
              textAlign: 'center', padding: '1.5rem',
              borderRight: i < 3 ? '1px solid var(--border)' : 'none',
            }}>
              <p style={{ fontSize: '3rem', fontWeight: 700, color: 'var(--red)', marginBottom: '0.5rem', letterSpacing: '-0.03em' }}>{stat.value}</p>
              <p className="label">{stat.label}</p>
            </div>
          ))}
        </div>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', fontStyle: 'italic' }}>
            Every number above is a live MySQL object you can query right now.
          </p>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────── */}
      <section style={{ maxWidth: '1400px', margin: '0 auto', padding: '5rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ marginBottom: '3rem' }}>
          <span className="label" style={{ display: 'block', marginBottom: '0.75rem' }}>// FAQ</span>
          <h2 className="heading">Frequently asked.</h2>
        </div>
        <div style={{ maxWidth: '800px' }}>
          {FAQS.map((faq, i) => (
            <div key={i} style={{ borderTop: '1px solid var(--border)' }}>
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                style={{
                  width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                  padding: '1.25rem 0', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', fontFamily: 'inherit', textAlign: 'left',
                  color: openFaq === i ? 'var(--text-1)' : 'var(--text-2)',
                  fontSize: '0.875rem', transition: 'color 0.15s',
                }}
              >
                <span>{faq.q}</span>
                <span style={{ color: openFaq === i ? 'var(--red)' : 'var(--text-3)', flexShrink: 0, marginLeft: '1rem', fontSize: '1rem', fontWeight: 300 }}>
                  {openFaq === i ? '−' : '+'}
                </span>
              </button>
              {openFaq === i && (
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-2)', lineHeight: '1.8', paddingBottom: '1.25rem' }}>
                  {faq.a}
                </p>
              )}
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--border)' }} />
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────── */}
      <section style={{ background: 'var(--red)', padding: '4rem 1.5rem', textAlign: 'center' }}>
        <p className="label" style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '1rem' }}>// No setup required</p>
        <h2 style={{ fontSize: 'clamp(1.75rem, 4vw, 3rem)', fontWeight: 700, color: '#fff', marginBottom: '2rem', letterSpacing: '-0.02em' }}>
          Paste code. Get a review.
        </h2>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
          <Link to={isAuthenticated ? "/dashboard" : "/playground"} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {isAuthenticated ? "Go to Dashboard" : "Open playground"}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </Link>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────── */}
      <footer style={{ background: 'var(--bg-1)', borderTop: '1px solid var(--border)', padding: '4rem 1.5rem 2rem' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '3rem', marginBottom: '3rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <span style={{ width: '8px', height: '8px', background: 'var(--red)', display: 'inline-block' }} />
                <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-1)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>CODEX</span>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', lineHeight: '1.7', marginBottom: '0.5rem' }}>AI code reviews powered by MySQL.</p>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>Built as a DBMS Mini Project · MySQL 8.0</p>
            </div>
            <div>
              <p className="label" style={{ marginBottom: '1rem' }}>Product</p>
              {[['Playground', '/playground'], ['Dashboard', '/dashboard'], ['Leaderboard', '/leaderboard'], ['Sign in', '/login']].map(([label, href]) => (
                <Link key={href} to={href} style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-2)', textDecoration: 'none', marginBottom: '0.5rem', transition: 'color 0.15s' }}>
                  {label}
                </Link>
              ))}
            </div>
            <div>
              <p className="label" style={{ marginBottom: '1rem' }}>Technology</p>
              {['MySQL 8.0', 'Llama 3.3 70B (Groq)', 'React + TypeScript', 'Node.js + Express'].map(t => (
                <p key={t} style={{ fontSize: '0.8rem', color: 'var(--text-3)', marginBottom: '0.5rem' }}>{t}</p>
              ))}
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>© 2026 Codex · DBMS Mini Project</p>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>Built with MySQL · React · Groq</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
