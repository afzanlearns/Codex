import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Link } from 'react-router-dom';

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

export default function IndexManager() {
  const { token } = useAuth();
  const [repos, setRepos] = useState<IndexedRepo[]>([]);
  const [githubRepos, setGithubRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeJobs, setActiveJobs] = useState<Record<number, Job>>({});
  const [error, setError] = useState('');
  const [owaspStatus, setOwaspStatus] = useState<{ status: string; count: number } | null>(null);
  const [seedingOwasp, setSeedingOwasp] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

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

  async function startIndex(repoId: number) {
    setError('');
    try {
      const res = await fetch(`${API}/api/rag/index`, {
        method: 'POST', headers,
        body: JSON.stringify({ repoId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to start indexing'); return; }
      pollJob(repoId, data.jobId);
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

  async function seedOwasp() {
    setSeedingOwasp(true);
    try {
      const res = await fetch(`${API}/api/rag/owasp/seed`, { method: 'POST', headers });
      await res.json();
      if (res.ok) {
        setTimeout(async () => {
          const r = await fetch(`${API}/api/rag/owasp/status`, { headers });
          if (r.ok) setOwaspStatus(await r.json());
        }, 1000);
      }
    } finally {
      setSeedingOwasp(false);
    }
  }

  const indexedIds = new Set(repos.map(r => r.repo_id));
  const unindexedRepos = githubRepos.filter(r => !indexedIds.has(r.id));

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
                      background: 'rgba(255,107,26,0.5)',
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
            {repos.length > 0 && (
              <div style={{ marginBottom: '2.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  <span className="label">Indexed Repositories</span>
                  <span className="tag">{repos.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', border: '1px solid var(--border)' }}>
                  {repos.map(repo => {
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
                              onClick={() => startIndex(repo.repo_id)}
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

                        <PipelineBar job={isRunning ? job : undefined} repoStatus={repo.status} />

                        {repo.status === 'ready' && (
                          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
                            <Link to="/chat" className="btn-ghost" style={{ padding: '0.375rem 0.75rem', fontSize: '0.6rem' }}>
                              Chat with repo →
                            </Link>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Unindexed repos */}
            {unindexedRepos.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  <span className="label">Available to Index</span>
                  <span className="tag">{unindexedRepos.length}</span>
                </div>
                <div style={{ border: '1px solid var(--border)' }}>
                  {unindexedRepos.map((repo, i) => (
                    <div key={repo.id} style={{
                      padding: '1.25rem 1.5rem',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      borderBottom: i < unindexedRepos.length - 1 ? '1px solid var(--border)' : 'none',
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
                          onClick={() => startIndex(repo.id)}
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

            {repos.length === 0 && unindexedRepos.length === 0 && (
              <div style={{ padding: '4rem 2rem', textAlign: 'center', border: '1px solid var(--border)' }}>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', marginBottom: '0.5rem' }}>No GitHub repositories found.</p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>Connect your GitHub account in settings to see your repos here.</p>
              </div>
            )}
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
                onClick={seedOwasp}
                disabled={seedingOwasp}
                className="btn-ghost"
                style={{ width: '100%', justifyContent: 'center', fontSize: '0.6rem', opacity: seedingOwasp ? 0.5 : 1 }}
              >
                {seedingOwasp ? 'Seeding...' : 'Re-seed OWASP'}
              </button>
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
