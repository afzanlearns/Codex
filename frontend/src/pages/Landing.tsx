import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const FAQS = [
  {
    q: 'Do I need a GitHub account to use Codex?',
    a: 'No. The code review works instantly — paste any code and get a full AI-grounded review in seconds. GitHub integration is optional and enables repository indexing, codebase chat, and refactor intelligence.',
  },
  {
    q: 'What languages are supported?',
    a: 'JavaScript, TypeScript, Python, Java, Go, Rust, C++, SQL, PHP, Ruby, Swift, and Kotlin. The AI understands language-specific patterns and best practices for each.',
  },
  {
    q: 'How does RAG grounding work?',
    a: 'When you run a review or refactor analysis, Codex retrieves the most relevant code chunks from your indexed repository using hybrid BM25 + semantic search (Reciprocal Rank Fusion). These chunks are injected as context into the Llama 3.3 70B prompt, grounding answers in your actual codebase instead of generic patterns.',
  },
  {
    q: 'How is the review score calculated?',
    a: 'Overall = Correctness (30%) + Security (25%) + Readability (20%) + Performance (15%) + Maintainability (10%). The scoring formula runs as a MySQL stored procedure so weights remain consistent across all reviews.',
  },
  {
    q: 'How does the codebase indexing pipeline work?',
    a: 'Codex fetches your GitHub repo via Octokit, splits source files into overlapping chunks by function/class boundaries, generates 384-dimensional embeddings using all-MiniLM-L6-v2, and upserts them into ChromaDB. The entire pipeline runs embedded — no Docker, no separate service.',
  },
  {
    q: 'What is the OWASP corpus?',
    a: 'A curated set of OWASP Top 10 vulnerability descriptions and patterns that are pre-seeded into ChromaDB. Every code review retrieves semantically similar OWASP entries to ground security findings in documented vulnerability classes.',
  },
  {
    q: 'What AI model powers the reviews?',
    a: 'Llama 3.3 70B running on Groq infrastructure — selected for deep code comprehension and sub-second token generation. RAG context blocks are injected into every prompt with full citation tracking.',
  },
  {
    q: 'Is my code stored permanently?',
    a: 'Code review results expire after 7 days and are cleaned up automatically by a MySQL Event Scheduler job. Repository vector indexes persist in ChromaDB until you manually delete them from the Index Manager.',
  },
];

const FEATURES = [
  {
    label: 'Codebase Chat',
    desc: 'Ask anything about your indexed repo — architecture, entry points, API surface, test coverage. Every answer is grounded in retrieved code chunks with cited file and line references.',
    tag: 'RAG',
  },
  {
    label: 'Refactor Intelligence',
    desc: 'Paste a snippet and get RAG-grounded refactoring suggestions backed by patterns from your actual codebase — not generic advice. Before/after diffs with impact ratings included.',
    tag: 'RAG',
  },
  {
    label: 'Hybrid Search',
    desc: 'BM25 keyword search fused with semantic vector search via Reciprocal Rank Fusion. Retrieves the most relevant context chunks regardless of whether you match exact tokens or semantic meaning.',
    tag: 'Search',
  },
  {
    label: 'OWASP-Grounded Security',
    desc: 'Every code review retrieves semantically similar OWASP Top 10 entries from ChromaDB. Security findings are cited back to documented vulnerability classes — not hallucinated.',
    tag: 'Security',
  },
  {
    label: 'Index Pipeline',
    desc: 'Parse → Chunk → Embed → Store. Live progress visualization for every stage. ChromaDB runs embedded — no Docker, no separate Python service. Everything from npm run dev.',
    tag: 'Pipeline',
  },
  {
    label: 'AI Deep Reviews',
    desc: 'Correctness, Security, Readability, Performance, Maintainability — all scored A–F. Grounded in retrieved codebase context and OWASP patterns. Before/after fix comparisons included.',
    tag: 'LLM',
  },
];

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingTop: '52px' }}>

      {/* ── HERO ──────────────────────────────────────────────── */}
      <section style={{
        maxWidth: '1400px', margin: '0 auto', padding: '4rem 1.5rem',
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center',
        borderBottom: '1px solid var(--border)',
        position: 'relative',
        minHeight: 'calc(100vh - 52px)'
      }}>
        {/* Corner marks */}
        <div style={{ position: 'absolute', top: '2rem', left: '1.5rem', width: '16px', height: '16px', borderTop: '1px solid var(--text-3)', borderLeft: '1px solid var(--text-3)' }} />
        <div style={{ position: 'absolute', top: '2rem', right: '1.5rem', width: '16px', height: '16px', borderTop: '1px solid var(--text-3)', borderRight: '1px solid var(--text-3)' }} />

        <div>
          <h1 className="display" style={{ marginBottom: '1.5rem' }}>
            Code reviews.<br />
            <span style={{ color: 'var(--red)' }}>Grounded</span> in<br />
            your codebase.
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', lineHeight: '1.8', maxWidth: '420px', marginBottom: '2.5rem' }}>
            Codex indexes your repositories into ChromaDB, retrieves relevant context
            via hybrid search, and grounds every review, refactor suggestion,
            and chat answer in your actual code — not generic patterns.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link to="/review" className="btn-primary">
              Try code review
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '0.4rem' }}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </Link>
            <Link to={isAuthenticated ? "/chat" : "/register"} className="btn-ghost" id="hero-cta" style={{ color: 'var(--text-1)' }}>
              {isAuthenticated ? 'Chat with codebase' : 'Get started'}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '0.2rem' }}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </Link>
          </div>
        </div>

        {/* Right — stat grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid var(--border)' }}>
          {[
            { value: '< 5s',  label: 'Time to review',   sub: 'Code Review mode' },
            { value: 'BM25+', label: 'Hybrid search',     sub: 'RRF fusion'      },
            { value: '384d',  label: 'Embedding dims',    sub: 'all-MiniLM-L6'   },
            { value: 'OWASP', label: 'Security corpus',   sub: 'Top 10 grounded' },
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
              <span style={{ fontSize: '0.625rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>live review · just now · 12 rag chunks</span>
            </div>
            {[
              { label: 'Correctness', score: 8.5, pct: 85 },
              { label: 'Security',    score: 9.1, pct: 91 },
              { label: 'Readability', score: 7.2, pct: 72 },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.625rem', color: 'var(--text-3)', width: '5.5rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{item.label}</span>
                <div className="score-track" style={{ flex: 1 }}>
                  <div className="score-fill" style={{ width: `${item.pct}%` }} />
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
          <h2 className="heading">Index once. Ask anything.</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', border: '1px solid var(--border)' }}>
          {[
            { num: '01', title: 'Index your repo',     desc: 'Connect GitHub, trigger the pipeline. Codex parses, chunks, and embeds your source files into ChromaDB in one pass.' },
            { num: '02', title: 'Hybrid retrieval',    desc: 'Every query hits BM25 keyword search and semantic vector search in parallel. Results are fused with Reciprocal Rank Fusion.' },
            { num: '03', title: 'LLM with context',    desc: 'The top-K retrieved chunks are injected into the Llama 3.3 70B prompt as grounding context with citation IDs.' },
            { num: '04', title: 'Cited, traceable answers', desc: 'Every finding or suggestion is tagged with a citation ID mapping back to the exact file and line range it came from.' },
          ].map((step, i) => (
            <div key={step.num} style={{
              padding: '2.5rem 2rem',
              borderRight: i < 3 ? '1px solid var(--border)' : 'none',
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
              <span className="label">input.ts</span>
            </div>
            <pre style={{ padding: '1.5rem', fontSize: '0.75rem', lineHeight: '1.8', color: 'var(--text-2)', fontFamily: 'inherit', overflow: 'auto' }}>{`async function getUser(id) {
  const q = "SELECT * FROM users"
    + " WHERE id = " + id;
  return db.execute(q);
}`}</pre>
          </div>
          {/* Review panel */}
          <div>
            <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="label">review output</span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <span className="tag tag-red">Grade F</span>
                <span className="tag tag-red">3 RAG chunks</span>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
                  <p style={{ fontSize: '0.6875rem', color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Critical — SQL Injection</p>
                  <span className="tag tag-red" style={{ fontSize: '0.5rem' }}>OWASP A03:2021</span>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', lineHeight: '1.6' }}>Raw string concatenation in query builder. Attacker can inject arbitrary SQL. Grounded in retrieved OWASP A03:2021 corpus entry.</p>
                <p style={{ fontSize: '0.75rem', color: '#4ade80', marginTop: '0.5rem', fontFamily: 'inherit' }}>Fix: db.execute('SELECT * FROM users WHERE id = ?', [id])</p>
              </div>
            </div>
          </div>
        </div>
        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <Link to="/review" className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            Try it yourself
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </Link>
        </div>
      </section>

      {/* ── FEATURES GRID ─────────────────────────────────────── */}
      <section style={{ maxWidth: '1400px', margin: '0 auto', padding: '5rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ marginBottom: '3rem' }}>
          <span className="label" style={{ display: 'block', marginBottom: '0.75rem' }}>// What makes it different</span>
          <h2 className="heading">The codebase is the context.</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', marginTop: '0.75rem' }}>Not generic AI advice — answers grounded in your actual code, retrieved at query time.</p>
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
            { value: '2',     label: 'Search modes',       sub: 'BM25 + Semantic' },
            { value: '384',   label: 'Embedding dims',     sub: 'all-MiniLM-L6-v2' },
            { value: 'RRF',   label: 'Fusion algorithm',   sub: 'Reciprocal Rank' },
            { value: 'SSE',   label: 'Streaming protocol', sub: 'Chat responses' },
          ].map((stat, i) => (
            <div key={stat.label} style={{
              textAlign: 'center', padding: '1.5rem',
              borderRight: i < 3 ? '1px solid var(--border)' : 'none',
            }}>
              <p style={{ fontSize: '3rem', fontWeight: 700, color: 'var(--red)', marginBottom: '0.375rem', letterSpacing: '-0.03em' }}>{stat.value}</p>
              <p className="label" style={{ marginBottom: '0.25rem' }}>{stat.label}</p>
              <p style={{ fontSize: '0.6rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{stat.sub}</p>
            </div>
          ))}
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
      <section style={{ background: 'linear-gradient(135deg, #24157A 0%, #2E1B9C 50%, #4330B5 100%)', padding: '4rem 1.5rem', textAlign: 'center' }}>
        <p className="label" style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '1rem' }}>// No setup required</p>
        <h2 style={{ fontSize: 'clamp(1.75rem, 4vw, 3rem)', fontWeight: 700, color: '#fff', marginBottom: '2rem', letterSpacing: '-0.02em' }}>
          Index once. Understand everything.
        </h2>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <Link to="/review" className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: '#fff', color: 'var(--red)', borderColor: '#fff' }}>
            Open code review
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </Link>
          <Link to={isAuthenticated ? "/chat" : "/register"} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem 1.25rem', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', fontSize: '0.75rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', textDecoration: 'none', fontFamily: 'inherit', transition: 'border-color 0.15s, background 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--brand-soft)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            {isAuthenticated ? 'Chat with codebase' : 'Get started'}
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
              <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', lineHeight: '1.7', marginBottom: '0.5rem' }}>RAG-powered code intelligence grounded in your actual codebase.</p>
            </div>
            <div>
              <p className="label" style={{ marginBottom: '1rem' }}>Product</p>
              {[
                ['Code Review', '/review'],
                ['Refactor', '/refactor'],
                ['Index Manager', '/index-manager'],
                ['Codebase Chat', '/chat'],
                ['Repos', '/repos'],
                ['Dashboard', '/dashboard']
              ].map(([label, href]) => (
                <Link key={href} to={href} style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-2)', textDecoration: 'none', marginBottom: '0.5rem', transition: 'color 0.15s' }}>
                  {label}
                </Link>
              ))}
            </div>
            <div>
              <p className="label" style={{ marginBottom: '1rem' }}>Technology</p>
              {['MySQL 8.0', 'ChromaDB (embedded)', 'Llama 3.3 70B (Groq)', 'all-MiniLM-L6-v2', 'React + TypeScript', 'Node.js + Express'].map(t => (
                <p key={t} style={{ fontSize: '0.8rem', color: 'var(--text-3)', marginBottom: '0.5rem' }}>{t}</p>
              ))}
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>Made with {'<3'} by team Imperial X</p>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>© 2026 Codex</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
