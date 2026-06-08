import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Link } from 'react-router-dom';
import { storageGet, storageSet, storageClear, timeAgo } from '../lib/storage';
import FileTreePicker from '../components/FileTreePicker';
import type { TreeNode } from '../types';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface IndexedRepo {
  repo_id: number;
  name: string;
  owner: string;
  full_name: string;
  language: string;
  status: 'pending' | 'indexing' | 'ready' | 'failed';
  chunk_count: number;
  files_processed: number;
  total_files: number;
  last_indexed_at: string;
  index_duration_ms: number;
  error_message?: string;
}

interface GitHubRepo {
  id: number;
  codex_repo_id?: number | null;
  name: string;
  full_name: string;
  language: string;
  description: string;
  private: boolean;
}

interface Job {
  jobId: string;
  status: string;
  progress: { totalFiles: number; filesProcessed: number; totalChunks: number; chunksEmbedded: number; chunksStored: number; };
}

const STAGE_LABELS: Record<string, string> = {
  pending: 'Queued',
  parsing: 'Parsing files',
  chunking: 'Chunking code',
  embedding: 'Embedding vectors',
  storing: 'Storing to Chroma',
  done: 'Complete',
  ready: 'Ready',
  failed: 'Failed',
  indexing: 'Indexing',
};

const STAGE_ORDER = ['pending', 'parsing', 'chunking', 'embedding', 'storing', 'done'];

function StatusDot({ status }: { status: string }) {
  const color = status === 'ready' || status === 'done' ? '#4ade80'
    : status === 'failed' ? '#f87171'
    : status === 'indexing' || STAGE_ORDER.includes(status) ? 'var(--red)'
    : 'var(--text-3)';
  return (
    <span style={{
      display: 'inline-block', width: '7px', height: '7px',
      background: color, flexShrink: 0,
      animation: (status !== 'ready' && status !== 'done' && status !== 'failed' && status !== 'not_indexed')
        ? 'pulse 1.5s ease-in-out infinite' : 'none',
    }} />
  );
}

interface IndexPersistedState {
  selectedRepoId: number | null;
  savedAt: string;
}

export default function IndexManager() {
  const { token } = useAuth();
  const [repos, setRepos] = useState<IndexedRepo[]>([]);
  const [githubRepos, setGithubRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeJobs, setActiveJobs] = useState<Record<number, Job>>({});
  const [error, setError] = useState('');
  const [owaspStatus, setOwaspStatus] = useState<{ status: string; count: number } | null>(null);
  const [owaspSeeding, setOwaspSeeding] = useState(false);
  const [owaspMessage, setOwaspMessage] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── File tree picker state ──
  const [fileTree, setFileTree] = useState<TreeNode[] | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState('');
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [indexingSelected, setIndexingSelected] = useState(false);
  const [pickingRepoId, setPickingRepoId] = useState<number | null>(null);
  const [newRepoId, setNewRepoId] = useState<number | null>(null);

  // ── Restore persisted state ──
  const persisted = storageGet<IndexPersistedState>('index');
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(persisted?.selectedRepoId ?? null);
  const [restoredAt, setRestoredAt] = useState<string | null>(persisted?.savedAt ?? null);

  const persist = useCallback((repoId: number | null) => {
    storageSet('index', {
      selectedRepoId: repoId,
      savedAt: new Date().toISOString(),
    } as IndexPersistedState);
  }, []);

  function handleClear() {
    storageClear('index');
    setSelectedRepoId(null);
    setRestoredAt(null);
    setFileTree(null);
    setTreeError('');
    setSelectedPaths(new Set());
  }

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  async function loadFileTree(repoId: number, owner: string, repoName: string) {
    setTreeLoading(true);
    setTreeError('');
    setFileTree(null);

    const cacheKey = `codex_index_tree_${repoId}`;
    try {
      const cached = storageGet<{ tree: TreeNode[]; savedAt: number }>(cacheKey);
      if (cached && Date.now() - cached.savedAt < 3600000) {
        setFileTree(cached.tree);
        setTreeLoading(false);
        restoreSelection(repoId);
        return;
      }
    } catch {}

    try {
      const res = await fetch(
        `${API}/api/rag/filetree/${repoId}?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repoName)}`,
        { headers }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to fetch file tree' }));
        setTreeError(err.error || 'Failed to fetch file tree');
        setTreeLoading(false);
        return;
      }
      const data = await res.json();
      setFileTree(data.tree);

      try {
        storageSet(cacheKey, { tree: data.tree, savedAt: Date.now() });
      } catch {}
      restoreSelection(repoId);
    } catch {
      setTreeError('Network error fetching file tree');
    } finally {
      setTreeLoading(false);
    }
  }

  function restoreSelection(repoId: number) {
    try {
      const saved = storageGet<string[]>(`codex_index_selection_${repoId}`);
      if (saved && Array.isArray(saved)) {
        setSelectedPaths(new Set(saved));
      } else {
        setSelectedPaths(new Set());
      }
    } catch {
      setSelectedPaths(new Set());
    }
  }

  function persistSelection(repoId: number, paths: Set<string>) {
    try {
      storageSet(`codex_index_selection_${repoId}`, [...paths]);
    } catch {}
  }

  async function startSelectiveIndex(repoId: number, owner: string, repoName: string) {
    setError('');
    setIndexingSelected(true);
    const pathsArray = [...selectedPaths];
    try {
      const res = await fetch(`${API}/api/rag/index`, {
        method: 'POST', headers,
        body: JSON.stringify({ repoId, owner, repoName, selectedPaths: pathsArray }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || (res.status === 429 ? 'Rate limit reached — wait a moment and try again.' : 'Failed to start indexing'));
        setIndexingSelected(false);
        return;
      }
      setFileTree(null);
      setSelectedPaths(new Set());
      setPickingRepoId(null);
      setNewRepoId(null);
      setIndexingSelected(false);
      pollJob(data.repoId ?? repoId, data.jobId);
    } catch {
      setError('Network error starting index');
      setIndexingSelected(false);
    }
  }

  function handleSelectionChange(newSelection: Set<string>) {
    setSelectedPaths(newSelection);
    const activeRepoId = pickingRepoId ?? newRepoId;
    if (activeRepoId) persistSelection(activeRepoId, newSelection);
  }

  async function loadData() {
    try {
      const [indexRes, ghRes, owRes] = await Promise.all([
        fetch(`${API}/api/rag/repos`, { headers }),
        fetch(`${API}/api/github/repos`, { headers }),
        fetch(`${API}/api/rag/owasp/status`, { headers }),
      ]);
      if (indexRes.ok) setRepos(await indexRes.json());
      if (ghRes.ok) setGithubRepos(await ghRes.json());
      if (owRes.ok) setOwaspStatus(await owRes.json());
    } catch (e) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function pollJob(repoId: number, jobId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API}/api/rag/jobs/${jobId}`, { headers });
        if (!res.ok) return;
        const job: Job = await res.json();
        setActiveJobs(prev => ({ ...prev, [repoId]: job }));
        if (job.status === 'done' || job.status === 'failed') {
          clearInterval(pollRef.current!);
          setTimeout(loadData, 1500);
        }
      } catch {}
    }, 1200);
  }

  async function startIndex(repoId: number | null, fullName?: string) {
    setError('');
    try {
      const res = await fetch(`${API}/api/rag/index`, {
        method: 'POST', headers,
        body: JSON.stringify(repoId ? { repoId } : { fullName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || (res.status === 429 ? 'Rate limit reached — wait a moment and try again.' : 'Failed to start indexing'));
        return;
      }
      pollJob(data.repoId ?? repoId ?? 0, data.jobId);
    } catch (e) {
      setError('Network error starting index');
    }
  }

  async function deleteIndex(repoId: number) {
    if (!confirm('Delete this index? The repo can be re-indexed at any time.')) return;
    try {
      const res = await fetch(`${API}/api/rag/repos/${repoId}`, { method: 'DELETE', headers });
      if (res.ok) loadData();
    } catch {}
  }

  async function handleSeedOwasp() {
    setOwaspSeeding(true);
    setOwaspMessage(null);
    try {
      const res = await fetch(`${API}/api/rag/owasp/seed`, { method: 'POST', headers });
      const data = await res.json();
      if (res.ok) {
        setOwaspMessage(`✓ Seeded successfully — ${data.entries} entries`);
        const r = await fetch(`${API}/api/rag/owasp/status`, { headers });
        if (r.ok) setOwaspStatus(await r.json());
      } else {
        setOwaspMessage(`✗ ${data.error ?? 'Seed failed'}`);
      }
    } catch {
      setOwaspMessage('✗ Network error');
    } finally {
      setOwaspSeeding(false);
    }
  }

  const indexedNames = new Set(repos.map(r => r.full_name));
  const unindexedRepos = githubRepos.filter(r => !indexedNames.has(r.full_name));

  const selectedGhRepo = useMemo(() => {
    return githubRepos.find(r => r.id === selectedRepoId);
  }, [githubRepos, selectedRepoId]);

  const filteredIndexedRepos = useMemo(() => {
    if (!selectedRepoId || !selectedGhRepo) return repos;
    return repos.filter(r => r.full_name === selectedGhRepo.full_name);
  }, [repos, selectedRepoId, selectedGhRepo]);

  const filteredUnindexedRepos = useMemo(() => {
    if (!selectedRepoId || !selectedGhRepo) return unindexedRepos;
    return unindexedRepos.filter(r => r.full_name === selectedGhRepo.full_name);
  }, [unindexedRepos, selectedRepoId, selectedGhRepo]);

  function fmtDuration(ms: number) {
    if (!ms) return '—';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function PipelineBar({ job, repoStatus }: { job?: Job; repoStatus: string }) {
    const currentStage = job?.status || repoStatus;
    const currentIdx = STAGE_ORDER.indexOf(currentStage);

    return (
      <div style={{ marginTop: '1rem' }}>
        <div style={{ display: 'flex', gap: 0 }}>
          {STAGE_ORDER.map((stage, i) => {
            const done = i < currentIdx || currentStage === 'done' || repoStatus === 'ready';
            const active = stage === currentStage && currentStage !== 'done' && repoStatus !== 'ready';
            return (
              <div key={stage} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.375rem' }}>
                <div style={{ width: '100%', height: '3px', background: done ? 'var(--red)' : active ? 'var(--red)' : 'var(--border-2)', position: 'relative', transition: 'background 0.3s' }}>
                  {active && (
                    <div style={{
                      position: 'absolute', top: 0, left: 0, height: '100%', width: '40%',
                      background: 'rgba(46, 27, 156, 0.5)',
                      animation: 'shimmer 1.2s ease-in-out infinite',
                    }} />
                  )}
                </div>
                <span style={{ fontSize: '0.5rem', color: done || active ? 'var(--text-2)' : 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'center' }}>
                  {STAGE_LABELS[stage]}
                </span>
              </div>
            );
          })}
        </div>
        {job && (
          <div style={{ marginTop: '0.625rem', display: 'flex', gap: '1.5rem' }}>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Files: {job.progress.filesProcessed}/{job.progress.totalFiles}
            </span>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Chunks: {job.progress.chunksStored}/{job.progress.totalChunks || '?'}
            </span>
          </div>
        )}
      </div>
    );
  }

  if (loading) return (
    <div style={{ minHeight: '100dvh', paddingTop: '52px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="loader" />
    </div>
  );

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100dvh', paddingTop: '52px' }}>
      <style>{`
        @keyframes shimmer { 0%,100% { left:0; width:40%; } 50% { left:60%; width:40%; } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
      `}</style>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '3rem 1.5rem' }}>
        {/* Header */}
        <div style={{ marginBottom: '3rem', borderBottom: '1px solid var(--border)', paddingBottom: '2rem' }}>
          <span className="label" style={{ display: 'block', marginBottom: '0.75rem' }}>// RAG Index Manager</span>
          <h1 className="heading" style={{ marginBottom: '0.75rem' }}>Codebase Index Pipeline</h1>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-2)', maxWidth: '600px' }}>
            Index your GitHub repositories into ChromaDB for RAG-powered code reviews and codebase chat.
            Each index parses, chunks, and embeds your source code into searchable vectors.
          </p>
        </div>

        {error && (
          <div style={{ marginBottom: '1.5rem', padding: '0.875rem 1.25rem', background: 'var(--red-dim)', border: '1px solid var(--red-border)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--red)' }}>{error}</span>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '2rem', alignItems: 'start' }}>
          {/* Main — Indexed Repos */}
          <div>
            {/* Repo Selector */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              marginBottom: '2rem',
              background: 'var(--bg-1)',
              padding: '1rem',
              border: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: '0.6875rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Select Repository:
              </span>
              <select
                value={selectedRepoId ?? ''}
                onChange={e => {
                  const val = e.target.value ? Number(e.target.value) : null;
                  setSelectedRepoId(val);
                  persist(val);
                  setFileTree(null);
                  setTreeError('');
                  setSelectedPaths(new Set());
                }}
                style={{
                  flex: 1,
                  padding: '0.5rem 0.75rem',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border-2)',
                  color: 'var(--text-1)',
                  fontSize: '0.75rem',
                  fontFamily: 'inherit',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="">All Repositories</option>
                {githubRepos.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.full_name} {indexedNames.has(r.full_name) ? '(Indexed)' : '(Unindexed)'}
                  </option>
                ))}
              </select>
              {selectedRepoId !== null && (
                <button
                  onClick={handleClear}
                  className="btn-ghost"
                  style={{
                    padding: '0.5rem 1rem',
                    fontSize: '0.6875rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  // Reset
                </button>
              )}
            </div>
            {/* INDEX A NEW REPOSITORY */}
            <div style={{
              marginBottom: '2rem',
              background: 'var(--bg-1)',
              padding: '1rem',
              border: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: '0.6875rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: '0.75rem' }}>
                // INDEX A NEW REPOSITORY
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <select
                  value={newRepoId ?? ''}
                  onChange={e => {
                    const val = e.target.value ? Number(e.target.value) : null;
                    setNewRepoId(val);
                    setFileTree(null);
                    setTreeError('');
                    setSelectedPaths(new Set());
                    setPickingRepoId(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '0.5rem 0.75rem',
                    background: 'var(--bg-2)',
                    border: '1px solid var(--border-2)',
                    color: 'var(--text-1)',
                    fontSize: '0.75rem',
                    fontFamily: 'inherit',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="">Select a repository to index ▾</option>
                  {unindexedRepos.map(r => (
                    <option key={r.id} value={r.codex_repo_id ?? r.id}>{r.full_name}</option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    if (!newRepoId) return;
                    const repo = unindexedRepos.find(r => (r.codex_repo_id ?? r.id) === newRepoId);
                    if (!repo) return;
                    const [owner, name] = repo.full_name.split('/');
                    loadFileTree(newRepoId, owner, name);
                  }}
                  disabled={!newRepoId || treeLoading}
                  className="btn-primary"
                  style={{ padding: '0.5rem 1rem', fontSize: '0.6875rem', opacity: !newRepoId || treeLoading ? 0.5 : 1 }}
                >
                  {treeLoading && newRepoId ? '// FETCHING FILE TREE...' : 'BROWSE FILES →'}
                </button>
              </div>

              {treeError && (
                <div style={{ marginTop: '0.75rem', padding: '0.75rem 1rem', background: 'var(--red-dim)', border: '1px solid var(--red-border)' }}>
                  <span style={{ fontSize: '0.6875rem', color: 'var(--red)' }}>{treeError}</span>
                </div>
              )}

              {/* FileTreePicker for new repo */}
              {newRepoId && fileTree && (
                <div style={{ marginTop: '1rem' }}>
                  <FileTreePicker
                    tree={fileTree}
                    selected={selectedPaths}
                    onChange={handleSelectionChange}
                  />
                  {/* Selection Summary Bar */}
                  <div style={{
                    background: 'var(--bg-1)',
                    border: '1px solid var(--border)',
                    borderTop: 'none',
                    padding: '0.75rem 1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    flexWrap: 'wrap',
                  }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-1)', fontWeight: 600 }}>
                      {selectedPaths.size} file{selectedPaths.size !== 1 ? 's' : ''} selected
                    </span>
                    <span style={{ fontSize: '0.625rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      · {selectedPaths.size > 0 ? (() => {
                        const secs = selectedPaths.size * 1.2;
                        return secs > 60 ? `~${Math.round(secs / 60)} min estimated` : `~${Math.round(secs)} sec estimated`;
                      })() : '—'}
                    </span>
                    <span style={{ fontSize: '0.625rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      · {(() => {
                        if (selectedPaths.size === 0) return 'no files selected';
                        const folders = new Set<string>();
                        for (const p of selectedPaths) {
                          const segs = p.split('/');
                          folders.add(segs.length > 1 ? segs[0] : '.');
                        }
                        if (folders.size === 1) return [...folders][0] + '/ only';
                        return `${folders.size} folders selected`;
                      })()}
                    </span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.375rem' }}>
                      <button
                        onClick={() => {
                          if (!fileTree) return;
                          const all = new Set<string>();
                          for (const n of fileTree) {
                            if (n.type === 'blob') all.add(n.path);
                          }
                          handleSelectionChange(all);
                        }}
                        className="btn-ghost"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.6rem' }}
                      >
                        [SELECT ALL]
                      </button>
                      <button
                        onClick={() => handleSelectionChange(new Set())}
                        className="btn-ghost"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.6rem' }}
                      >
                        [NONE]
                      </button>
                    </div>
                  </div>
                  <div style={{ marginTop: '0.75rem' }}>
                    <button
                      onClick={() => {
                        if (!newRepoId) return;
                        const repo = unindexedRepos.find(r => (r.codex_repo_id ?? r.id) === newRepoId);
                        if (!repo) return;
                        const [owner, name] = repo.full_name.split('/');
                        startSelectiveIndex(newRepoId, owner, name);
                      }}
                      disabled={selectedPaths.size === 0 || indexingSelected}
                      className="btn-primary"
                      style={{
                        padding: '0.625rem 1.25rem',
                        fontSize: '0.6875rem',
                        opacity: selectedPaths.size === 0 || indexingSelected ? 0.4 : 1,
                        cursor: selectedPaths.size === 0 || indexingSelected ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {indexingSelected ? 'INDEXING...' : 'INDEX SELECTED FILES →'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {filteredIndexedRepos.length > 0 && (
              <div style={{ marginBottom: '2.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  <span className="label">Indexed Repositories</span>
                  <span className="tag">{filteredIndexedRepos.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', border: '1px solid var(--border)' }}>
                  {filteredIndexedRepos.map(repo => {
                    const job = activeJobs[repo.repo_id];
                    const isRunning = job && job.status !== 'done' && job.status !== 'failed';
                    return (
                      <div key={repo.repo_id} style={{ background: 'var(--bg-1)', padding: '1.5rem', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                            <StatusDot status={isRunning ? (job?.status || 'pending') : repo.status} />
                            <div>
                              <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-1)' }}>{repo.full_name || `${repo.owner}/${repo.name}`}</p>
                              <p style={{ fontSize: '0.6875rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '0.2rem' }}>
                                {STAGE_LABELS[isRunning ? (job?.status || 'pending') : repo.status]}
                              </p>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            {repo.language && <span className="tag">{repo.language}</span>}
                            <button
                              onClick={() => {
                                setPickingRepoId(repo.repo_id);
                                setNewRepoId(null);
                                loadFileTree(repo.repo_id, repo.owner, repo.name);
                              }}
                              disabled={!!isRunning}
                              className="btn-ghost"
                              style={{ padding: '0.25rem 0.625rem', fontSize: '0.6rem', opacity: isRunning ? 0.5 : 1 }}
                            >
                              Re-index
                            </button>
                            <button
                              onClick={() => deleteIndex(repo.repo_id)}
                              disabled={!!isRunning}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.6rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'inherit', padding: '0.25rem 0.5rem', opacity: isRunning ? 0.4 : 1 }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>

                        {/* Metrics */}
                        {!isRunning && repo.status === 'ready' && (
                          <div style={{ display: 'flex', gap: '2rem', marginBottom: '0.75rem' }}>
                            {[
                              { label: 'Chunks', value: repo.chunk_count?.toLocaleString() || '—' },
                              { label: 'Files', value: repo.files_processed || '—' },
                              { label: 'Duration', value: fmtDuration(repo.index_duration_ms) },
                              { label: 'Indexed', value: repo.last_indexed_at ? new Date(repo.last_indexed_at).toLocaleDateString() : '—' },
                            ].map(m => (
                              <div key={m.label}>
                                <p style={{ fontSize: '0.625rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{m.label}</p>
                                <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-1)' }}>{m.value}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {repo.status === 'failed' && repo.error_message && (
                          <p style={{ fontSize: '0.75rem', color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', padding: '0.625rem', marginBottom: '0.75rem' }}>
                            Error: {repo.error_message}
                          </p>
                        )}

                        {/* FileTreePicker inline when picking */}
                        {pickingRepoId === repo.repo_id ? (
                          <div style={{ marginTop: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                              <span style={{ fontSize: '0.6875rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                {treeLoading ? '// FETCHING FILE TREE...' : '// SELECT FILES TO INDEX'}
                              </span>
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                  onClick={() => {
                                    setPickingRepoId(null);
                                    setFileTree(null);
                                    setSelectedPaths(new Set());
                                  }}
                                  className="btn-ghost"
                                  style={{ padding: '0.25rem 0.625rem', fontSize: '0.6rem' }}
                                >
                                  CANCEL
                                </button>
                                <button
                                  onClick={() => startSelectiveIndex(repo.repo_id, repo.owner, repo.name)}
                                  disabled={selectedPaths.size === 0 || indexingSelected}
                                  className="btn-primary"
                                  style={{ padding: '0.25rem 0.75rem', fontSize: '0.6rem', opacity: selectedPaths.size === 0 || indexingSelected ? 0.4 : 1 }}
                                >
                                  START INDEX →
                                </button>
                              </div>
                            </div>
                            {treeLoading ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '2rem 1rem' }}>
                                <div className="loader" style={{ width: '12px', height: '12px' }} />
                                <span style={{ fontSize: '0.6875rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                  // FETCHING FILE TREE...
                                </span>
                              </div>
                            ) : fileTree ? (
                              <>
                                <FileTreePicker
                                  tree={fileTree}
                                  selected={selectedPaths}
                                  onChange={handleSelectionChange}
                                />
                                <div style={{
                                  background: 'var(--bg-1)',
                                  border: '1px solid var(--border)',
                                  borderTop: 'none',
                                  padding: '0.75rem 1rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.75rem',
                                  flexWrap: 'wrap',
                                }}>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-1)', fontWeight: 600 }}>
                                    {selectedPaths.size} file{selectedPaths.size !== 1 ? 's' : ''} selected
                                  </span>
                                  <span style={{ fontSize: '0.625rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                    · {selectedPaths.size > 0 ? (() => {
                                      const secs = selectedPaths.size * 1.2;
                                      return secs > 60 ? `~${Math.round(secs / 60)} min estimated` : `~${Math.round(secs)} sec estimated`;
                                    })() : '—'}
                                  </span>
                                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.375rem' }}>
                                    <button onClick={() => { if (!fileTree) return; const all = new Set<string>(); for (const n of fileTree) { if (n.type === 'blob') all.add(n.path); } handleSelectionChange(all); }} className="btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.6rem' }}>[ALL]</button>
                                    <button onClick={() => handleSelectionChange(new Set())} className="btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.6rem' }}>[NONE]</button>
                                  </div>
                                </div>
                              </>
                            ) : treeError ? (
                              <p style={{ fontSize: '0.75rem', color: '#f87171' }}>{treeError}</p>
                            ) : null}
                          </div>
                        ) : (
                          <>
                            <PipelineBar job={isRunning ? job : undefined} repoStatus={repo.status} />

                            {repo.status === 'ready' && (
                              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
                                <Link to="/chat" className="btn-ghost" style={{ padding: '0.375rem 0.75rem', fontSize: '0.6rem' }}>
                                  Chat with repo →
                                </Link>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Unindexed repos */}
            {filteredUnindexedRepos.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  <span className="label">Available to Index</span>
                  <span className="tag">{filteredUnindexedRepos.length}</span>
                </div>
                <div style={{ border: '1px solid var(--border)' }}>
                  {filteredUnindexedRepos.map((repo, i) => (
                    <div key={repo.id} style={{
                      padding: '1.25rem 1.5rem',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      borderBottom: i < filteredUnindexedRepos.length - 1 ? '1px solid var(--border)' : 'none',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                        <span style={{ width: '7px', height: '7px', background: 'var(--border-2)', display: 'inline-block', flexShrink: 0 }} />
                        <div>
                          <p style={{ fontSize: '0.8125rem', color: 'var(--text-1)', fontWeight: 500 }}>{repo.full_name}</p>
                          {repo.description && (
                            <p style={{ fontSize: '0.6875rem', color: 'var(--text-3)', marginTop: '0.125rem', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{repo.description}</p>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        {repo.language && <span className="tag">{repo.language}</span>}
                        <button
                          onClick={() => startIndex(repo.codex_repo_id ?? null, repo.full_name)}
                          className="btn-primary"
                          style={{ padding: '0.375rem 0.75rem', fontSize: '0.6rem' }}
                        >
                          Index repo
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {repos.length === 0 && unindexedRepos.length === 0 ? (
              <div style={{ padding: '4rem 2rem', textAlign: 'center', border: '1px solid var(--border)' }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', marginBottom: '0.5rem' }}>No GitHub repositories found.</p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>Connect your GitHub account in settings to see your repos here.</p>
              </div>
            ) : (filteredIndexedRepos.length === 0 && filteredUnindexedRepos.length === 0) ? (
              <div style={{ padding: '4rem 2rem', textAlign: 'center', border: '1px solid var(--border)' }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', marginBottom: '0.5rem' }}>No repositories match your selection.</p>
                <button onClick={handleClear} className="btn-ghost" style={{ padding: '0.5rem 1rem', fontSize: '0.6875rem' }}>
                  Clear Filter
                </button>
              </div>
            ) : null}
          </div>

          {/* Sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            {/* OWASP Status Card */}
            <div style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <span className="label">OWASP Corpus</span>
                {owaspStatus && (
                  <span className="tag" style={owaspStatus.status === 'ready' ? { background: 'rgba(74,222,128,0.08)', borderColor: 'rgba(74,222,128,0.3)', color: '#4ade80' } : {}}>
                    {owaspStatus.status === 'ready' ? 'Ready' : 'Empty'}
                  </span>
                )}
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-2)', lineHeight: '1.6', marginBottom: '1rem' }}>
                OWASP Top 10 vulnerability patterns used to ground security findings in every code review.
              </p>
              {owaspStatus && (
                <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-1)', marginBottom: '1rem' }}>
                  {owaspStatus.count} <span style={{ fontSize: '0.625rem', color: 'var(--text-3)', fontWeight: 400, textTransform: 'uppercase', letterSpacing: '0.1em' }}>entries</span>
                </p>
              )}
              <button
                onClick={handleSeedOwasp}
                disabled={owaspSeeding}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: '1px solid var(--border-2)',
                  color: owaspSeeding ? 'var(--text-3)' : 'var(--text-1)',
                  fontFamily: 'var(--font)',
                  fontSize: '11px',
                  fontWeight: 500,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  padding: '8px 16px',
                  cursor: owaspSeeding ? 'not-allowed' : 'pointer',
                  transition: 'border-color 0.15s',
                }}
              >
                {owaspSeeding ? '// SEEDING...' : 'RE-SEED OWASP'}
              </button>
              {owaspMessage && (
                <p style={{
                  fontSize: '11px',
                  marginTop: '8px',
                  color: owaspMessage.startsWith('✓') ? 'var(--green-text)' : '#ef4444',
                }}>
                  {owaspMessage}
                </p>
              )}
            </div>

            {/* How it works */}
            <div style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', padding: '1.5rem', marginTop: '1px' }}>
              <span className="label" style={{ display: 'block', marginBottom: '1rem' }}>How indexing works</span>
              {[
                { step: '01', label: 'Parse', desc: 'Fetches source files from GitHub via Octokit' },
                { step: '02', label: 'Chunk', desc: 'Splits files by functions/classes with overlap' },
                { step: '03', label: 'Embed', desc: 'Generates 384-dim vectors with all-MiniLM-L6-v2' },
                { step: '04', label: 'Store', desc: 'Upserts into ChromaDB with cosine similarity' },
              ].map((item, i) => (
                <div key={item.step} style={{ display: 'flex', gap: '0.75rem', marginBottom: i < 3 ? '1rem' : 0 }}>
                  <span style={{ fontSize: '0.6rem', color: 'var(--red)', fontWeight: 700, flexShrink: 0, marginTop: '2px' }}>{item.step}</span>
                  <div>
                    <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-1)', marginBottom: '0.2rem' }}>{item.label}</p>
                    <p style={{ fontSize: '0.6875rem', color: 'var(--text-3)', lineHeight: '1.5' }}>{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Quick links */}
            <div style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', padding: '1.25rem', marginTop: '1px' }}>
              <span className="label" style={{ display: 'block', marginBottom: '0.75rem' }}>Next steps</span>
              <Link to="/chat" className="btn-ghost" style={{ width: '100%', justifyContent: 'center', fontSize: '0.6rem', marginBottom: '0.5rem', display: 'flex' }}>
                Chat with codebase →
              </Link>
              <Link to="/playground" className="btn-ghost" style={{ width: '100%', justifyContent: 'center', fontSize: '0.6rem', display: 'flex' }}>
                RAG-grounded review →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
