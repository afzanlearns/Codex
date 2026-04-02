import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Review } from '../types';

const SecurityIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
);
const BugIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="14" x="8" y="6" rx="4"/><path d="m19 7-3 2"/><path d="m5 7 3 2"/><path d="m19 19-3-2"/><path d="m5 19 3-2"/><path d="M20 13h-4"/><path d="M4 13h4"/><path d="m10 4 1 2"/><path d="m14 4-1 2"/></svg>
);
const ZapIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
);
const BookIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
);
const FlaskIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2v8l-6 11h18l-6-11V2"/><path d="M7 2h10"/><path d="M12 11h.01"/><path d="M9 16h.01"/><path d="M13 16h.01"/></svg>
);
const CodeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
);
const ArrowUpRight = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
);
const CommandIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/></svg>
);

const LANGUAGES = [
  'javascript','typescript','python','java','go','rust',
  'cpp','sql','php','ruby','swift','kotlin',
];

const SEVERITY_CONFIG = {
  info:     { color: '#60a5fa', bg: 'rgba(96,165,250,0.08)',  border: 'rgba(96,165,250,0.2)',  dot: '#60a5fa',  label: 'Info'     },
  low:      { color: '#34d399', bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.2)',  dot: '#34d399',  label: 'Low'      },
  medium:   { color: '#fbbf24', bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.2)',  dot: '#fbbf24',  label: 'Medium'   },
  high:     { color: '#fb923c', bg: 'rgba(251,146,60,0.08)',  border: 'rgba(251,146,60,0.2)',  dot: '#fb923c',  label: 'High'     },
  critical: { color: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.2)', dot: '#f87171',  label: 'Critical' },
};

const RISK_CONFIG = {
  low:      { color: '#34d399', bg: 'rgba(52,211,153,0.1)',   label: 'Low Risk'      },
  medium:   { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',   label: 'Medium Risk'   },
  high:     { color: '#fb923c', bg: 'rgba(251,146,60,0.1)',   label: 'High Risk'     },
  critical: { color: '#f87171', bg: 'rgba(248,113,113,0.1)',  label: 'Critical Risk' },
};

const GRADE_CONFIG: Record<string, { color: string; bg: string }> = {
  A: { color: '#34d399', bg: 'rgba(52,211,153,0.1)'   },
  B: { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)'   },
  C: { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)'   },
  D: { color: '#fb923c', bg: 'rgba(251,146,60,0.1)'   },
  F: { color: '#f87171', bg: 'rgba(248,113,113,0.1)'  },
};

function scoreColor(s: number) {
  if (s >= 8.5) return 'var(--red)';
  if (s >= 7)   return '#10b981';
  if (s >= 5)   return '#fbbf24';
  return '#f87171';
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-2)', width: '6.5rem', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: '4px', borderRadius: 0, background: 'var(--bg-2)', overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 0,
          width: `${score * 10}%`,
          background: scoreColor(score),
          transition: 'width 1s cubic-bezier(0.32,0.72,0,1)',
        }} />
      </div>
      <span style={{ fontSize: '0.75rem', "fontFamily": "'Geist Mono', monospace", color: scoreColor(score), width: '2.5rem', textAlign: 'right' }}>
        {score.toFixed(1)}
      </span>
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--bg-1)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 0,
      padding: '1.25rem',
      ...style,
    }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: '0.65rem', fontWeight: 600,
      textTransform: 'uppercase', letterSpacing: '0.12em',
      color: 'var(--text-3)', margin: '0 0 0.875rem',
    }}>
      {children}
    </p>
  );
}

const PLACEHOLDER = `// Paste any code here for an instant deep review
function loginUser(req, res) {
  const { username, password } = req.body;
  const query = "SELECT * FROM users WHERE username = '" + username + "'";
  db.execute(query, (err, results) => {
    if (err) { console.log(err); }
    else {
      const user = results[0];
      res.send("Welcome " + user.name);
    }
  });
}`;

const LS_CODE     = 'pg_code';
const LS_LANG     = 'pg_language';
const LS_REVIEW   = 'pg_review';
 
const ShareIcon = ({ size = 15, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    <polyline points="16 6 12 2 8 6" />
    <line x1="12" y1="2" x2="12" y2="15" />
  </svg>
);

export default function Playground() {
  const [code, setCode]         = useState<string>(() => localStorage.getItem(LS_CODE) ?? '');
  const [language, setLanguage] = useState<string>(() => localStorage.getItem(LS_LANG) ?? 'javascript');
  const [review, setReview]     = useState<Review | null>(() => {
    try { const s = localStorage.getItem(LS_REVIEW); return s ? JSON.parse(s) as Review : null; } catch { return null; }
  });
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [activeTab, setActiveTab] = useState<'overview'|'issues'|'improvements'|'details'>('overview');
  const [expandedIssue, setExpandedIssue] = useState<number | null>(null);
  const [isCopied, setIsCopied]   = useState(false);

  useEffect(() => { localStorage.setItem(LS_CODE,   code);                         }, [code]);
  useEffect(() => { localStorage.setItem(LS_LANG,   language);                     }, [language]);
  useEffect(() => { review ? localStorage.setItem(LS_REVIEW, JSON.stringify(review)) : localStorage.removeItem(LS_REVIEW); }, [review]);

  // Handle shared link
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('share');
    if (slug) {
      setLoading(true);
      api.reviews.getShared(slug)
        .then(result => {
          setReview(result as Review);
          if ('code' in (result as any)) setCode((result as any).code);
        })
        .catch(e => setError(e.message))
        .finally(() => setLoading(false));
    }
  }, []);

  async function handleAutoDetect() {
    if (!code || code.length < 10) return;
    try {
      const { language: detected } = await api.reviews.detectLanguage(code);
      if (detected && detected !== language) setLanguage(detected);
    } catch { /* fail silently */ }
  }

  async function handleShare() {
    if (!review?.review_id) return;
    try {
      const { slug } = await api.reviews.share(review.review_id);
      const url = `${window.location.origin}/playground?share=${slug}`;
      await navigator.clipboard.writeText(url);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (e) {
      alert('Failed to generate share link');
    }
  }

  async function handleReview() {
    if (!code.trim() || code.length < 10) {
      setError('Paste at least 10 characters of code.');
      return;
    }
    setLoading(true);
    setError('');
    setReview(null);
    setActiveTab('overview');
    setExpandedIssue(null);
    try {
      const result = await api.playground.review({ code, language });
      setReview(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review failed.');
    } finally {
      setLoading(false);
    }
  }

  const risk    = review ? RISK_CONFIG[review.risk_level as keyof typeof RISK_CONFIG]  ?? RISK_CONFIG.medium  : null;
  const grade   = review ? GRADE_CONFIG[review.grade] ?? GRADE_CONFIG.C : null;
  const criticalCount = review?.comments.filter(c => c.severity === 'critical').length ?? 0;
  const highCount     = review?.comments.filter(c => c.severity === 'high').length     ?? 0;

  const TAB_STYLE = (active: boolean): React.CSSProperties => ({
    padding: '0.4rem 0.875rem',
    borderRadius: 0,
    fontSize: '0.75rem',
    fontWeight: 500,
    cursor: 'pointer',
    border: 'none',
    background: active ? 'var(--red-dim)' : 'transparent',
    color: active ? '#ef4444' : 'rgba(255,255,255,0.35)',
    transition: 'all 0.2s',
  });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingTop: '6rem', paddingBottom: '3rem' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 1.5rem' }}>

        {/* Header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={{ fontSize: '0.65rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.15em', margin: '0 0 0.4rem' }}>Playground</p>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>Instant code review</h1>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-2)', margin: '0.3rem 0 0' }}>No account needed · Powered by Llama 3.3 70B · Results stored in MySQL</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'stretch' }}>

          {/* ── LEFT: Editor ── */}
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              background: 'var(--bg-1)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 0,
              overflow: 'hidden',
            }}>
              {/* Editor toolbar */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.75rem 1rem',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(0,0,0,0.2)',
              }}>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  {['#f87171','#fbbf24','#34d399'].map(c => (
                    <div key={c} style={{ width: '10px', height: '10px', borderRadius: '50%', background: c, opacity: 0.6 }} />
                  ))}
                </div>
                <select
                  value={language}
                  onChange={e => setLanguage(e.target.value)}
                  style={{
                    background: 'var(--bg-2)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 0,
                    color: 'var(--text-2)',
                    fontSize: '0.75rem',
                    padding: '0.25rem 0.75rem',
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  {LANGUAGES.map(l => (
                    <option key={l} value={l} style={{ background: '#111' }}>{l}</option>
                  ))}
                </select>
              </div>

              <textarea
                value={code}
                onChange={e => setCode(e.target.value)}
                onBlur={handleAutoDetect}
                placeholder={PLACEHOLDER}
                spellCheck={false}
                style={{
                  width: '100%',
                  flex: 1,
                  minHeight: '460px',
                  background: 'transparent', resize: 'vertical',
                  outline: 'none', border: 'none',
                  fontFamily: 'ui-monospace, "Cascadia Code", monospace',
                  fontSize: '0.8125rem', color: 'rgba(255,255,255,0.75)',
                  padding: '1.25rem', lineHeight: '1.7',
                  boxSizing: 'border-box',
                }}
              />

              {/* Editor footer */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.75rem 1rem',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(0,0,0,0.15)',
              }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-3)', "fontFamily": "'Geist Mono', monospace" }}>
                  {code.length > 0 ? `${code.length.toLocaleString()} chars · ${code.split('\n').length} lines` : 'ready'}
                </span>
                <button
                  onClick={handleReview}
                  disabled={loading}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.6rem 1.375rem',
                    background: loading ? 'var(--accent-dim)' : 'var(--red)',
                    border: 'none', borderRadius: 0,
                    color: '#fff', fontSize: '0.8125rem', fontWeight: 500,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {loading ? (
                    <>
                      <span style={{ width: '12px', height: '12px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                      Analyzing…
                    </>
                  ) : (
                    <>Review code <span style={{ opacity: 0.7, display: 'flex', alignItems: 'center' }}><ArrowUpRight /></span></>
                  )}
                </button>
              </div>
            </div>

            {/* Quick tips */}
            {!review && !loading && (
              <div style={{ marginTop: '0.75rem', padding: '1rem', background: 'var(--accent-dim)', border: '1px solid var(--accent-dim)', borderRadius: 0 }}>
                <p style={{ fontSize: '0.6rem', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 0.5rem' }}>What gets analyzed</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  {[
                    { icon: <SecurityIcon />, label: 'Security vulnerabilities' },
                    { icon: <BugIcon />,      label: 'Logic bugs & errors'      },
                    { icon: <ZapIcon />,      label: 'Performance bottlenecks'  },
                    { icon: <BookIcon />,     label: 'Readability issues'       },
                    { icon: <FlaskIcon />,    label: 'Test coverage gaps'       },
                    { icon: <CodeIcon />,     label: 'Code smells & complexity' },
                  ].map(item => (
                    <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ color: 'var(--accent)', opacity: 0.8, display: 'flex', alignItems: 'center' }}>{item.icon}</span>
                      <span style={{ fontSize: '0.725rem', color: 'var(--text-2)' }}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT: Results ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

            {error && (
              <Card style={{ border: '1px solid rgba(248,113,113,0.2)', background: 'rgba(248,113,113,0.05)' }}>
                <p style={{ color: '#f87171', fontSize: '0.875rem', margin: 0 }}>{error}</p>
              </Card>
            )}

            {/* Empty state */}
            {!review && !loading && !error && (
              <Card style={{ padding: '3rem 2rem', textAlign: 'center' }}>
                <div style={{ width: '3rem', height: '3rem', borderRadius: 0, background: 'var(--accent-dim)', border: '1px solid var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', color: 'var(--accent)' }}>
                  <CommandIcon />
                </div>
                <p style={{ color: 'var(--text-2)', fontSize: '0.9375rem', fontWeight: 500, margin: '0 0 0.5rem' }}>Your deep review will appear here</p>
                <p style={{ color: 'var(--text-3)', fontSize: '0.8125rem', margin: 0, lineHeight: 1.6 }}>
                  Paste code on the left and hit Review.<br />
                  Security issues, bugs, improvements and more.
                </p>
              </Card>
            )}

            {/* Loading state */}
            {loading && (
              <Card style={{ padding: '3rem 2rem', textAlign: 'center' }}>
                <div style={{ position: 'relative', width: '3rem', height: '3rem', margin: '0 auto 1.25rem' }}>
                  <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid var(--accent-dim)', borderTopColor: 'var(--red)', animation: 'spin 0.8s linear infinite' }} />
                  <div style={{ position: 'absolute', inset: '6px', borderRadius: '50%', border: '2px solid var(--accent-dim)', borderBottomColor: '#ef4444', animation: 'spin 1.2s linear infinite reverse' }} />
                </div>
                <p style={{ color: 'var(--text-2)', fontSize: '0.875rem', margin: '0 0 0.25rem' }}>Analyzing your code…</p>
                <p style={{ color: 'var(--text-3)', fontSize: '0.75rem', margin: 0 }}>Running security, performance & quality checks</p>
              </Card>
            )}

            {review && (
              <>
                {/* ── Hero score bar ── */}
                <Card style={{ padding: '1.25rem', position: 'relative' }}>
                  {review.review_id && (
                    <button onClick={handleShare} style={{ position: 'absolute', top: '1rem', right: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.8rem', background: 'var(--red-dim)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 0, color: '#ef4444', fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s', zIndex: 10 }}>
                      {isCopied ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      ) : <ShareIcon color="#ef4444" />}
                      <span>{isCopied ? 'Copied' : 'Share'}</span>
                    </button>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>

                    {/* Grade badge */}
                    <div style={{
                      width: '3.5rem', height: '3.5rem', borderRadius: 0, flexShrink: 0,
                      background: grade?.bg, border: `1px solid ${grade?.color}40`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1.5rem', fontWeight: 700, color: grade?.color,
                    }}>
                      {review.grade}
                    </div>

                    {/* Score + summary */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.375rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '1.375rem', fontWeight: 700, color: scoreColor(review.scores.overall) }}>
                          {review.scores.overall.toFixed(1)}<span style={{ fontSize: '0.75rem', color: 'var(--text-3)', fontWeight: 400 }}>/10</span>
                        </span>
                        <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem', borderRadius: 0, fontWeight: 500, color: risk?.color, background: risk?.bg }}>
                          {risk?.label}
                        </span>
                        {criticalCount > 0 && (
                          <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem', borderRadius: 0, background: 'rgba(248,113,113,0.1)', color: '#f87171' }}>
                            {criticalCount} critical
                          </span>
                        )}
                        {highCount > 0 && (
                          <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem', borderRadius: 0, background: 'rgba(251,146,60,0.1)', color: '#fb923c' }}>
                            {highCount} high
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: '0.8125rem', color: 'var(--text-2)', margin: 0, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {review.summary}
                      </p>
                    </div>
                  </div>
                </Card>

                {/* ── Metrics strip ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                  {[
                    { label: 'Lines',       value: review.metrics?.lines_analyzed ?? '—' },
                    { label: 'Complexity',  value: review.metrics?.estimated_complexity ?? '—' },
                    { label: 'Smells',      value: review.metrics?.code_smell_count ?? 0, color: (review.metrics?.code_smell_count ?? 0) > 3 ? '#fbbf24' : undefined },
                    { label: 'Sec Issues',  value: review.metrics?.security_issue_count ?? 0, color: (review.metrics?.security_issue_count ?? 0) > 0 ? '#f87171' : undefined },
                  ].map(m => (
                    <div key={m.label} style={{ background: 'var(--bg-1)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 0, padding: '0.75rem', textAlign: 'center' }}>
                      <p style={{ fontSize: '1rem', fontWeight: 600, color: m.color ?? '#fff', margin: '0 0 0.2rem' }}>{m.value}</p>
                      <p style={{ fontSize: '0.6rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>{m.label}</p>
                    </div>
                  ))}
                </div>

                {/* ── Score breakdown ── */}
                <Card>
                  <SectionLabel>Score breakdown</SectionLabel>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                    <ScoreBar label="Correctness"     score={review.scores.correctness} />
                    <ScoreBar label="Security"        score={review.scores.security} />
                    <ScoreBar label="Readability"     score={review.scores.readability} />
                    <ScoreBar label="Performance"     score={review.scores.performance} />
                    <ScoreBar label="Maintainability" score={review.scores.maintainability} />
                  </div>
                </Card>

                {/* ── Tabs ── */}
                <div style={{ display: 'flex', gap: '0.25rem', padding: '0.25rem', background: 'var(--bg-1)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 0 }}>
                  {([
                    { key: 'overview',     label: 'Overview' },
                    { key: 'issues',       label: `Issues (${review.comments.length})` },
                    { key: 'improvements', label: `Fixes (${review.improvements?.length ?? 0})` },
                    { key: 'details',      label: 'Details' },
                  ] as { key: typeof activeTab; label: string }[]).map(tab => (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={TAB_STYLE(activeTab === tab.key)}>
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* ── Tab: Overview ── */}
                {activeTab === 'overview' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

                    {/* Strengths */}
                    {review.strengths?.length > 0 && (
                      <Card>
                        <SectionLabel>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                            What's good
                          </span>
                        </SectionLabel>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {review.strengths.map((s, i) => (
                            <div key={i} style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start' }}>
                              <span style={{ color: '#34d399', marginTop: '0.2rem', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                              </span>
                              <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.55)', margin: 0, lineHeight: 1.5 }}>{s}</p>
                            </div>
                          ))}
                        </div>
                      </Card>
                    )}

                    {/* Critical issues */}
                    {review.critical_issues?.length > 0 && (
                      <Card style={{ border: '1px solid rgba(248,113,113,0.15)' }}>
                        <SectionLabel>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                            Critical issues
                          </span>
                        </SectionLabel>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                          {review.critical_issues.map((issue, i) => (
                            <div
                              key={i}
                              style={{
                                borderRadius: 0, overflow: 'hidden',
                                border: '1px solid rgba(248,113,113,0.12)',
                                cursor: 'pointer',
                              }}
                              onClick={() => setExpandedIssue(expandedIssue === i ? null : i)}
                            >
                              <div style={{ padding: '0.75rem 1rem', background: 'rgba(248,113,113,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <p style={{ fontSize: '0.8125rem', fontWeight: 500, color: '#fca5a5', margin: 0 }}>{issue.title}</p>
                                <span style={{ color: 'var(--text-3)', fontSize: '0.75rem', display: 'flex', alignItems: 'center' }}>
                                  {expandedIssue === i ? (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
                                  ) : (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                                  )}
                                </span>
                              </div>
                              {expandedIssue === i && (
                                <div style={{ padding: '0.875rem 1rem', background: 'rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                                  <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', margin: 0, lineHeight: 1.55 }}>{issue.explanation}</p>
                                  <div style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.12)', borderRadius: 0, padding: '0.625rem 0.875rem' }}>
                                    <p style={{ fontSize: '0.65rem', color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.375rem' }}>Impact if ignored</p>
                                    <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.45)', margin: 0 }}>{issue.impact}</p>
                                  </div>
                                  <div style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.12)', borderRadius: 0, padding: '0.625rem 0.875rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
                                      <p style={{ fontSize: '0.65rem', color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Fix</p>
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(issue.fix); }}
                                        style={{ background: 'rgba(52,211,153,0.15)', border: 'none', borderRadius: '4px', color: '#34d399', fontSize: '0.6rem', padding: '0.2rem 0.4rem', cursor: 'pointer' }}
                                      >Copy</button>
                                    </div>
                                    <pre style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.55)', margin: 0, whiteSpace: 'pre-wrap', "fontFamily": "'Geist Mono', monospace", lineHeight: 1.5 }}>{issue.fix}</pre>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </Card>
                    )}
                  </div>
                )}

                {/* ── Tab: Issues ── */}
                {activeTab === 'issues' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {review.comments.length === 0 ? (
                      <Card style={{ textAlign: 'center', padding: '2.5rem' }}>
                        <p style={{ color: '#34d399', margin: '0 auto 0.75rem', display: 'flex', justifyContent: 'center' }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        </p>
                        <p style={{ color: 'var(--text-2)', fontSize: '0.875rem', margin: 0 }}>No individual issues found.</p>
                      </Card>
                    ) : (
                      review.comments.map((c, i) => {
                        const sev = SEVERITY_CONFIG[c.severity];
                        return (
                          <div
                            key={i}
                            style={{
                              background: sev.bg, border: `1px solid ${sev.border}`,
                              borderRadius: 0, padding: '0.875rem 1rem',
                              cursor: c.suggestion ? 'pointer' : 'default',
                              transition: 'border-color 0.2s',
                            }}
                            onClick={() => c.suggestion && setExpandedIssue(expandedIssue === i + 1000 ? null : i + 1000)}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: sev.dot, flexShrink: 0 }} />
                                <span style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: sev.color }}>{sev.label}</span>
                                {c.filename && <span style={{ fontSize: '0.7rem', color: 'var(--text-3)', "fontFamily": "'Geist Mono', monospace" }}>{c.filename}{c.line_start ? `:${c.line_start}` : ''}</span>}
                              </div>
                              <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                {c.categories.slice(0, 2).map(cat => (
                                  <span key={cat} style={{ fontSize: '0.6rem', padding: '0.15rem 0.5rem', borderRadius: 0, background: 'var(--bg-2)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                    {cat}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <p style={{ fontSize: '0.8125rem', color: 'var(--text-2)', margin: 0, lineHeight: 1.55 }}>{c.content}</p>
                            {c.suggestion && expandedIssue === i + 1000 && (
                              <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: `1px solid ${sev.border}` }}>
                                <p style={{ fontSize: '0.65rem', color: sev.color, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.375rem' }}>Suggestion</p>
                                <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.45)', margin: 0, lineHeight: 1.55 }}>{c.suggestion}</p>
                              </div>
                            )}
                            {c.suggestion && expandedIssue !== i + 1000 && (
                              <p style={{ fontSize: '0.7rem', color: 'var(--text-3)', margin: '0.5rem 0 0', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                Click for suggestion 
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                              </p>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* ── Tab: Improvements ── */}
                {activeTab === 'improvements' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {(review.improvements?.length ?? 0) === 0 ? (
                      <Card style={{ textAlign: 'center', padding: '2.5rem' }}>
                        <p style={{ color: 'var(--text-2)', fontSize: '0.875rem', margin: 0 }}>No non-critical improvements suggested.</p>
                      </Card>
                    ) : (
                      review.improvements.map((imp, i) => (
                        <Card key={i}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.625rem' }}>
                            <span style={{ width: '1.5rem', height: '1.5rem', borderRadius: '50%', background: 'var(--accent-dim)', border: '1px solid var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 600, flexShrink: 0 }}>
                              {i + 1}
                            </span>
                            <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'rgba(255,255,255,0.75)', margin: 0 }}>{imp.title}</p>
                          </div>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', margin: '0 0 0.875rem', lineHeight: 1.55 }}>{imp.explanation}</p>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
                            <div style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.12)', borderRadius: 0, padding: '0.75rem' }}>
                              <p style={{ fontSize: '0.6rem', color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.375rem' }}>Before</p>
                              <pre style={{ fontSize: '0.7rem', color: 'var(--text-2)', margin: 0, whiteSpace: 'pre-wrap', "fontFamily": "'Geist Mono', monospace", lineHeight: 1.5 }}>{imp.before}</pre>
                            </div>
                            <div style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.12)', borderRadius: 0, padding: '0.75rem' }}>
                              <p style={{ fontSize: '0.6rem', color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.375rem' }}>After</p>
                              <pre style={{ fontSize: '0.7rem', color: 'var(--text-2)', margin: 0, whiteSpace: 'pre-wrap', "fontFamily": "'Geist Mono', monospace", lineHeight: 1.5 }}>{imp.after}</pre>
                            </div>
                          </div>
                        </Card>
                      ))
                    )}
                  </div>
                )}

                {/* ── Tab: Details ── */}
                {activeTab === 'details' && (
                  <Card>
                    <SectionLabel>Full summary</SectionLabel>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', lineHeight: 1.7, margin: '0 0 1.25rem' }}>{review.summary}</p>
                    <SectionLabel>Analysis metadata</SectionLabel>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {[
                        { label: 'Lines analyzed',      value: review.metrics?.lines_analyzed ?? '—' },
                        { label: 'Complexity',          value: review.metrics?.estimated_complexity ?? '—' },
                        { label: 'Test coverage hint',  value: review.metrics?.test_coverage_hint ?? '—' },
                        { label: 'Code smell count',    value: review.metrics?.code_smell_count ?? 0 },
                        { label: 'Security issues',     value: review.metrics?.security_issue_count ?? 0 },
                        { label: 'Language',            value: language },
                        { label: 'Model',               value: 'Llama 3.3 70B (Groq)' },
                      ].map(row => (
                        <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>{row.label}</span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-2)', "fontFamily": "'Geist Mono', monospace" }}>{String(row.value)}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        textarea::placeholder { color: rgba(255,255,255,0.12); }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}
