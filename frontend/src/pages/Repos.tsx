import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';

interface GithubRepo {
  id: number;
  name: string;
  full_name: string;
  description?: string;
  language?: string;
  stars: number;
  forks: number;
  updated_at: string;
  private: boolean;
  codex_repo_id?: number;
  webhook_active?: boolean;
}

interface CodebaseAnalysis {
  scores: {
    overall: number;
    structure: number;
    code_quality: number;
    security: number;
    performance: number;
    maintainability: number;
    documentation: number;
    test_coverage: number;
    dependency_health: number;
  };
  grade: string;
  plain_english_summary: string;
  target_audience: string;
  how_to_run: string[];
  key_folders: Array<{ path: string; description: string }>;
  architecture_layers: Array<{
    layer_name: string;
    components: Array<{ name: string; description: string; technologies: string[] }>;
  }>;
  summary: string;
  architecture_notes: string;
  tech_stack: string[];
  languages_used: Array<{ name: string; percentage: number; bytes: number }>;
  strengths: string[];
  critical_issues: Array<{
    title: string; explanation: string;
    affected_files: string[]; priority: string;
  }>;
  recommendations: Array<{
    type: 'issue' | 'automation' | 'refactor';
    title: string; description: string;
    effort: string; impact: string;
    estimated_minutes: number; tags: string[];
  }>;
  unnecessary_code: Array<{ description: string; files: string[] }>;
  security_findings: Array<{
    title: string; severity: string;
    description: string; affected_files: string[];
  }>;
  file_insights: Array<{
    path: string; role: string;
    quality_note: string; issues: string[];
  }>;
}

interface RepoAnalysis {
  repo: {
    full_name: string; description?: string; language?: string;
    stars: number; forks: number; file_count: number;
    languages: Record<string, number>;
    sampled_files: { path: string; content: string }[];
    files: { path: string; type: string; size?: number }[];
    file_type_breakdown: Record<string, number>;
  };
  analysis: CodebaseAnalysis;
  is_public?: boolean;
}

type TabKey = 'about' | 'scores' | 'architecture' | 'security' | 'issues' | 'recommendations' | 'files';

function scoreColor(s: number): string {
  if (s >= 80) return '#4ade80';
  if (s >= 60) return '#fbbf24';
  if (s >= 40) return '#fb923c';
  return '#f87171';
}

function sevColor(sev: string): string {
  const map: Record<string, string> = {
    info: '#60a5fa', low: '#4ade80', medium: '#fbbf24',
    high: '#fb923c', critical: '#f87171',
  };
  return map[sev] || '#9ca3af';
}

function langColor(lang: string): string {
  const map: Record<string, string> = {
    TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572A5',
    Java: '#b07219', Go: '#00ADD8', Rust: '#dea584', 'C++': '#f34b7d',
    Ruby: '#701516', PHP: '#4F5D95', Swift: '#F05138', Kotlin: '#A97BFF',
    CSS: '#563d7c', HTML: '#e34c26', Shell: '#89e051',
  };
  return map[lang] || 'var(--red)';
}

const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ marginBottom: '2rem' }}>
    <p style={{ fontSize: '0.6rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: '1rem', paddingBottom: '0.625rem', borderBottom: '1px solid var(--border)' }}>
      // {label}
    </p>
    {children}
  </div>
);

const Tag = ({ children, color }: { children: React.ReactNode; color?: string }) => (
  <span style={{
    display: 'inline-block', padding: '0.15rem 0.5rem',
    background: color ? `${color}15` : 'var(--bg-3)',
    border: `1px solid ${color ? `${color}35` : 'var(--border-2)'}`,
    color: color || 'var(--text-3)',
    fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em',
  }}>
    {children}
  </span>
);

export default function Repos() {
  const { isAuthenticated } = useAuth();
  const [repos, setRepos]           = useState<GithubRepo[]>([]);
  const [filtered, setFiltered]     = useState<GithubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [search, setSearch]         = useState('');
  const [analyzing, setAnalyzing]   = useState<string | null>(null);
  const [analysis, setAnalysis]     = useState<RepoAnalysis | null>(null);
  const [activeTab, setActiveTab]   = useState<TabKey>('about');
  const [error, setError]           = useState('');
  const [publicUrl, setPublicUrl]   = useState('');
  const [recsTab, setRecsTab]       = useState<'all' | 'issue' | 'automation' | 'refactor'>('all');
  const [fileSearch, setFileSearch] = useState('');
  const [fileTypeFilter, setFileTypeFilter] = useState('all');
  const [expandedItem, setExpandedItem]     = useState<number | null>(null);
  const [webhookLoading, setWebhookLoading] = useState<number | null>(null);

  // Load GitHub repos if authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    setReposLoading(true);
    api.github.repos()
      .then(data => { setRepos(data as GithubRepo[]); setFiltered(data as GithubRepo[]); })
      .catch(() => {})
      .finally(() => setReposLoading(false));
  }, [isAuthenticated]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(repos.filter(r =>
      r.name.toLowerCase().includes(q) ||
      (r.description || '').toLowerCase().includes(q)
    ));
  }, [search, repos]);

  async function handleAnalyzeRepo(repo: GithubRepo) {
    setAnalyzing(repo.full_name);
    setAnalysis(null);
    setActiveTab('about');
    setExpandedItem(null);
    const [owner, name] = repo.full_name.split('/');
    try {
      const result = await api.github.analyzeRepo(owner, name);
      setAnalysis(result as RepoAnalysis);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setAnalyzing(null);
    }
  }

  async function handleInstallWebhook(repo: GithubRepo) {
    if (!repo.codex_repo_id) return;
    setWebhookLoading(repo.id);
    try {
      await api.prs.installWebhook(repo.codex_repo_id);
      // Refresh repo list to show checkmark
      const data = await api.github.repos();
      setRepos(data as GithubRepo[]);
      setFiltered(data as GithubRepo[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Webhook installation failed');
    } finally {
      setWebhookLoading(null);
    }
  }

  async function handleAnalyzePublic() {
    if (!publicUrl.trim()) return;
    const key = publicUrl.trim();
    setAnalyzing(key);
    setAnalysis(null);
    setActiveTab('about');
    setExpandedItem(null);
    setError('');
    try {
      const result = await api.github.analyzePublic(publicUrl.trim());
      setAnalysis(result as RepoAnalysis);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed. Check the URL and ensure the repo is public.');
    } finally {
      setAnalyzing(null);
    }
  }

  const a = analysis?.analysis;

  // File tree filtering
  const allFiles = useMemo(() =>
    (analysis?.repo.files || []).filter(f => f.type === 'file'),
    [analysis]
  );
  const fileTypes = useMemo(() => {
    const exts = new Set<string>();
    allFiles.forEach(f => {
      const ext = f.path.split('.').pop()?.toLowerCase();
      if (ext) exts.add(ext);
    });
    return Array.from(exts).sort();
  }, [allFiles]);
  const filteredFiles = useMemo(() => {
    let files = allFiles;
    if (fileTypeFilter !== 'all') files = files.filter(f => f.path.endsWith('.' + fileTypeFilter));
    if (fileSearch) files = files.filter(f => f.path.toLowerCase().includes(fileSearch.toLowerCase()));
    return files.slice(0, 200);
  }, [allFiles, fileTypeFilter, fileSearch]);

  const recsCounts = useMemo(() => ({
    all:        a?.recommendations?.length ?? 0,
    issue:      a?.recommendations?.filter(r => r.type === 'issue').length ?? 0,
    automation: a?.recommendations?.filter(r => r.type === 'automation').length ?? 0,
    refactor:   a?.recommendations?.filter(r => r.type === 'refactor').length ?? 0,
  }), [a]);

  const filteredRecs = useMemo(() =>
    recsTab === 'all'
      ? (a?.recommendations || [])
      : (a?.recommendations || []).filter(r => r.type === recsTab),
    [a, recsTab]
  );

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'about',           label: 'About'                             },
    { key: 'scores',          label: 'Scores'                            },
    { key: 'architecture',    label: 'Architecture'                      },
    { key: 'security',        label: `Security (${a?.security_findings?.length ?? 0})` },
    { key: 'issues',          label: `Issues (${a?.critical_issues?.length ?? 0})`     },
    { key: 'recommendations', label: `Actions (${a?.recommendations?.length ?? 0})`    },
    { key: 'files',           label: `Files (${allFiles.length})`        },
  ];

  const tabStyle = (key: TabKey): React.CSSProperties => ({
    padding: '0.5rem 1rem',
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: '0.6875rem', fontFamily: 'inherit',
    textTransform: 'uppercase', letterSpacing: '0.1em',
    color: activeTab === key ? 'var(--text-1)' : 'var(--text-3)',
    borderBottom: activeTab === key ? '1px solid var(--red)' : '1px solid transparent',
    transition: 'color 0.15s, border-color 0.15s',
    marginBottom: '-1px',
  });

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', paddingTop: '52px' }}>

      {/* ── Public URL bar ── */}
      <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-1)', padding: '1.25rem 1.5rem' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <p style={{ fontSize: '0.6rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: '0.75rem' }}>
            // Analyze any public repository — no login required
          </p>
          <div style={{ display: 'flex', gap: '0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, border: '1px solid var(--border-2)', borderRight: 'none', padding: '0 1rem', background: 'var(--bg-2)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.5">
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
              </svg>
              <input
                type="text"
                value={publicUrl}
                onChange={e => setPublicUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAnalyzePublic()}
                placeholder="https://github.com/owner/repo  or  owner/repo"
                style={{
                  flex: 1, background: 'none', border: 'none', padding: '0.875rem 0',
                  color: 'var(--text-1)', fontSize: '0.875rem', fontFamily: 'inherit', outline: 'none',
                }}
              />
            </div>
            <button
              onClick={handleAnalyzePublic}
              disabled={!!analyzing || !publicUrl.trim()}
              style={{
                padding: '0 1.75rem', background: analyzing ? 'rgba(196,30,30,0.5)' : 'var(--red)',
                border: '1px solid var(--red)', color: '#fff',
                fontSize: '0.75rem', fontFamily: 'inherit',
                textTransform: 'uppercase', letterSpacing: '0.12em',
                cursor: analyzing || !publicUrl.trim() ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0,
              }}
            >
              {analyzing ? <><span className="loader" style={{ width: '10px', height: '10px' }} />Analyzing</> : (
                <>
                  Analyze
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 1.5rem' }}>
        {error && (
          <div style={{ margin: '1rem 0', padding: '0.875rem 1rem', background: 'rgba(196,30,30,0.08)', border: '1px solid rgba(196,30,30,0.3)', color: '#f87171', fontSize: '0.8125rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: analysis ? '300px 1fr' : '1fr', gap: '0', alignItems: 'start', paddingTop: '1.5rem' }}>

          {/* ── Repo list (authenticated users) ── */}
          {isAuthenticated && (
            <div style={{ borderRight: analysis ? '1px solid var(--border)' : 'none', paddingRight: analysis ? '1.5rem' : '0', paddingBottom: '4rem' }}>
              <p style={{ fontSize: '0.6rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: '0.875rem' }}>// Your repositories</p>
              <input
                type="text" placeholder="Search..." value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', padding: '0.5rem 0.75rem', background: 'var(--bg-2)', border: '1px solid var(--border-2)', color: 'var(--text-1)', fontSize: '0.75rem', fontFamily: 'inherit', outline: 'none', marginBottom: '0.75rem', boxSizing: 'border-box' }}
              />

              {reposLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-3)', fontSize: '0.75rem', padding: '1rem 0' }}>
                  <span className="loader" style={{ width: '10px', height: '10px' }} />Loading repos...
                </div>
              ) : !isAuthenticated ? (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', padding: '1rem 0' }}>
                  <a href="http://localhost:3001/api/auth/github" style={{ color: 'var(--red)', textDecoration: 'none' }}>Connect GitHub</a> to see your repos here.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0', maxHeight: analysis ? '75vh' : 'none', overflowY: analysis ? 'auto' : 'visible' }}>
                  {filtered.map(repo => {
                    const isSelected = analysis?.repo.full_name === repo.full_name;
                    const isLoading  = analyzing === repo.full_name;
                    return (
                      <div
                        key={repo.id}
                        style={{
                          padding: '0.875rem 0',
                          borderBottom: '1px solid var(--border)',
                          cursor: 'pointer',
                          background: isSelected ? 'var(--red-dim)' : 'transparent',
                          transition: 'background 0.15s',
                        }}
                        onClick={() => !isLoading && handleAnalyzeRepo(repo)}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: isSelected ? 'var(--text-1)' : 'var(--text-2)', margin: '0 0 0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {repo.name}
                            </p>
                            {repo.description && (
                              <p style={{ fontSize: '0.7rem', color: 'var(--text-3)', margin: '0 0 0.375rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {repo.description}
                              </p>
                            )}
                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                              {repo.language && (
                                <span style={{ fontSize: '0.6rem', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                  <span style={{ width: '6px', height: '6px', background: langColor(repo.language), display: 'inline-block' }} />
                                  {repo.language}
                                </span>
                              )}
                              {repo.stars > 0 && <span style={{ fontSize: '0.6rem', color: 'var(--text-3)' }}>{repo.stars} stars</span>}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.625rem' }}>
                            {repo.codex_repo_id && (
                              <button
                                disabled={!!webhookLoading}
                                onClick={e => { e.stopPropagation(); handleInstallWebhook(repo); }}
                                style={{
                                  padding: '0.25rem 0.625rem',
                                  background: repo.webhook_active ? 'rgba(74,222,128,0.1)' : 'var(--bg-3)',
                                  border: `1px solid ${repo.webhook_active ? '#4ade8050' : 'var(--border-2)'}`,
                                  color: repo.webhook_active ? '#4ade80' : 'var(--text-3)',
                                  fontSize: '0.6rem', fontFamily: 'inherit', cursor: repo.webhook_active ? 'default' : 'pointer',
                                  textTransform: 'uppercase', letterSpacing: '0.1em',
                                  display: 'flex', alignItems: 'center', gap: '0.375rem',
                                }}
                              >
                                {webhookLoading === repo.id ? <><span className="loader" style={{ width: '8px', height: '8px' }} />...</> : repo.webhook_active ? <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Active</> : 'Webhook +'}
                              </button>
                            )}
                            <button
                              disabled={isLoading}
                              onClick={e => { e.stopPropagation(); !isLoading && handleAnalyzeRepo(repo); }}
                              style={{
                                flexShrink: 0, padding: '0.25rem 0.625rem',
                                background: isSelected ? 'var(--red)' : 'var(--bg-3)',
                                border: `1px solid ${isSelected ? 'var(--red)' : 'var(--border-2)'}`,
                                color: isSelected ? '#fff' : 'var(--text-3)',
                                fontSize: '0.6rem', fontFamily: 'inherit', cursor: 'pointer',
                                textTransform: 'uppercase', letterSpacing: '0.1em',
                                display: 'flex', alignItems: 'center', gap: '0.375rem',
                              }}
                            >
                              {isLoading ? <><span className="loader" style={{ width: '8px', height: '8px' }} />...</> : isSelected ? 'Re-run' : <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>Analyze</>}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {filtered.length === 0 && !reposLoading && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', padding: '1rem 0' }}>No repositories found</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Analysis panel ── */}
          {analysis && a && (
            <div style={{ paddingLeft: isAuthenticated ? '1.5rem' : '0', paddingBottom: '4rem' }}>

              {/* Hero */}
              <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1.5rem', marginBottom: '0' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1.5rem', marginBottom: '1.25rem' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: '0.6rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: '0.375rem' }}>
                      {analysis.is_public ? '// Public repository' : '// Repository analysis'}
                    </p>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-1)', margin: '0 0 0.375rem', letterSpacing: '-0.02em' }}>
                      {analysis.repo.full_name}
                    </h2>
                    {analysis.repo.description && (
                      <p style={{ fontSize: '0.8125rem', color: 'var(--text-2)', margin: 0 }}>{analysis.repo.description}</p>
                    )}
                  </div>

                  {/* Score circle */}
                  <div style={{ flexShrink: 0, textAlign: 'center' }}>
                    <div style={{
                      width: '80px', height: '80px',
                      border: `2px solid ${scoreColor(a.scores.overall)}`,
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      background: `${scoreColor(a.scores.overall)}10`,
                    }}>
                      <span style={{ fontSize: '1.75rem', fontWeight: 700, color: scoreColor(a.scores.overall), lineHeight: 1 }}>{a.scores.overall}</span>
                      <span style={{ fontSize: '0.55rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>/100</span>
                    </div>
                    <p style={{ fontSize: '1.25rem', fontWeight: 700, color: scoreColor(a.scores.overall), marginTop: '0.375rem' }}>{a.grade}</p>
                  </div>
                </div>

                {/* Overall score bar */}
                <div style={{ height: '3px', background: 'var(--bg-3)', marginBottom: '1.25rem' }}>
                  <div style={{ height: '100%', background: scoreColor(a.scores.overall), width: `${a.scores.overall}%`, transition: 'width 1s ease' }} />
                </div>

                {/* Meta strip */}
                <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                  {[
                    { label: 'Files analyzed', value: `${analysis.repo.sampled_files?.length ?? 0} / ${analysis.repo.file_count}` },
                    { label: 'Stars',           value: analysis.repo.stars                          },
                    { label: 'Forks',           value: analysis.repo.forks                          },
                    { label: 'Sec findings',    value: a.security_findings?.length ?? 0, danger: (a.security_findings?.length ?? 0) > 0 },
                  ].map(m => (
                    <div key={m.label}>
                      <p style={{ fontSize: '1rem', fontWeight: 700, color: m.danger ? '#f87171' : 'var(--text-1)', margin: '0 0 0.125rem' }}>{m.value}</p>
                      <p style={{ fontSize: '0.6rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>{m.label}</p>
                    </div>
                  ))}
                </div>

                {/* Tech stack pills */}
                {a.tech_stack?.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginTop: '1rem' }}>
                    {a.tech_stack.map(t => <Tag key={t}>{t}</Tag>)}
                  </div>
                )}
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem', overflowX: 'auto' }}>
                {TABS.map(tab => (
                  <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={tabStyle(tab.key)}>
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* ── TAB: About ── */}
              {activeTab === 'about' && (
                <div>
                  <Section label="What this repo does">
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', lineHeight: '1.8' }}>
                      {a.plain_english_summary || a.summary}
                    </p>
                  </Section>

                  {a.target_audience && (
                    <Section label="Who it's for">
                      <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', lineHeight: '1.8' }}>
                        {a.target_audience}
                      </p>
                    </Section>
                  )}

                  {a.how_to_run?.length > 0 && (
                    <Section label="How to run locally">
                      <div style={{ border: '1px solid var(--border)' }}>
                        {a.how_to_run.map((cmd, i) => (
                          <div key={i} style={{
                            display: 'flex', alignItems: 'center', gap: '1rem',
                            padding: '0.75rem 1rem',
                            borderBottom: i < a.how_to_run.length - 1 ? '1px solid var(--border)' : 'none',
                            background: i % 2 === 0 ? 'var(--bg-1)' : 'var(--bg)',
                          }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-3)', width: '1.25rem', textAlign: 'right', fontWeight: 700 }}>{i + 1}</span>
                            <code style={{ fontSize: '0.8125rem', color: 'var(--text-1)', fontFamily: 'inherit', flex: 1 }}>{cmd}</code>
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}

                  {a.key_folders?.length > 0 && (
                    <Section label="Key folders explained">
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0', border: '1px solid var(--border)' }}>
                        {a.key_folders.map((folder, i) => (
                          <div key={i} style={{
                            padding: '1rem 1.25rem',
                            borderRight: i % 2 === 0 ? '1px solid var(--border)' : 'none',
                            borderBottom: i < a.key_folders.length - 2 ? '1px solid var(--border)' : 'none',
                          }}>
                            <code style={{ fontSize: '0.75rem', color: 'var(--red)', display: 'block', marginBottom: '0.375rem' }}>{folder.path}</code>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', margin: 0, lineHeight: '1.6' }}>{folder.description}</p>
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}

                  {a.strengths?.length > 0 && (
                    <Section label="Strengths">
                      {a.strengths.map((s, i) => (
                        <div key={i} style={{ display: 'flex', gap: '0.75rem', paddingBottom: '0.625rem', marginBottom: '0.625rem', borderBottom: i < a.strengths.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <span style={{ color: '#4ade80', marginTop: '0.1rem', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          </span>
                          <p style={{ fontSize: '0.8125rem', color: 'var(--text-2)', margin: 0, lineHeight: '1.6' }}>{s}</p>
                        </div>
                      ))}
                    </Section>
                  )}

                  {a.unnecessary_code?.length > 0 && (
                    <Section label="Unnecessary code">
                      {a.unnecessary_code.map((item, i) => (
                        <div key={i} style={{ padding: '0.875rem 1rem', background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.2)', marginBottom: '0.625rem' }}>
                          <p style={{ fontSize: '0.8125rem', color: 'var(--text-2)', margin: '0 0 0.375rem', lineHeight: '1.6' }}>{item.description}</p>
                          <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                            {item.files?.map(f => (
                              <code key={f} style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }}>{f}</code>
                            ))}
                          </div>
                        </div>
                      ))}
                    </Section>
                  )}
                </div>
              )}

              {/* ── TAB: Scores ── */}
              {activeTab === 'scores' && (
                <div>
                  <Section label="All dimension scores">
                    <div style={{ border: '1px solid var(--border)' }}>
                      {[
                        { key: 'code_quality',      label: 'Code Quality'      },
                        { key: 'security',           label: 'Security'          },
                        { key: 'performance',        label: 'Performance'       },
                        { key: 'structure',          label: 'Structure'         },
                        { key: 'maintainability',    label: 'Maintainability'   },
                        { key: 'documentation',      label: 'Documentation'     },
                        { key: 'test_coverage',      label: 'Test Coverage'     },
                        { key: 'dependency_health',  label: 'Dependency Health' },
                      ].map(({ key, label }, i) => {
                        const score = a.scores[key as keyof typeof a.scores] as number;
                        return (
                          <div key={key} style={{
                            display: 'grid', gridTemplateColumns: '10rem 1fr 4rem',
                            gap: '1.25rem', alignItems: 'center',
                            padding: '1rem 1.25rem',
                            borderBottom: i < 7 ? '1px solid var(--border)' : 'none',
                            background: i % 2 === 0 ? 'var(--bg-1)' : 'var(--bg)',
                          }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
                            <div style={{ height: '3px', background: 'var(--bg-3)' }}>
                              <div style={{ height: '100%', background: scoreColor(score), width: `${score}%`, transition: 'width 1s ease' }} />
                            </div>
                            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: scoreColor(score), textAlign: 'right', fontFamily: 'inherit' }}>{score}</span>
                          </div>
                        );
                      })}
                    </div>
                  </Section>

                  {a.languages_used?.length > 0 && (
                    <Section label="Language breakdown">
                      <div style={{ border: '1px solid var(--border)' }}>
                        {a.languages_used.slice(0, 8).map((lang, i) => (
                          <div key={lang.name} style={{
                            display: 'grid', gridTemplateColumns: '8rem 1fr 4rem',
                            gap: '1.25rem', alignItems: 'center',
                            padding: '0.875rem 1.25rem',
                            borderBottom: i < Math.min(a.languages_used.length, 8) - 1 ? '1px solid var(--border)' : 'none',
                            background: i % 2 === 0 ? 'var(--bg-1)' : 'var(--bg)',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ width: '6px', height: '6px', background: langColor(lang.name), flexShrink: 0 }} />
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-2)' }}>{lang.name}</span>
                            </div>
                            <div style={{ height: '3px', background: 'var(--bg-3)' }}>
                              <div style={{ height: '100%', background: langColor(lang.name), width: `${lang.percentage}%`, transition: 'width 1s ease', opacity: 0.8 }} />
                            </div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-3)', textAlign: 'right' }}>{lang.percentage}%</span>
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}
                </div>
              )}

              {/* ── TAB: Architecture ── */}
              {activeTab === 'architecture' && (
                <div>
                  <Section label="Overview">
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', lineHeight: '1.8', marginBottom: '1.5rem' }}>{a.architecture_notes}</p>
                  </Section>

                  {a.architecture_layers?.length > 0 && (
                    <div>
                      {a.architecture_layers.map((layer, li) => (
                        <Section key={li} label={layer.layer_name}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0', border: '1px solid var(--border)' }}>
                            {layer.components.map((comp, ci) => (
                              <div key={ci} style={{
                                padding: '1.25rem',
                                borderRight: (ci + 1) % 3 !== 0 ? '1px solid var(--border)' : 'none',
                                borderBottom: ci < layer.components.length - 3 ? '1px solid var(--border)' : 'none',
                              }}>
                                <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-1)', margin: '0 0 0.375rem' }}>{comp.name}</p>
                                <p style={{ fontSize: '0.78rem', color: 'var(--text-2)', margin: '0 0 0.625rem', lineHeight: '1.6' }}>{comp.description}</p>
                                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                  {comp.technologies.map(t => <Tag key={t}>{t}</Tag>)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </Section>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB: Security ── */}
              {activeTab === 'security' && (
                <div>
                  {(!a.security_findings || a.security_findings.length === 0) ? (
                    <div style={{ padding: '3rem', textAlign: 'center', border: '1px solid var(--border)' }}>
                      <p style={{ fontSize: '0.875rem', color: '#4ade80', margin: '0 0 0.25rem' }}>No security issues found</p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', margin: 0 }}>Security score: {a.scores.security}/100</p>
                    </div>
                  ) : (
                    a.security_findings.map((f, i) => {
                      const sc = sevColor(f.severity);
                      return (
                        <div key={i} style={{ border: `1px solid ${sc}25`, borderLeft: `3px solid ${sc}`, padding: '1rem 1.25rem', marginBottom: '0.625rem', background: `${sc}05` }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.5rem' }}>
                            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: sc, margin: 0 }}>{f.title}</p>
                            <Tag color={sc}>{f.severity}</Tag>
                          </div>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', margin: '0 0 0.5rem', lineHeight: '1.6' }}>{f.description}</p>
                          {f.affected_files?.length > 0 && (
                            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                              {f.affected_files.map(file => (
                                <code key={file} style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', background: 'var(--bg-3)', border: '1px solid var(--border-2)', color: 'var(--text-3)' }}>{file}</code>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* ── TAB: Issues ── */}
              {activeTab === 'issues' && (
                <div>
                  {(!a.critical_issues || a.critical_issues.length === 0) ? (
                    <div style={{ padding: '3rem', textAlign: 'center', border: '1px solid var(--border)' }}>
                      <p style={{ fontSize: '0.875rem', color: 'var(--text-3)', margin: 0 }}>No critical issues found</p>
                    </div>
                  ) : (
                    a.critical_issues.map((issue, i) => {
                      const pc = issue.priority === 'high' ? '#f87171' : issue.priority === 'medium' ? '#fbbf24' : '#60a5fa';
                      const open = expandedItem === i;
                      return (
                        <div key={i} style={{ border: `1px solid ${pc}25`, borderLeft: `3px solid ${pc}`, marginBottom: '0.625rem', cursor: 'pointer' }} onClick={() => setExpandedItem(open ? null : i)}>
                          <div style={{ padding: '0.875rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <p style={{ fontSize: '0.875rem', fontWeight: 600, color: pc, margin: 0 }}>{issue.title}</p>
                              <Tag color={pc}>{issue.priority}</Tag>
                            </div>
                            <span style={{ color: 'var(--text-3)', fontSize: '0.875rem' }}>{open ? '−' : '+'}</span>
                          </div>
                          {open && (
                            <div style={{ padding: '0 1.25rem 1rem', borderTop: `1px solid ${pc}15` }}>
                              <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', margin: '0.75rem 0 0.5rem', lineHeight: '1.6' }}>{issue.explanation}</p>
                              {issue.affected_files?.length > 0 && (
                                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                  {issue.affected_files.map(f => (
                                    <code key={f} style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', background: 'var(--bg-3)', border: '1px solid var(--border-2)', color: 'var(--text-3)' }}>{f}</code>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* ── TAB: Recommendations ── */}
              {activeTab === 'recommendations' && (
                <div>
                  {/* Type filter */}
                  <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--border)', marginBottom: '1.25rem' }}>
                    {([
                      { key: 'all',        label: `All (${recsCounts.all})`               },
                      { key: 'issue',      label: `Issues (${recsCounts.issue})`           },
                      { key: 'automation', label: `Automations (${recsCounts.automation})` },
                      { key: 'refactor',   label: `Refactors (${recsCounts.refactor})`     },
                    ] as const).map(tab => (
                      <button key={tab.key} onClick={() => setRecsTab(tab.key)} style={{
                        ...tabStyle(tab.key as any),
                        color: recsTab === tab.key ? 'var(--text-1)' : 'var(--text-3)',
                        borderBottomColor: recsTab === tab.key ? 'var(--red)' : 'transparent',
                      }}>
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {filteredRecs.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', border: '1px solid var(--border)' }}>
                      <p style={{ fontSize: '0.875rem', color: 'var(--text-3)', margin: 0 }}>No recommendations in this category</p>
                    </div>
                  ) : (
                    filteredRecs.map((rec, i) => {
                      const typeColor  = rec.type === 'issue' ? '#f87171' : rec.type === 'automation' ? '#60a5fa' : 'var(--accent)';
                      const effortColor = rec.effort === 'low' ? '#4ade80' : rec.effort === 'medium' ? '#fbbf24' : '#f87171';
                      const impactColor = rec.impact === 'high' ? 'var(--red)' : rec.impact === 'medium' ? '#60a5fa' : '#9ca3af';
                      return (
                        <div key={i} style={{ border: '1px solid var(--border)', borderLeft: `3px solid ${typeColor}`, padding: '1.25rem', marginBottom: '0.625rem', background: 'var(--bg-1)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.625rem' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                <Tag color={typeColor}>{rec.type}</Tag>
                                {rec.tags?.map(t => <Tag key={t}>{t}</Tag>)}
                              </div>
                              <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{rec.title}</p>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <p style={{ fontSize: '0.7rem', color: 'var(--text-3)', margin: '0 0 0.25rem' }}>~{rec.estimated_minutes} min</p>
                              <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'flex-end' }}>
                                <Tag color={effortColor}>{rec.effort} effort</Tag>
                                <Tag color={impactColor}>{rec.impact} impact</Tag>
                              </div>
                            </div>
                          </div>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', margin: 0, lineHeight: '1.6' }}>{rec.description}</p>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* ── TAB: Files ── */}
              {activeTab === 'files' && (
                <div>
                  {/* Search + filter */}
                  <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    <input
                      type="text" placeholder="Search files..."
                      value={fileSearch} onChange={e => setFileSearch(e.target.value)}
                      style={{ flex: 1, minWidth: '200px', padding: '0.5rem 0.75rem', background: 'var(--bg-2)', border: '1px solid var(--border-2)', color: 'var(--text-1)', fontSize: '0.75rem', fontFamily: 'inherit', outline: 'none' }}
                    />
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => setFileTypeFilter('all')}
                        style={{ padding: '0.375rem 0.75rem', background: fileTypeFilter === 'all' ? 'var(--red)' : 'var(--bg-3)', border: `1px solid ${fileTypeFilter === 'all' ? 'var(--red)' : 'var(--border-2)'}`, color: fileTypeFilter === 'all' ? '#fff' : 'var(--text-3)', fontSize: '0.6rem', fontFamily: 'inherit', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em' }}
                      >
                        All ({allFiles.length})
                      </button>
                      {fileTypes.slice(0, 8).map(ext => {
                        const count = allFiles.filter(f => f.path.endsWith('.' + ext)).length;
                        return (
                          <button key={ext} onClick={() => setFileTypeFilter(ext)}
                            style={{ padding: '0.375rem 0.625rem', background: fileTypeFilter === ext ? 'var(--red)' : 'var(--bg-3)', border: `1px solid ${fileTypeFilter === ext ? 'var(--red)' : 'var(--border-2)'}`, color: fileTypeFilter === ext ? '#fff' : 'var(--text-3)', fontSize: '0.6rem', fontFamily: 'inherit', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em' }}
                          >
                            {ext} {count}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* File count */}
                  <p style={{ fontSize: '0.65rem', color: 'var(--text-3)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    {filteredFiles.length} files indexed · {Math.round(allFiles.reduce((s, f) => s + (f.size || 0), 0) / 1024)} KB total
                  </p>

                  {/* File list */}
                  <div style={{ border: '1px solid var(--border)' }}>
                    {filteredFiles.map((file, i) => {
                      const ext  = file.path.split('.').pop()?.toLowerCase() || '';
                      const name = file.path.split('/').pop() || file.path;
                      const dir  = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/') + 1) : '';
                      return (
                        <div key={file.path} style={{
                          display: 'flex', alignItems: 'center', gap: '0.75rem',
                          padding: '0.5rem 1rem',
                          borderBottom: i < filteredFiles.length - 1 ? '1px solid var(--border)' : 'none',
                          background: i % 2 === 0 ? 'var(--bg-1)' : 'var(--bg)',
                        }}>
                          <Tag>{ext || 'file'}</Tag>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-3)', fontFamily: 'inherit', flexShrink: 0 }}>{dir}</span>
                          <span style={{ fontSize: '0.8125rem', color: 'var(--text-1)', fontFamily: 'inherit', flex: 1 }}>{name}</span>
                          {file.size && (
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-3)', flexShrink: 0 }}>
                              {file.size < 1024 ? `${file.size} B` : `${Math.round(file.size / 1024)} KB`}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* File insights from AI */}
                  {a.file_insights?.length > 0 && (
                    <Section label="AI file insights">
                      {a.file_insights.map((file, i) => {
                        const open = expandedItem === i + 1000;
                        return (
                          <div key={i} style={{ border: '1px solid var(--border)', marginBottom: '0.625rem', cursor: 'pointer' }} onClick={() => setExpandedItem(open ? null : i + 1000)}>
                            <div style={{ padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <code style={{ fontSize: '0.75rem', color: 'var(--red)', display: 'block', marginBottom: '0.125rem' }}>{file.path}</code>
                                <p style={{ fontSize: '0.72rem', color: 'var(--text-3)', margin: 0 }}>{file.role}</p>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {file.issues?.length > 0 && <Tag color="#fb923c">{file.issues.length} issue{file.issues.length !== 1 ? 's' : ''}</Tag>}
                                <span style={{ color: 'var(--text-3)' }}>{open ? '−' : '+'}</span>
                              </div>
                            </div>
                            {open && (
                              <div style={{ padding: '0 1rem 0.875rem', borderTop: '1px solid var(--border)' }}>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', margin: '0.625rem 0 0.5rem', lineHeight: '1.6' }}>{file.quality_note}</p>
                                {file.issues?.map((issue, j) => (
                                  <div key={j} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                    <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>·</span>
                                    <p style={{ fontSize: '0.78rem', color: 'var(--text-2)', margin: 0 }}>{issue}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </Section>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Empty state — no analysis yet, not authenticated */}
          {!analysis && !isAuthenticated && !analyzing && (
            <div style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-3)', marginBottom: '0.5rem' }}>
                Paste a public GitHub URL above to analyze any repository instantly.
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>
                Or <a href="/login" style={{ color: 'var(--red)', textDecoration: 'none' }}>sign in</a> to browse and analyze your own repos.
              </p>
            </div>
          )}

          {/* Loading state — no sidebar */}
          {!analysis && analyzing && !isAuthenticated && (
            <div style={{ padding: '4rem 1.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
              <span className="loader" style={{ width: '20px', height: '20px' }} />
              <p style={{ fontSize: '0.875rem', color: 'var(--text-2)' }}>Fetching and analyzing repository...</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>This may take 15–30 seconds for large repos</p>
            </div>
          )}
        </div>
      </div>
      <style>{`
        .loader {
          border: 2px solid rgba(255,255,255,0.1);
          border-top: 2px solid var(--red);
          border-radius: 50%;
          display: inline-block;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
