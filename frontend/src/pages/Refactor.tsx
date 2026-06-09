import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Link } from 'react-router-dom';
import { storageGet, storageSet, storageClear } from '../lib/storage';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface IndexedRepo {
  repo_id: number;
  name: string;
  full_name: string;
  status: string;
  chunk_count: number;
}

interface RefactorOpportunity {
  id: string;
  title: string;
  type: string;
  priority: 'high' | 'medium' | 'low';
  rationale: string;
  citation_id: string | null;
  before: string;
  after: string;
  impact: { readability: string; performance: string; maintainability: string; testability: string };
  caveats: string;
}

interface CitationSource {
  corpusName: string;
  filePath: string;
  startLine: number;
  endLine: number;
  displayLabel: string;
}

interface RefactorResult {
  summary: string;
  confidence: number;
  estimated_effort: 'low' | 'medium' | 'high';
  refactoring_opportunities: RefactorOpportunity[];
  consistency_notes: string[];
  similar_patterns_found: Array<{ description: string; file_reference: string; citation_id: string }>;
  rag_context: { chunksRetrieved: number; ragLatencyMs: number; llmLatencyMs: number };
  citation_map: Record<string, CitationSource>;
}

const TYPE_LABELS: Record<string, string> = {
  extract_function: 'Extract Function',
  extract_class: 'Extract Class',
  simplify_logic: 'Simplify Logic',
  improve_naming: 'Improve Naming',
  remove_duplication: 'Remove Duplication',
  add_abstraction: 'Add Abstraction',
  improve_error_handling: 'Error Handling',
  optimize_performance: 'Performance',
  improve_typing: 'Typing',
  split_responsibility: 'Split Responsibility',
};

const PRIORITY_COLORS = { high: '#f87171', medium: '#fbbf24', low: '#4ade80' };

const EFFORT_LABEL = { low: '< 1 hour', medium: '1–4 hours', high: '4+ hours' };

const EXAMPLE_SNIPPETS = [
  {
    lang: 'typescript',
    label: 'AuthService snippet',
    code: `async function authenticateUser(email: string, password: string) {
  const result = await db.query("SELECT * FROM users WHERE email = '" + email + "'");
  if (result.rows.length === 0) return null;
  const user = result.rows[0];
  if (user.password !== password) return null;
  const token = Math.random().toString(36);
  await db.query("UPDATE users SET token = '" + token + "' WHERE id = " + user.id);
  return { user, token };
}`,
  },
  {
    lang: 'javascript',
    label: 'React component',
    code: `function UserList() {
  const [users, setUsers] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  React.useEffect(() => {
    setLoading(true);
    fetch('/api/users').then(r => r.json()).then(data => {
      setUsers(data);
      setLoading(false);
    }).catch(e => {
      setError(e.message);
      setLoading(false);
    });
  }, []);
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  return <ul>{users.map(u => <li key={u.id}>{u.name}</li>)}</ul>;
}`,
  },
];

function ImpactBadge({ label, value }: { label: string; value: string }) {
  const color = value === 'improved' ? '#4ade80' : value === 'degraded' ? '#f87171' : 'var(--text-3)';
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: '0.55rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.2rem' }}>{label}</p>
      <p style={{ fontSize: '0.6875rem', color, fontWeight: 600 }}>{value}</p>
    </div>
  );
}

interface RefactorPersistedState {
  code: string;
  language: string;
  selectedRepoId: number | '';
}

export default function Refactor() {
  const { token } = useAuth();
  const [repos, setRepos] = useState<IndexedRepo[]>([]);

  // ── Restore persisted state ──
  const persisted = storageGet<RefactorPersistedState>('refactor');
  const [selectedRepoId, setSelectedRepoId] = useState<number | ''>(persisted?.selectedRepoId ?? '');
  const [code, setCode] = useState(persisted?.code ?? '');
  const [language, setLanguage] = useState(persisted?.language ?? 'typescript');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RefactorResult | null>(null);
  const [error, setError] = useState('');
  const [activeOppIdx, setActiveOppIdx] = useState(0);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // ── Persistence ──
  const persist = useCallback(() => {
    storageSet('refactor', { code, language, selectedRepoId } as RefactorPersistedState);
  }, [code, language, selectedRepoId]);

  useEffect(() => { if (code) persist(); }, [code, language, selectedRepoId]);

  useEffect(() => {
    fetch(`${API}/api/rag/repos`, { headers })
      .then(r => r.ok ? r.json() : [])
      .then((data: IndexedRepo[]) => setRepos(data.filter(r => r.status === 'ready')));
  }, []);

  async function analyze() {
    if (!code.trim()) { setError('Paste some code first'); return; }
    setLoading(true);
    setError('');
    setResult(null);
    setActiveOppIdx(0);
    try {
      const res = await fetch(`${API}/api/refactor`, {
        method: 'POST', headers,
        body: JSON.stringify({ code, language, repoId: selectedRepoId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Analysis failed'); return; }
      setResult(data);
    } catch (e) {
      setError('Network error — is the backend running?');
    } finally {
      setLoading(false);
    }
  }

  const opp = result?.refactoring_opportunities?.[activeOppIdx];

  function handleClear() {
    storageClear('refactor');
    setCode('');
    setLanguage('typescript');
    setSelectedRepoId('');
    setResult(null);
    setError('');
    setActiveOppIdx(0);
  }

  const hasContent = !!code || !!result;

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100dvh', paddingTop: '52px' }}>
      <style>{`
        .diff-before { background: rgba(248,113,113,0.07); border-left: 2px solid rgba(248,113,113,0.5); }
        .diff-after  { background: rgba(74,222,128,0.07); border-left: 2px solid rgba(74,222,128,0.5); }
      `}</style>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '3rem 1.5rem' }}>
        {/* Header */}
        <div style={{ marginBottom: '2.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span className="label" style={{ display: 'block', marginBottom: '0.75rem' }}>// Refactor Intelligence</span>
            <h1 className="heading" style={{ marginBottom: '0.75rem' }}>Evidence-backed refactoring</h1>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-2)', maxWidth: '620px' }}>
              Paste a code snippet. Codex retrieves similar patterns from your indexed codebase and past review findings,
              then generates RAG-grounded refactoring recommendations with before/after diffs.
            </p>
          </div>
          {hasContent && (
            <button
              onClick={handleClear}
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--text-3)',
                fontFamily: 'var(--font)',
                fontSize: '10px',
                fontWeight: 500,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '4px 12px',
                cursor: 'pointer',
                transition: 'border-color 0.15s, color 0.15s',
                flexShrink: 0,
                marginTop: '0.25rem',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'var(--border-2)';
                e.currentTarget.style.color = 'var(--text-2)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.color = 'var(--text-3)';
              }}
            >
              // Clear
            </button>
          )}
        </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: '1.5rem', alignItems: 'start' }}>
          {/* Left — Input panel */}
          <div>
            {/* Toolbar */}
            <div style={{ marginBottom: '0.75rem' }}>
              <p style={{ fontSize: '0.65rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>Add codebase context (optional)</p>
              <p style={{ fontSize: '0.6rem', color: 'var(--text-3)', marginBottom: '0.5rem' }}>
                Select an indexed repo to ground the refactor suggestions in your actual codebase patterns. Leave empty to use OWASP standards only.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem', alignItems: 'center' }}>
              <select
                value={language}
                onChange={e => setLanguage(e.target.value)}
                style={{ padding: '0.375rem 0.625rem', fontSize: '0.6875rem' }}
              >
                {['typescript', 'javascript', 'python', 'java', 'go', 'rust', 'cpp', 'php', 'ruby', 'sql'].map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>

              {repos.length > 0 && (
                <select
                  value={selectedRepoId}
                  onChange={e => setSelectedRepoId(e.target.value ? Number(e.target.value) : '')}
                  style={{ padding: '0.375rem 0.625rem', fontSize: '0.6875rem' }}
                >
                  <option value="">No repo (general)</option>
                  {repos.map(r => (
                    <option key={r.repo_id} value={r.repo_id}>{r.name}</option>
                  ))}
                </select>
              )}

              {repos.length === 0 && (
                <Link to="/index-manager" style={{ fontSize: '0.6rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', textDecoration: 'none' }}>
                  + Index a repo for deeper analysis
                </Link>
              )}
            </div>

            {/* Example snippet buttons */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.6rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', alignSelf: 'center' }}>Try:</span>
              {EXAMPLE_SNIPPETS.map(ex => (
                <button
                  key={ex.label}
                  onClick={() => { setCode(ex.code); setLanguage(ex.lang); }}
                  className="btn-ghost"
                  style={{ padding: '0.2rem 0.5rem', fontSize: '0.6rem' }}
                >
                  {ex.label}
                </button>
              ))}
            </div>

            {/* Code editor */}
            <div style={{ border: '1px solid var(--border)', position: 'relative' }}>
              <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="label">Code to refactor</span>
                {code && (
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-3)' }}>
                    {code.split('\n').length} lines
                  </span>
                )}
              </div>
              <textarea
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder={`Paste ${language} code here…`}
                style={{
                  width: '100%', minHeight: '340px', padding: '1rem',
                  fontFamily: 'inherit', fontSize: '0.8rem', lineHeight: '1.7',
                  resize: 'vertical', display: 'block',
                  background: 'var(--bg)',
                }}
              />
            </div>

            {error && (
              <div style={{ marginTop: '0.75rem', padding: '0.75rem 1rem', background: 'var(--red-dim)', border: '1px solid var(--red-border)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--red)' }}>{error}</span>
              </div>
            )}

            <button
              onClick={analyze}
              disabled={loading || !code.trim()}
              className="btn-primary"
              style={{ marginTop: '0.875rem', width: '100%', justifyContent: 'center', opacity: (loading || !code.trim()) ? 0.5 : 1 }}
            >
              {loading ? (
                <><div className="loader" style={{ marginRight: '0.5rem' }} /> Analyzing…</>
              ) : (
                <>Analyze for refactoring →</>
              )}
            </button>

            {/* RAG metadata */}
            {result?.rag_context && (
              <div style={{ marginTop: '0.875rem', display: 'flex', gap: '1.5rem', padding: '0.75rem 1rem', background: 'var(--bg-1)', border: '1px solid var(--border)' }}>
                {[
                  { label: 'Context chunks', value: result.rag_context.chunksRetrieved },
                  { label: 'Retrieval', value: `${result.rag_context.ragLatencyMs}ms` },
                  { label: 'LLM', value: `${result.rag_context.llmLatencyMs}ms` },
                ].map(m => (
                  <div key={m.label}>
                    <p style={{ fontSize: '0.55rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{m.label}</p>
                    <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-1)' }}>{m.value}</p>
                  </div>
                ))}
                <div>
                  <p style={{ fontSize: '0.55rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Confidence</p>
                  <p style={{ fontSize: '0.875rem', fontWeight: 600, color: result.confidence >= 0.7 ? '#4ade80' : result.confidence >= 0.4 ? '#fbbf24' : '#f87171' }}>
                    {Math.round(result.confidence * 100)}%
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Right — Results panel */}
          <div>
            {!result && !loading && (
              <div style={{ padding: '4rem 2rem', textAlign: 'center', border: '1px solid var(--border)', background: 'var(--bg-1)' }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', marginBottom: '0.5rem' }}>No analysis yet.</p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-3)', lineHeight: '1.6' }}>
                  Paste some code on the left and click Analyze. Codex will retrieve similar patterns from your indexed codebase to ground its suggestions.
                </p>
              </div>
            )}

            {loading && (
              <div style={{ padding: '4rem 2rem', textAlign: 'center', border: '1px solid var(--border)', background: 'var(--bg-1)' }}>
                <div className="loader" style={{ margin: '0 auto 1rem' }} />
                <p style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>
                  Retrieving codebase patterns…<br />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Then generating evidence-backed suggestions</span>
                </p>
              </div>
            )}

            {result && (
              <div style={{ animation: 'fadeUp 0.4s ease forwards' }}>
                {/* Summary */}
                <div style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', padding: '1.25rem 1.5rem', marginBottom: '1px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <span className="label">Summary</span>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <span className="tag">Effort: {EFFORT_LABEL[result.estimated_effort]}</span>
                      <span className="tag">{result.refactoring_opportunities?.length || 0} opportunities</span>
                    </div>
                  </div>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-2)', lineHeight: '1.7' }}>{result.summary}</p>
                </div>

                {/* Opportunity tabs */}
                {result.refactoring_opportunities?.length > 0 && (
                  <div style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', marginBottom: '1px' }}>
                    {/* Tab bar */}
                    <div style={{ borderBottom: '1px solid var(--border)', display: 'flex', overflowX: 'auto' }}>
                      {result.refactoring_opportunities.map((o, i) => (
                        <button
                          key={o.id}
                          onClick={() => setActiveOppIdx(i)}
                          style={{
                            padding: '0.625rem 1rem', background: 'none', border: 'none', cursor: 'pointer',
                            borderBottom: i === activeOppIdx ? '2px solid var(--red)' : '2px solid transparent',
                            fontSize: '0.6rem', color: i === activeOppIdx ? 'var(--text-1)' : 'var(--text-3)',
                            textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'inherit',
                            whiteSpace: 'nowrap', flexShrink: 0,
                            transition: 'color 0.15s',
                          }}
                        >
                          <span style={{ color: PRIORITY_COLORS[o.priority], marginRight: '0.3rem' }}>●</span>
                          {o.id}
                        </button>
                      ))}
                    </div>

                    {/* Active opportunity detail */}
                    {opp && (
                      <div style={{ padding: '1.25rem 1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.875rem' }}>
                          <div>
                            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-1)', marginBottom: '0.25rem' }}>{opp.title}</p>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <span className="tag">{TYPE_LABELS[opp.type] || opp.type}</span>
                              <span className="tag" style={{ color: PRIORITY_COLORS[opp.priority], borderColor: PRIORITY_COLORS[opp.priority] + '44', background: PRIORITY_COLORS[opp.priority] + '11' }}>
                                {opp.priority} priority
                              </span>
                              {opp.citation_id && (
                                <span className="tag tag-red" title={result.citation_map?.[opp.citation_id]?.displayLabel}>
                                  Grounded: {opp.citation_id}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', lineHeight: '1.6', marginBottom: '1rem' }}>{opp.rationale}</p>

                        {/* Impact grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.5rem', marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg-2)', border: '1px solid var(--border)' }}>
                          <ImpactBadge label="Readability" value={opp.impact?.readability} />
                          <ImpactBadge label="Performance" value={opp.impact?.performance} />
                          <ImpactBadge label="Maintainability" value={opp.impact?.maintainability} />
                          <ImpactBadge label="Testability" value={opp.impact?.testability} />
                        </div>

                        {/* Before / After diff */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', border: '1px solid var(--border)' }}>
                          <div>
                            <div style={{ padding: '0.4rem 0.75rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-2)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span style={{ color: '#f87171', fontSize: '0.75rem' }}>−</span>
                              <span className="label" style={{ color: 'var(--text-3)' }}>Before</span>
                            </div>
                            <pre className="diff-before" style={{ padding: '0.875rem', fontSize: '0.7rem', lineHeight: '1.7', color: 'var(--text-2)', fontFamily: 'inherit', overflow: 'auto', margin: 0, minHeight: '80px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                              {opp.before || '—'}
                            </pre>
                          </div>
                          <div>
                            <div style={{ padding: '0.4rem 0.75rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-2)', display: 'flex', alignItems: 'center', gap: '0.4rem', borderLeft: '1px solid var(--border)' }}>
                              <span style={{ color: '#4ade80', fontSize: '0.75rem' }}>+</span>
                              <span className="label" style={{ color: 'var(--text-3)' }}>After</span>
                            </div>
                            <pre className="diff-after" style={{ padding: '0.875rem', fontSize: '0.7rem', lineHeight: '1.7', color: 'var(--text-2)', fontFamily: 'inherit', overflow: 'auto', margin: 0, minHeight: '80px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', borderLeft: '1px solid var(--border)' }}>
                              {opp.after || '—'}
                            </pre>
                          </div>
                        </div>

                        {opp.caveats && (
                          <div style={{ marginTop: '0.875rem', padding: '0.75rem', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)' }}>
                            <span style={{ fontSize: '0.6rem', color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.12em', display: 'block', marginBottom: '0.3rem' }}>⚠ Caution</span>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-2)', lineHeight: '1.6' }}>{opp.caveats}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Consistency notes */}
                {result.consistency_notes?.length > 0 && (
                  <div style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', padding: '1.25rem 1.5rem', marginBottom: '1px' }}>
                    <span className="label" style={{ display: 'block', marginBottom: '0.75rem' }}>Consistency notes</span>
                    {result.consistency_notes.map((note, i) => (
                      <div key={i} style={{ display: 'flex', gap: '0.625rem', marginBottom: i < result.consistency_notes.length - 1 ? '0.625rem' : 0 }}>
                        <span style={{ color: 'var(--red)', fontSize: '0.75rem', flexShrink: 0, marginTop: '1px' }}>›</span>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', lineHeight: '1.6' }}>{note}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Similar patterns */}
                {result.similar_patterns_found?.length > 0 && (
                  <div style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', padding: '1.25rem 1.5rem' }}>
                    <span className="label" style={{ display: 'block', marginBottom: '0.75rem' }}>Similar patterns found in codebase</span>
                    {result.similar_patterns_found.map((p, i) => (
                      <div key={i} style={{ display: 'flex', gap: '0.75rem', marginBottom: i < result.similar_patterns_found.length - 1 ? '0.75rem' : 0, paddingBottom: i < result.similar_patterns_found.length - 1 ? '0.75rem' : 0, borderBottom: i < result.similar_patterns_found.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <span className="tag tag-red" style={{ flexShrink: 0, alignSelf: 'flex-start' }}>{p.citation_id}</span>
                        <div>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', lineHeight: '1.6', marginBottom: '0.25rem' }}>{p.description}</p>
                          {p.file_reference && (
                            <p style={{ fontSize: '0.6875rem', color: 'var(--text-3)', fontFamily: 'inherit' }}>{p.file_reference}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
