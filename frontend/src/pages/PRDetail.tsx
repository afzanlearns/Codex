import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';

interface PRDetail {
  pr: {
    id: number; pr_number: number; title: string; state: string;
    developer_name: string; github_username: string; avatar_url?: string;
    repo_name: string; base_branch: string; head_branch: string;
    additions: number; deletions: number; changed_files: number;
    github_url: string; created_at: string; merged_at?: string;
  };
  files: Array<{
    id: number; filename: string; status: string;
    additions: number; deletions: number; patch?: string;
  }>;
  review: {
    id: number; score_overall: number; score_security: number;
    score_correctness: number; score_readability: number;
    score_performance: number; score_maintainability: number;
    summary: string; created_at: string;
    comments: string; // JSON string
  } | null;
}

function scoreColor(s: number): string {
  if (s >= 8) return '#4ade80';
  if (s >= 6) return '#fbbf24';
  if (s >= 4) return '#fb923c';
  return '#f87171';
}

function parseComments(raw: string): Array<{
  id: number; filename?: string; line_start?: number;
  content: string; suggestion?: string; severity: string;
}> {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch { return []; }
}

function DiffLine({ line }: { line: string }) {
  const isAdd    = line.startsWith('+') && !line.startsWith('+++');
  const isDel    = line.startsWith('-') && !line.startsWith('---');
  const isHeader = line.startsWith('@@');
  return (
    <div style={{
      padding: '0 1rem',
      background: isAdd ? 'rgba(74,222,128,0.08)' : isDel ? 'rgba(248,113,113,0.08)' : isHeader ? 'rgba(96,165,250,0.06)' : 'transparent',
      borderLeft: `2px solid ${isAdd ? '#4ade80' : isDel ? '#f87171' : isHeader ? '#60a5fa' : 'transparent'}`,
      minHeight: '20px',
    }}>
      <code style={{
        fontSize: '0.75rem', fontFamily: 'inherit', whiteSpace: 'pre-wrap',
        color: isAdd ? '#4ade80' : isDel ? '#f87171' : isHeader ? '#60a5fa' : 'var(--text-2)',
        wordBreak: 'break-all',
      }}>
        {line}
      </code>
    </div>
  );
}

export default function PRDetail() {
  const { id } = useParams<{ id: string }>();
  const [data, setData]         = useState<PRDetail | null>(null);
  const [loading, setLoading]   = useState(true);
  const [activeFile, setActiveFile] = useState(0);
  const [reviewing, setReviewing]   = useState(false);
  const [activeTab, setActiveTab]   = useState<'diff' | 'review' | 'comments'>('diff');

  useEffect(() => {
    if (!id) return;
    api.prs.get(Number(id))
      .then(d => setData(d as PRDetail))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  async function triggerReview() {
    if (!id) return;
    setReviewing(true);
    await api.prs.triggerReview(Number(id)).catch(console.error);
    setTimeout(() => {
      api.prs.get(Number(id)).then(d => setData(d as PRDetail));
      setReviewing(false);
    }, 8000);
  }

  if (loading) return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', paddingTop: '52px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
      <span className="loader" style={{ width: '18px', height: '18px' }} />
      <span style={{ fontSize: '0.875rem', color: 'var(--text-3)' }}>Loading pull request...</span>
    </div>
  );

  if (!data) return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', paddingTop: '52px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--text-3)', fontSize: '0.875rem' }}>Pull request not found. <Link to="/prs" style={{ color: 'var(--red)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        Back to PRs
      </Link></p>
    </div>
  );

  const { pr, files, review } = data;
  const comments = review ? parseComments(review.comments as string) : [];
  const sevOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  const sortedComments = [...comments].sort((a, b) => (sevOrder[a.severity as keyof typeof sevOrder] ?? 5) - (sevOrder[b.severity as keyof typeof sevOrder] ?? 5));
  const currentFile = files[activeFile];
  const fileComments = currentFile ? comments.filter(c => c.filename === currentFile.filename) : [];

  const tabStyle = (key: string): React.CSSProperties => ({
    padding: '0.5rem 1rem', background: 'none', border: 'none', cursor: 'pointer',
    fontFamily: 'inherit', fontSize: '0.6875rem', textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: activeTab === key ? 'var(--text-1)' : 'var(--text-3)',
    borderBottom: activeTab === key ? '1px solid var(--red)' : '1px solid transparent',
    marginBottom: '-1px', transition: 'color 0.15s',
  });

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', paddingTop: '52px' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0' }}>

        {/* PR Header */}
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <Link to="/prs" style={{ fontSize: '0.7rem', color: 'var(--text-3)', textDecoration: 'none', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
              Pull Requests
            </Link>
            <span style={{ color: 'var(--border-2)' }}>/</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{pr.repo_name}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--text-1)', margin: '0 0 0.5rem', letterSpacing: '-0.01em' }}>
                {pr.title}
              </h1>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.6875rem', color: 'var(--text-3)' }}>
                  #{pr.pr_number} · {pr.developer_name} · {pr.base_branch}
                  <span style={{ display: 'inline-flex', alignItems: 'center', margin: '0 0.3rem' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                  </span>
                  {pr.head_branch}
                </span>
                <span style={{ display: 'flex', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.7rem', color: '#4ade80' }}>+{pr.additions}</span>
                  <span style={{ fontSize: '0.7rem', color: '#f87171' }}>-{pr.deletions}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>{pr.changed_files} files</span>
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
              <a href={pr.github_url} target="_blank" rel="noreferrer"
                style={{ padding: '0.5rem 0.875rem', background: 'var(--bg-2)', border: '1px solid var(--border-2)', color: 'var(--text-2)', fontSize: '0.7rem', fontFamily: 'inherit', textDecoration: 'none', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                View on GitHub
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
              </a>
              {!review && (
                <button
                  onClick={triggerReview}
                  disabled={reviewing}
                  style={{ padding: '0.5rem 0.875rem', background: reviewing ? 'rgba(196,30,30,0.5)' : 'var(--red)', border: '1px solid var(--red)', color: '#fff', fontSize: '0.7rem', fontFamily: 'inherit', cursor: reviewing ? 'not-allowed' : 'pointer', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  {reviewing ? <><span className="loader" style={{ width: '10px', height: '10px' }} />Reviewing...</> : (
                    <>
                      Run AI Review
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', height: 'calc(100vh - 52px - 130px)', minHeight: '600px' }}>

          {/* File list sidebar */}
          <div style={{ borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-1)' }}>
              <p style={{ fontSize: '0.6rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>
                {files.length} files changed
              </p>
            </div>
            {files.map((file, i) => {
              const fileHasIssues = comments.filter(c => c.filename === file.filename).length;
              const isActive = activeFile === i;
              return (
                <div
                  key={file.id}
                  onClick={() => setActiveFile(i)}
                  style={{
                    padding: '0.625rem 1rem', cursor: 'pointer',
                    borderBottom: '1px solid var(--border)',
                    background: isActive ? 'var(--red-dim)' : 'transparent',
                    borderLeft: isActive ? '2px solid var(--red)' : '2px solid transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.375rem' }}>
                    <span style={{
                      fontSize: '0.625rem', color: 'var(--text-3)',
                      display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {file.filename.split('/').pop()}
                    </span>
                    {fileHasIssues > 0 && (
                      <span style={{ fontSize: '0.55rem', padding: '0.1rem 0.35rem', background: 'rgba(196,30,30,0.15)', border: '1px solid rgba(196,30,30,0.3)', color: 'var(--red)', flexShrink: 0 }}>
                        {fileHasIssues}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-3)', display: 'block', marginTop: '0.1rem' }}>
                    <span style={{ color: '#4ade80' }}>+{file.additions}</span>
                    {' '}<span style={{ color: '#f87171' }}>-{file.deletions}</span>
                  </span>
                </div>
              );
            })}
          </div>

          {/* Main content */}
          <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

            {/* Score bar (if reviewed) */}
            {review && (
              <div style={{ padding: '0.875rem 1.5rem', background: 'var(--bg-1)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '2rem', flexWrap: 'wrap' }}>
                {[
                  { label: 'Overall',     score: review.score_overall        },
                  { label: 'Correctness', score: review.score_correctness    },
                  { label: 'Security',    score: review.score_security       },
                  { label: 'Readability', score: review.score_readability    },
                  { label: 'Performance', score: review.score_performance    },
                ].map(dim => (
                  <div key={dim.label} style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: '1rem', fontWeight: 700, color: scoreColor(dim.score), margin: '0 0 0.1rem', fontFamily: 'inherit' }}>
                      {Math.round(dim.score * 10)}
                    </p>
                    <p style={{ fontSize: '0.55rem', color: 'var(--text-3)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{dim.label}</p>
                  </div>
                ))}
                <p style={{ fontSize: '0.75rem', color: 'var(--text-2)', flex: 1, margin: 0, lineHeight: '1.5', minWidth: '200px' }}>
                  {review.summary}
                </p>
              </div>
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 1.5rem', background: 'var(--bg-1)' }}>
              <button onClick={() => setActiveTab('diff')}     style={tabStyle('diff')}>Diff</button>
              <button onClick={() => setActiveTab('review')}   style={tabStyle('review')}>
                AI Review {review ? `(${sortedComments.length})` : ''}
              </button>
              <button onClick={() => setActiveTab('comments')} style={tabStyle('comments')}>
                File Issues {fileComments.length > 0 ? `(${fileComments.length})` : ''}
              </button>
            </div>

            {/* Diff view */}
            {activeTab === 'diff' && currentFile && (
              <div style={{ flex: 1 }}>
                {/* File header */}
                <div style={{ padding: '0.625rem 1.5rem', background: 'var(--bg-2)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <code style={{ fontSize: '0.75rem', color: 'var(--text-1)' }}>{currentFile.filename}</code>
                  <span style={{
                    fontSize: '0.6rem', padding: '0.15rem 0.5rem',
                    background: currentFile.status === 'added' ? 'rgba(74,222,128,0.1)' : currentFile.status === 'removed' ? 'rgba(248,113,113,0.1)' : 'var(--bg-3)',
                    border: `1px solid ${currentFile.status === 'added' ? 'rgba(74,222,128,0.3)' : currentFile.status === 'removed' ? 'rgba(248,113,113,0.3)' : 'var(--border-2)'}`,
                    color: currentFile.status === 'added' ? '#4ade80' : currentFile.status === 'removed' ? '#f87171' : 'var(--text-3)',
                    textTransform: 'uppercase',
                  }}>
                    {currentFile.status}
                  </span>
                </div>

                {/* Diff content */}
                <div style={{ fontFamily: 'inherit', fontSize: '0.8rem' }}>
                  {currentFile.patch ? (
                    currentFile.patch.split('\n').map((line, i) => (
                      <DiffLine key={i} line={line} />
                    ))
                  ) : (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-3)', fontSize: '0.8rem' }}>
                      No diff available for this file
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Full review tab */}
            {activeTab === 'review' && (
              <div style={{ padding: '1.5rem' }}>
                {!review ? (
                  <div style={{ textAlign: 'center', padding: '3rem', border: '1px solid var(--border)' }}>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', margin: '0 0 1rem' }}>
                      This PR has not been reviewed yet.
                    </p>
                    <button onClick={triggerReview} disabled={reviewing} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {reviewing ? 'Reviewing...' : (
                        <>
                          Run AI Review
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div>
                    <div style={{ padding: '1rem', background: 'var(--bg-1)', border: '1px solid var(--border)', marginBottom: '1.5rem' }}>
                      <p style={{ fontSize: '0.6rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 0.5rem' }}>AI Summary</p>
                      <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', lineHeight: '1.7', margin: 0 }}>{review.summary}</p>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                      {sortedComments.map((comment, i) => {
                        const sevColor: Record<string, string> = {
                          critical: '#f87171', high: '#fb923c', medium: '#fbbf24', low: '#4ade80', info: '#60a5fa',
                        };
                        const sc = sevColor[comment.severity] || '#9ca3af';
                        return (
                          <div key={i} style={{ border: `1px solid ${sc}25`, borderLeft: `3px solid ${sc}`, padding: '0.875rem 1rem', background: `${sc}05` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
                              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.6rem', color: sc, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>{comment.severity}</span>
                                {comment.filename && (
                                  <code style={{ fontSize: '0.65rem', color: 'var(--text-3)' }}>
                                    {comment.filename}{comment.line_start ? `:${comment.line_start}` : ''}
                                  </code>
                                )}
                              </div>
                            </div>
                            <p style={{ fontSize: '0.8125rem', color: 'var(--text-2)', margin: '0 0 0.375rem', lineHeight: '1.6' }}>{comment.content}</p>
                            {comment.suggestion && (
                              <p style={{ fontSize: '0.78rem', color: '#4ade80', margin: 0, fontStyle: 'italic' }}>{comment.suggestion}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* File-specific comments */}
            {activeTab === 'comments' && (
              <div style={{ padding: '1.5rem' }}>
                {fileComments.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem', border: '1px solid var(--border)' }}>
                    <p style={{ color: '#34d399', margin: '0 auto 0.75rem', display: 'flex', justifyContent: 'center' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </p>
                    <p style={{ fontSize: '0.875rem', color: '#34d399', margin: '0 0 0.25rem' }}>No issues in this file</p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', margin: 0 }}>{currentFile?.filename}</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                    {fileComments.map((c, i) => (
                      <div key={i} style={{ border: '1px solid var(--border)', padding: '0.875rem 1rem', background: 'var(--bg-1)' }}>
                        <p style={{ fontSize: '0.6rem', color: 'var(--text-3)', margin: '0 0 0.375rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                          Line {c.line_start || '?'} · {c.severity}
                        </p>
                        <p style={{ fontSize: '0.8125rem', color: 'var(--text-2)', margin: '0 0 0.375rem', lineHeight: '1.6' }}>{c.content}</p>
                        {c.suggestion && <p style={{ fontSize: '0.78rem', color: '#4ade80', margin: 0 }}>{c.suggestion}</p>}
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
