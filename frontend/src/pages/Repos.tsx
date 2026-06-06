import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { storageGet, storageSet, storageClear, timeAgo } from '../lib/storage';

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

type TabKey = 'about' | 'scores' | 'architecture' | 'security' | 'issues' | 'recommendations' | 'files' | 'health';

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
    <p style={{ fontSize: '0.6rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: '24px', paddingBottom: '0.625rem', borderBottom: '1px solid var(--border)' }}>
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

interface ReposPersistedState {
  lastUrl: string;
  repoInfo: object | null;
  analysis: RepoAnalysis | null;
  activeTab: TabKey;
  savedAt: string;
}

const HEALTH_COLORS = {
  critical: {
    dot:    '#ef4444',
    border: '#3f1f1f',
    bg:     '#1a0808',
    label:  '#ef4444',
  },
  warning: {
    dot:    '#ffd60a',
    border: 'rgba(181,162,0,0.3)',
    bg:     'rgba(181,162,0,0.06)',
    label:  '#ffd60a',
  },
  healthy: {
    dot:    '#74c69d',
    border: 'rgba(116,198,157,0.25)',
    bg:     'rgba(116,198,157,0.05)',
    label:  '#74c69d',
  },
} as const;

type HealthStatus = 'critical' | 'warning' | 'healthy';

function calculateFileHealth(
  filePath: string,
  securityFindings: CodebaseAnalysis['security_findings'],
  recommendations: CodebaseAnalysis['recommendations']
): HealthStatus {
  const secFindings = securityFindings.filter(f =>
    f.affected_files?.some(af => af.includes(filePath) || filePath.includes(af))
  );
  const recs = recommendations.filter(r =>
    r.description?.includes(filePath) || r.title?.includes(filePath)
  );

  const hasCritical = secFindings.some(f => f.severity === 'critical' || f.severity === 'high');
  const hasMedium   = secFindings.some(f => f.severity === 'medium') ||
                      recs.some(r => r.impact === 'high');

  if (hasCritical) return 'critical';
  if (hasMedium)   return 'warning';
  return 'healthy';
}

export default function Repos() {
  const { isAuthenticated } = useAuth();
  const [repos, setRepos]           = useState<GithubRepo[]>([]);
  const [filtered, setFiltered]     = useState<GithubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [search, setSearch]         = useState('');
  const [analyzing, setAnalyzing]   = useState<string | null>(null);
  const [error, setError]           = useState('');
  const [recsTab, setRecsTab]       = useState<'all' | 'issue' | 'automation' | 'refactor'>('all');
  const [fileSearch, setFileSearch] = useState('');
  const [fileTypeFilter, setFileTypeFilter] = useState('all');
  const [expandedItem, setExpandedItem]     = useState<number | null>(null);
  const [webhookLoading, setWebhookLoading] = useState<number | null>(null);
  const [healthFilter, setHealthFilter]     = useState<'all' | HealthStatus>('all');
  const [securitySearch, setSecuritySearch] = useState('');
  const [recsSearch, setRecsSearch]         = useState('');

  // ── Restore persisted state ──
  const persisted = storageGet<ReposPersistedState>('repos');
  const [publicUrl, setPublicUrl]   = useState(persisted?.lastUrl ?? '');
  const [analysis, setAnalysis]     = useState<RepoAnalysis | null>(persisted?.analysis ?? null);
  const [activeTab, setActiveTab]   = useState<TabKey>(persisted?.activeTab ?? 'about');
  const [restoredAt]                = useState<string | null>(persisted?.savedAt ?? null);

  // ── Persistence helpers ──
  const persist = useCallback((overrides: Partial<ReposPersistedState> = {}) => {
    storageSet('repos', {
      lastUrl:   publicUrl,
      repoInfo:  null,
      analysis:  analysis,
      activeTab: activeTab,
      savedAt:   new Date().toISOString(),
      ...overrides,
    } as ReposPersistedState);
  }, [publicUrl, analysis, activeTab]);

  function handleTabChange(key: TabKey) {
    setActiveTab(key);
    persist({ activeTab: key });
  }

  function handleClear() {
    storageClear('repos');
    setPublicUrl('');
    setAnalysis(null);
    setActiveTab('about');
    setError('');
    setExpandedItem(null);
  }

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
    handleTabChange('about');
    setExpandedItem(null);
    const [owner, name] = repo.full_name.split('/');
    try {
      const result = await api.github.analyzeRepo(owner, name);
      const r = result as RepoAnalysis;
      setAnalysis(r);
      persist({ analysis: r, activeTab: 'about', lastUrl: repo.full_name });
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
    handleTabChange('about');
    setExpandedItem(null);
    setError('');
    try {
      const result = await api.github.analyzePublic(publicUrl.trim());
      const r = result as RepoAnalysis;
      setAnalysis(r);
      persist({ analysis: r, activeTab: 'about', lastUrl: publicUrl.trim() });
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

  const filteredRecs = useMemo(() => {
    let list = recsTab === 'all'
      ? (a?.recommendations || [])
      : (a?.recommendations || []).filter(r => r.type === recsTab);
    if (recsSearch) {
      const q = recsSearch.toLowerCase();
      list = list.filter(r =>
        r.title?.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [a, recsTab, recsSearch]);

  const filteredSecurityFindings = useMemo(() => {
    let list = a?.security_findings || [];
    if (securitySearch) {
      const q = securitySearch.toLowerCase();
      list = list.filter(f =>
        f.title?.toLowerCase().includes(q) ||
        f.description?.toLowerCase().includes(q) ||
        f.affected_files?.some(af => af.toLowerCase().includes(q))
      );
    }
    return list;
  }, [a, securitySearch]);

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'about',           label: 'About'                             },
    { key: 'scores',          label: 'Scores'                            },
    { key: 'architecture',    label: 'Architecture'                      },
    { key: 'security',        label: `Security (${a?.security_findings?.length ?? 0})` },
    { key: 'issues',          label: `Issues (${a?.critical_issues?.length ?? 0})`     },
    { key: 'recommendations', label: `Actions (${a?.recommendations?.length ?? 0})`    },
    { key: 'files',           label: `Files (${allFiles.length})`        },
    { key: 'health',          label: 'Health'                            },
  ];

  // ── Health data ──
  const healthFiles = useMemo(() => {
    if (!a) return [];
    const secFindings = a.security_findings ?? [];
    const recs = a.recommendations ?? [];
    // Collect all unique file paths mentioned in findings/recommendations
    const mentionedFiles = new Set<string>();
    secFindings.forEach(f => f.affected_files?.forEach(af => mentionedFiles.add(af)));
    recs.forEach(r => {
      const matches = (r.description + ' ' + r.title).match(/[\w./\-]+\.[\w]+/g);
      matches?.forEach(m => mentionedFiles.add(m));
    });
    // Also include all repo files
    allFiles.forEach(f => mentionedFiles.add(f.path));

    return Array.from(mentionedFiles).map(filePath => ({
      path:   filePath,
      status: calculateFileHealth(filePath, secFindings, recs),
      secFindings: secFindings.filter(f => f.affected_files?.some(af => af.includes(filePath) || filePath.includes(af))),
      recs:        recs.filter(r => r.description?.includes(filePath) || r.title?.includes(filePath)),
    })).sort((a, b) => {
      const order = { critical: 0, warning: 1, healthy: 2 };
      return order[a.status] - order[b.status];
    });
  }, [a, allFiles]);

  const healthCounts = useMemo(() => ({
    critical: healthFiles.filter(f => f.status === 'critical').length,
    warning:  healthFiles.filter(f => f.status === 'warning').length,
    healthy:  healthFiles.filter(f => f.status === 'healthy').length,
  }), [healthFiles]);

  const filteredHealthFiles = useMemo(() =>
    healthFilter === 'all' ? healthFiles : healthFiles.filter(f => f.status === healthFilter),
    [healthFiles, healthFilter]
  );

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
    <div style={{
      display: 'grid',
      gridTemplateColumns: isAuthenticated ? '320px 1fr' : '1fr',
      height: 'calc(100vh - 52px)',
      overflow: 'hidden',
      background: 'var(--bg)',
      marginTop: '52px',
    }}>

      {/* ── Left Column: Repo list ── */}
      {isAuthenticated && (
        <div style={{
          position: 'sticky',
          top: '52px',
          height: 'calc(100vh - 52px)',
          overflowY: 'auto',
          borderRight: '1px solid var(--border)',
          padding: '20px 16px',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <p style={{ fontSize: '0.6rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: '0.875rem' }}>// Your repositories</p>
          <input
            type="text" placeholder="Search..." value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '0.5rem 0.75rem', background: 'var(--bg-2)', border: '1px solid var(--border-2)', color: 'var(--text-1)', fontSize: '0.75rem', fontFamily: 'inherit', outline: 'none', marginBottom: '12px', boxSizing: 'border-box' }}
          />

          {reposLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-3)', fontSize: '0.75rem', padding: '1rem 0' }}>
              <span className="loader" style={{ width: '10px', height: '10px' }} />Loading repos...
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
              {filtered.map(repo => {
                const isSelected = analysis?.repo.full_name === repo.full_name;
                const isLoading  = analyzing === repo.full_name;
                return (
                  <div
                    key={repo.id}
                    style={{
                      padding: '12px 14px',
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

      {/* ── Right Column: Content area ── */}
      <div style={{
        overflowY: 'auto',
        height: 'calc(100vh - 52px)',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column'
      }}>

        {/* ── Public URL bar ── */}
        <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-1)', padding: '1.25rem 1.5rem', flexShrink: 0 }}>
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
              {/* Clear button */}
              <button
                onClick={handleClear}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderLeft: 'none',
                  color: 'var(--text-3)',
                  fontFamily: 'var(--font)',
                  fontSize: '10px',
                  fontWeight: 500,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  padding: '4px 14px',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, color 0.15s',
                  flexShrink: 0,
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
            </div>
            {restoredAt && analysis && (
              <p style={{ fontSize: '10px', color: 'var(--text-3)', margin: '0.5rem 0 0', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                // restored from {timeAgo(restoredAt)}
              </p>
            )}
          </div>
        </div>

        {error && (
          <div style={{ margin: '1rem 40px', padding: '0.875rem 1rem', background: 'rgba(196,30,30,0.08)', border: '1px solid rgba(196,30,30,0.3)', color: '#f87171', fontSize: '0.8125rem' }}>
            {error}
          </div>
        )}


        {/* ── Content area ── */}
        {analysis && a && (
          <div style={{ padding: '28px 40px', boxSizing: 'border-box' }}>

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
                    <p style={{ fontSize: '0.8125rem', color: 'var(--text-2)', margin: 0, lineHeight: '1.8' }}>{analysis.repo.description}</p>
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
              <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', margin: '24px 0' }}>
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
            <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--border)', marginBottom: '1.5rem', overflowX: 'auto', padding: '0 40px', marginLeft: '-40px', marginRight: '-40px' }}>
              {TABS.map(tab => (
                <button key={tab.key} onClick={() => handleTabChange(tab.key)} style={tabStyle(tab.key)}>
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
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', margin: 0, lineHeight: '1.8' }}>{folder.description}</p>
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
                        <p style={{ fontSize: '0.8125rem', color: 'var(--text-2)', margin: 0, lineHeight: '1.8' }}>{s}</p>
                      </div>
                    ))}
                  </Section>
                )}

                {a.unnecessary_code?.length > 0 && (
                  <Section label="Unnecessary code">
                    {a.unnecessary_code.map((item, i) => (
                      <div key={i} style={{ padding: '0.875rem 1rem', background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.2)', marginBottom: '0.625rem' }}>
                        <p style={{ fontSize: '0.8125rem', color: 'var(--text-2)', margin: '0 0 0.375rem', lineHeight: '1.8' }}>{item.description}</p>
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
                              <p style={{ fontSize: '0.78rem', color: 'var(--text-2)', margin: '0 0 0.625rem', lineHeight: '1.8' }}>{comp.description}</p>
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
                <div style={{ marginBottom: '1.25rem' }}>
                  <input
                    type="text"
                    placeholder="Search security findings or filter by file..."
                    value={securitySearch}
                    onChange={e => setSecuritySearch(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      background: 'var(--bg-2)',
                      border: '1px solid var(--border-2)',
                      color: 'var(--text-1)',
                      fontSize: '0.75rem',
                      fontFamily: 'inherit',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  {securitySearch && (
                    <button
                      onClick={() => setSecuritySearch('')}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-3)',
                        fontSize: '0.7rem',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        marginTop: '0.25rem',
                        padding: 0,
                      }}
                    >
                      Clear search
                    </button>
                  )}
                </div>

                {filteredSecurityFindings.length === 0 ? (
                  <div style={{ padding: '3rem', textAlign: 'center', border: '1px solid var(--border)' }}>
                    <p style={{ fontSize: '0.875rem', color: '#4ade80', margin: '0 0 0.25rem', lineHeight: '1.8' }}>
                      {securitySearch ? 'No security findings match your search' : 'No security issues found'}
                    </p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', margin: 0, lineHeight: '1.8' }}>Security score: {a.scores.security}/100</p>
                  </div>
                ) : (
                  filteredSecurityFindings.map((f, i) => {
                    const sc = sevColor(f.severity);
                    return (
                      <div key={i} style={{ border: `1px solid ${sc}25`, borderLeft: `3px solid ${sc}`, padding: '1rem 1.25rem', marginBottom: '0.625rem', background: `${sc}05` }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.5rem' }}>
                          <p style={{ fontSize: '0.875rem', fontWeight: 600, color: sc, margin: 0 }}>{f.title}</p>
                          <Tag color={sc}>{f.severity}</Tag>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', margin: '0 0 0.5rem', lineHeight: '1.8' }}>{f.description}</p>
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
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-3)', margin: 0, lineHeight: '1.8' }}>No critical issues found</p>
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
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', margin: '0.75rem 0 0.5rem', lineHeight: '1.8' }}>{issue.explanation}</p>
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
                <div style={{ marginBottom: '1.25rem' }}>
                  <input
                    type="text"
                    placeholder="Search recommendations or filter by file..."
                    value={recsSearch}
                    onChange={e => setRecsSearch(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      background: 'var(--bg-2)',
                      border: '1px solid var(--border-2)',
                      color: 'var(--text-1)',
                      fontSize: '0.75rem',
                      fontFamily: 'inherit',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  {recsSearch && (
                    <button
                      onClick={() => setRecsSearch('')}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-3)',
                        fontSize: '0.7rem',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        marginTop: '0.25rem',
                        padding: 0,
                      }}
                    >
                      Clear search
                    </button>
                  )}
                </div>

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
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-3)', margin: 0, lineHeight: '1.8' }}>No recommendations in this category</p>
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
                            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-1)', margin: 0, lineHeight: '1.8' }}>{rec.title}</p>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <p style={{ fontSize: '0.7rem', color: 'var(--text-3)', margin: '0 0 0.25rem', lineHeight: '1.8' }}>~{rec.estimated_minutes} min</p>
                            <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'flex-end' }}>
                              <Tag color={effortColor}>{rec.effort} effort</Tag>
                              <Tag color={impactColor}>{rec.impact} impact</Tag>
                            </div>
                          </div>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', margin: 0, lineHeight: '1.8' }}>{rec.description}</p>
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
                <p style={{ fontSize: '0.65rem', color: 'var(--text-3)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', lineHeight: '1.8' }}>
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
                              <p style={{ fontSize: '0.72rem', color: 'var(--text-3)', margin: 0, lineHeight: '1.8' }}>{file.role}</p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              {file.issues?.length > 0 && <Tag color="#fb923c">{file.issues.length} issue{file.issues.length !== 1 ? 's' : ''}</Tag>}
                              <span style={{ color: 'var(--text-3)' }}>{open ? '−' : '+'}</span>
                            </div>
                          </div>
                          {open && (
                            <div style={{ padding: '0 1rem 0.875rem', borderTop: '1px solid var(--border)' }}>
                              <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', margin: '0.625rem 0 0.5rem', lineHeight: '1.8' }}>{file.quality_note}</p>
                              {file.issues?.map((issue, j) => (
                                <div key={j} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                  <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>·</span>
                                  <p style={{ fontSize: '0.78rem', color: 'var(--text-2)', margin: 0, lineHeight: '1.8' }}>{issue}</p>
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

            {/* ── TAB: Health ── */}
            {activeTab === 'health' && (
              <div>
                {/* Summary boxes & Legend */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                  {/* Critical */}
                  <div style={{
                    padding: '1.25rem',
                    background: HEALTH_COLORS.critical.bg,
                    border: `1px solid ${HEALTH_COLORS.critical.border}`,
                    borderLeft: `4px solid ${HEALTH_COLORS.critical.dot}`,
                  }}>
                    <p style={{ fontSize: '0.65rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.5rem' }}>Critical / High Risk</p>
                    <p style={{ fontSize: '1.75rem', fontWeight: 700, color: HEALTH_COLORS.critical.label, margin: 0 }}>{healthCounts.critical}</p>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-3)', margin: '0.25rem 0 0' }}>Requires immediate attention</p>
                  </div>
                  {/* Warning */}
                  <div style={{
                    padding: '1.25rem',
                    background: HEALTH_COLORS.warning.bg,
                    border: `1px solid ${HEALTH_COLORS.warning.border}`,
                    borderLeft: `4px solid ${HEALTH_COLORS.warning.dot}`,
                  }}>
                    <p style={{ fontSize: '0.65rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.5rem' }}>Medium Risk / Warnings</p>
                    <p style={{ fontSize: '1.75rem', fontWeight: 700, color: HEALTH_COLORS.warning.label, margin: 0 }}>{healthCounts.warning}</p>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-3)', margin: '0.25rem 0 0' }}>Potential issues or alerts</p>
                  </div>
                  {/* Healthy */}
                  <div style={{
                    padding: '1.25rem',
                    background: HEALTH_COLORS.healthy.bg,
                    border: `1px solid ${HEALTH_COLORS.healthy.border}`,
                    borderLeft: `4px solid ${HEALTH_COLORS.healthy.dot}`,
                  }}>
                    <p style={{ fontSize: '0.65rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 0.5rem' }}>Healthy / Low Risk</p>
                    <p style={{ fontSize: '1.75rem', fontWeight: 700, color: HEALTH_COLORS.healthy.label, margin: 0 }}>{healthCounts.healthy}</p>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-3)', margin: '0.25rem 0 0' }}>No findings or warnings</p>
                  </div>
                </div>

                {/* Filter pills */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setHealthFilter('all')}
                    style={{
                      padding: '0.375rem 0.75rem',
                      background: healthFilter === 'all' ? 'var(--bg-3)' : 'var(--bg-1)',
                      border: '1px solid var(--border-2)',
                      color: healthFilter === 'all' ? 'var(--text-1)' : 'var(--text-3)',
                      fontSize: '0.7rem',
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}
                  >
                    All ({healthFiles.length})
                  </button>
                  <button
                    onClick={() => setHealthFilter('critical')}
                    style={{
                      padding: '0.375rem 0.75rem',
                      background: healthFilter === 'critical' ? HEALTH_COLORS.critical.bg : 'var(--bg-1)',
                      border: `1px solid ${healthFilter === 'critical' ? HEALTH_COLORS.critical.dot : 'var(--border-2)'}`,
                      color: HEALTH_COLORS.critical.label,
                      fontSize: '0.7rem',
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}
                  >
                    Critical ({healthCounts.critical})
                  </button>
                  <button
                    onClick={() => setHealthFilter('warning')}
                    style={{
                      padding: '0.375rem 0.75rem',
                      background: healthFilter === 'warning' ? HEALTH_COLORS.warning.bg : 'var(--bg-1)',
                      border: `1px solid ${healthFilter === 'warning' ? HEALTH_COLORS.warning.dot : 'var(--border-2)'}`,
                      color: HEALTH_COLORS.warning.label,
                      fontSize: '0.7rem',
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}
                  >
                    Warning ({healthCounts.warning})
                  </button>
                  <button
                    onClick={() => setHealthFilter('healthy')}
                    style={{
                      padding: '0.375rem 0.75rem',
                      background: healthFilter === 'healthy' ? HEALTH_COLORS.healthy.bg : 'var(--bg-1)',
                      border: `1px solid ${healthFilter === 'healthy' ? HEALTH_COLORS.healthy.dot : 'var(--border-2)'}`,
                      color: HEALTH_COLORS.healthy.label,
                      fontSize: '0.7rem',
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}
                  >
                    Healthy ({healthCounts.healthy})
                  </button>
                </div>

                {/* File list */}
                <div style={{ border: '1px solid var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                  {filteredHealthFiles.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', background: 'var(--bg-1)' }}>
                      <p style={{ fontSize: '0.875rem', color: 'var(--text-3)', margin: 0 }}>No files match the selected filter.</p>
                    </div>
                  ) : (
                    filteredHealthFiles.map((file, idx) => {
                      const colorConfig = HEALTH_COLORS[file.status];
                      return (
                        <div
                          key={file.path}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0.75rem 1rem',
                            borderBottom: idx < filteredHealthFiles.length - 1 ? '1px solid var(--border)' : 'none',
                            background: idx % 2 === 0 ? 'var(--bg-1)' : 'var(--bg)',
                            gap: '1rem',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, flex: 1 }}>
                            {/* Dot indicating status */}
                            <span style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              backgroundColor: colorConfig.dot,
                              flexShrink: 0,
                              boxShadow: `0 0 8px ${colorConfig.dot}`,
                            }} />
                            <code style={{ fontSize: '0.8125rem', color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {file.path}
                            </code>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
                            {/* Status label */}
                            <span style={{
                              fontSize: '0.65rem',
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                              padding: '0.15rem 0.4rem',
                              background: colorConfig.bg,
                              border: `1px solid ${colorConfig.border}`,
                              color: colorConfig.label,
                              borderRadius: '2px',
                            }}>
                              {file.status}
                            </span>

                            {/* Findings counts */}
                            <div style={{ display: 'flex', gap: '0.375rem', fontSize: '0.75rem' }}>
                              {file.secFindings.length > 0 && (
                                <span style={{ color: 'var(--red)', fontWeight: 500 }}>
                                  {file.secFindings.length} find{file.secFindings.length === 1 ? 'ing' : 'ings'}
                                </span>
                              )}
                              {file.recs.length > 0 && (
                                <span style={{ color: '#fb923c', fontWeight: 500 }}>
                                  {file.recs.length} action{file.recs.length === 1 ? '' : 's'}
                                </span>
                              )}
                              {file.secFindings.length === 0 && file.recs.length === 0 && (
                                <span style={{ color: 'var(--text-3)' }}>Healthy</span>
                              )}
                            </div>

                            {/* Switch to Security/Actions tab Link */}
                            {file.secFindings.length > 0 ? (
                              <button
                                onClick={() => {
                                  setActiveTab('security');
                                  setSecuritySearch(file.path);
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: 'var(--red)',
                                  fontSize: '0.75rem',
                                  cursor: 'pointer',
                                  textDecoration: 'underline',
                                  padding: 0,
                                  fontFamily: 'inherit',
                                }}
                              >
                                View in Security tab →
                              </button>
                            ) : file.recs.length > 0 ? (
                              <button
                                onClick={() => {
                                  setActiveTab('recommendations');
                                  setRecsSearch(file.path);
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: '#fb923c',
                                  fontSize: '0.75rem',
                                  cursor: 'pointer',
                                  textDecoration: 'underline',
                                  padding: 0,
                                  fontFamily: 'inherit',
                                }}
                              >
                                View in Actions tab →
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty state — welcome page */}
        {!analysis && !analyzing && (
          <div style={{ padding: '4rem 40px', textAlign: 'center' }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-3)', marginBottom: '0.5rem', lineHeight: '1.8' }}>
              Paste a public GitHub URL above to analyze any repository instantly.
            </p>
            {!isAuthenticated && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', lineHeight: '1.8' }}>
                Or <a href="/login" style={{ color: 'var(--red)', textDecoration: 'none' }}>sign in</a> to browse and analyze your own repos.
              </p>
            )}
          </div>
        )}

        {/* Loading state */}
        {!analysis && analyzing && (
          <div style={{ padding: '4rem 40px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
            <span className="loader" style={{ width: '20px', height: '20px' }} />
            <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', lineHeight: '1.8' }}>Fetching and analyzing repository...</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', lineHeight: '1.8' }}>This may take 15–30 seconds for large repos</p>
          </div>
        )}
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
