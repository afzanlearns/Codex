import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Link } from 'react-router-dom';
import { storageGet, storageSet, storageClear, timeAgo } from '../lib/storage';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  isStreaming?: boolean;
}

interface Source {
  sourceId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  displayLabel: string;
  corpusName: string;
}

interface ChatableRepo {
  repo_id: number;
  name: string;
  owner: string;
  full_name: string;
  language: string;
  chunk_count: number;
  last_indexed_at: string;
}

interface ChatPersistedState {
  activeRepoId: number | null;
  savedAt: string;
}

interface RepoChatState {
  messages: Message[];
  savedAt: string;
}

const SUGGESTIONS = [
  'Where is authentication handled?',
  'How does the database connection work?',
  'What API endpoints are defined?',
  'Explain the main entry point',
  'What tests exist in this repo?',
  'Where are environment variables used?',
];

function SourceBadge({ source }: { source: Source }) {
  return (
    <span
      title={`${source.filePath}:${source.startLine}–${source.endLine}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
        padding: '0.15rem 0.5rem',
        background: source.corpusName === 'review_memory' ? 'var(--brand-soft)' : 'var(--bg-3)',
        border: `1px solid ${source.corpusName === 'review_memory' ? 'var(--brand-border)' : 'var(--border-2)'}`,
        fontSize: '0.6rem', color: 'var(--text-2)',
        textTransform: 'uppercase', letterSpacing: '0.08em',
        cursor: 'default', maxWidth: '180px',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: '0.5rem', color: 'var(--brand-text)' }}>{source.sourceId}</span>
      {source.displayLabel}
    </span>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
      marginBottom: '1.25rem', animation: 'fadeUp 0.25s ease forwards',
    }}>
      {/* Role label */}
      <span style={{
        fontSize: '0.55rem', color: 'var(--text-3)',
        textTransform: 'uppercase', letterSpacing: '0.14em',
        marginBottom: '0.375rem',
        paddingLeft: isUser ? 0 : '0.25rem',
        paddingRight: isUser ? '0.25rem' : 0,
      }}>
        {isUser ? 'You' : 'Codex'}
      </span>

      {/* Bubble */}
      <div style={{
        maxWidth: '75%',
        background: isUser ? 'var(--bg-3)' : 'var(--bg-1)',
        border: `1px solid ${isUser ? 'var(--border-2)' : 'var(--border)'}`,
        padding: '0.875rem 1.125rem',
        position: 'relative',
      }}>
        {msg.isStreaming && !msg.content && (
          <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', height: '1rem' }}>
            {[0, 0.2, 0.4].map(d => (
              <span key={d} style={{
                width: '5px', height: '5px', background: 'var(--red)', display: 'inline-block',
                animation: `bounce 0.9s ${d}s ease-in-out infinite`,
              }} />
            ))}
          </div>
        )}
        <pre style={{
          fontSize: '0.8125rem', color: 'var(--text-1)',
          lineHeight: '1.75', margin: 0, fontFamily: 'inherit',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {msg.content}
          {msg.isStreaming && msg.content && (
            <span style={{ display: 'inline-block', width: '8px', height: '1em', background: 'var(--red)', marginLeft: '2px', animation: 'pulse 0.7s ease-in-out infinite', verticalAlign: 'text-bottom' }} />
          )}
        </pre>
      </div>

      {/* Sources */}
      {msg.sources && msg.sources.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginTop: '0.5rem', maxWidth: '75%' }}>
          <span style={{ fontSize: '0.55rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.12em', alignSelf: 'center' }}>
            Sources:
          </span>
          {msg.sources.map(s => <SourceBadge key={s.sourceId} source={s} />)}
        </div>
      )}
    </div>
  );
}

export default function Chat() {
  const { token } = useAuth();
  const [repos, setRepos] = useState<ChatableRepo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [input, setInput] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Restore persisted global state ──
  const persisted = storageGet<ChatPersistedState>('chat');
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(persisted?.activeRepoId ?? null);
  const [restoredAt] = useState<string | null>(persisted?.savedAt ?? null);

  // ── Messages are stored per-repo ──
  function loadRepoMessages(repoId: number | null): Message[] {
    if (!repoId) return [];
    return storageGet<RepoChatState>(`chat_repo_${repoId}`)?.messages ?? [];
  }

  const [messages, setMessages] = useState<Message[]>(() => loadRepoMessages(persisted?.activeRepoId ?? null));

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // ── Load repos list ──
  useEffect(() => {
    fetch(`${API}/api/chat/repos`, { headers })
      .then(r => r.ok ? r.json() : [])
      .then((data: ChatableRepo[]) => {
        setRepos(data);
        // If no persisted repo, auto-select first
        if (!persisted?.activeRepoId && data.length > 0) {
          const firstId = data[0].repo_id;
          setSelectedRepoId(firstId);
          setMessages(loadRepoMessages(firstId));
        }
      })
      .finally(() => setLoadingRepos(false));
  }, []);

  // ── Scroll to bottom on new messages ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const selectedRepo = repos.find(r => r.repo_id === selectedRepoId);

  // ── Persist messages for active repo ──
  function persistMessages(msgs: Message[], repoId: number | null) {
    if (!repoId) return;
    // Strip isStreaming flag before persisting
    const clean = msgs.filter(m => !m.isStreaming).map(m => ({ ...m, isStreaming: undefined }));
    storageSet(`chat_repo_${repoId}`, { messages: clean, savedAt: new Date().toISOString() } as RepoChatState);
    storageSet('chat', { activeRepoId: repoId, savedAt: new Date().toISOString() } as ChatPersistedState);
  }

  // ── Switch repo ──
  function handleRepoChange(repoId: number) {
    setSelectedRepoId(repoId);
    setActiveSessionId(null); // reset session when switching repo
    const saved = loadRepoMessages(repoId);
    setMessages(saved);
    storageSet('chat', { activeRepoId: repoId, savedAt: new Date().toISOString() } as ChatPersistedState);
  }

  const sendMessage = useCallback(async (query: string) => {
    if (!query.trim() || isStreaming) return;
    setInput('');

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: query };
    const assistantId = (Date.now() + 1).toString();
    const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '', isStreaming: true };

    const newMsgs = [...messages, userMsg, assistantMsg];
    setMessages(newMsgs);
    setIsStreaming(true);
    setStatusMsg('');

    // ── Build sanitized history ──
    // - Map any display role ('codex') to 'assistant'
    // - Strip everything except role + content (no sources, timestamps, etc.)
    // - Only keep the last 8 turns
    const historyForAPI = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-8)
      .map(m => ({
        role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
        content: m.content,
      }));

    // ── Build request body ──
    const body: Record<string, unknown> = {
      repoId: selectedRepoId,
      message: query.trim(),
      history: historyForAPI,
    };

    // Only send sessionId when it is a valid positive integer
    if (activeSessionId && typeof activeSessionId === 'number' && activeSessionId > 0) {
      body.sessionId = activeSessionId;
    }

    abortRef.current = new AbortController();

    try {
      const res = await fetch(`${API}/api/chat`, {
        method: 'POST',
        headers,
        signal: abortRef.current.signal,
        body: JSON.stringify(body),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => '');
        console.error('[chat] request failed', res.status, errText);
        throw new Error(`Chat request failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accText = '';
      let currentSources: Source[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.token) {
                accText += data.token;
                setMessages(prev => prev.map(m =>
                  m.id === assistantId ? { ...m, content: accText } : m
                ));
              } else if (data.sources) {
                currentSources = data.sources;
              } else if (data.sessionId && typeof data.sessionId === 'number') {
                // Capture session ID returned from backend
                setActiveSessionId(data.sessionId);
              } else if (data.message) {
                setStatusMsg(data.message);
              } else if (data.error) {
                accText = `Error: ${data.error}`;
                setMessages(prev => prev.map(m =>
                  m.id === assistantId ? { ...m, content: accText, isStreaming: false } : m
                ));
              }
            } catch {}
          }
        }
      }

      const finalMsgs = newMsgs.map(m =>
        m.id === assistantId
          ? { ...m, content: accText, isStreaming: false, sources: currentSources }
          : m
      );
      setMessages(finalMsgs);
      persistMessages(finalMsgs, selectedRepoId);
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return;
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: 'Request failed. Please try again.', isStreaming: false }
          : m
      ));
    } finally {
      setIsStreaming(false);
      setStatusMsg('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isStreaming, messages, selectedRepoId, activeSessionId, token]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function stopStream() {
    abortRef.current?.abort();
    setIsStreaming(false);
  }

  function clearChat() {
    storageClear('chat');
    if (selectedRepoId) storageClear(`chat_repo_${selectedRepoId}`);
    setMessages([]);
    setStatusMsg('');
    setActiveSessionId(null);
  }

  return (
    <div style={{ background: 'var(--bg)', height: '100dvh', paddingTop: '52px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`
        @keyframes bounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0; } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
      `}</style>

      {/* Top Bar */}
      <div style={{
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-1)',
        padding: '0.75rem 1.5rem',
        display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0,
      }}>
        <span className="label">// Codebase Chat</span>

        {/* Repo selector */}
        {loadingRepos ? (
          <div className="loader" style={{ width: '12px', height: '12px' }} />
        ) : repos.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.6875rem', color: 'var(--text-3)' }}>No indexed repos.</span>
            <Link to="/index-manager" className="btn-primary" style={{ padding: '0.25rem 0.625rem', fontSize: '0.6rem' }}>
              Index a repo →
            </Link>
          </div>
        ) : (
          <select
            value={selectedRepoId ?? ''}
            onChange={e => handleRepoChange(Number(e.target.value))}
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.6875rem', background: 'var(--bg-2)', border: '1px solid var(--border-2)', color: 'var(--text-1)' }}
          >
            <option value="" disabled>Select repo</option>
            {repos.map(r => (
              <option key={r.repo_id} value={r.repo_id}>{r.full_name}</option>
            ))}
          </select>
        )}

        {selectedRepo && (
          <div style={{ display: 'flex', gap: '1rem', marginLeft: 'auto', alignItems: 'center' }}>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {selectedRepo.chunk_count?.toLocaleString()} chunks
            </span>
            {selectedRepo.language && <span className="tag">{selectedRepo.language}</span>}
          </div>
        )}

        {/* Clear button — always visible, styled per spec */}
        <button
          onClick={clearChat}
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
            marginLeft: selectedRepo ? '0' : 'auto',
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
          // Clear Conversation
        </button>
      </div>

      {/* Messages area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '2rem 1.5rem' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto' }}>

          {/* Restore banner */}
          {messages.length > 0 && restoredAt && (
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                // conversation restored from {timeAgo(restoredAt)}
              </span>
            </div>
          )}

          {messages.length === 0 && (
            <div style={{ paddingTop: '3rem' }}>
              <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  <span style={{ width: '8px', height: '8px', background: 'var(--red)', display: 'inline-block' }} />
                  <span style={{ fontSize: '0.6875rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
                    RAG-Powered Codebase Intelligence
                  </span>
                </div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-1)', marginBottom: '0.625rem', letterSpacing: '-0.01em' }}>
                  Ask anything about {selectedRepo ? selectedRepo.name : 'your codebase'}
                </h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-2)', lineHeight: '1.7', maxWidth: '460px', margin: '0 auto' }}>
                  Answers are grounded in retrieved code chunks from your indexed repository.
                  Every response cites the exact file and line range it drew from.
                </p>
              </div>

              {/* Suggestion pills */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.625rem', maxWidth: '580px', margin: '0 auto' }}>
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    disabled={!selectedRepoId || isStreaming}
                    style={{
                      background: 'var(--bg-1)', border: '1px solid var(--border)',
                      padding: '0.75rem 1rem', cursor: 'pointer', textAlign: 'left',
                      fontSize: '0.75rem', color: 'var(--text-2)', fontFamily: 'inherit',
                      transition: 'border-color 0.15s, color 0.15s',
                      opacity: !selectedRepoId ? 0.5 : 1,
                    }}
                    onMouseOver={e => { (e.target as HTMLButtonElement).style.borderColor = 'var(--border-2)'; (e.target as HTMLButtonElement).style.color = 'var(--text-1)'; }}
                    onMouseOut={e => { (e.target as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.target as HTMLButtonElement).style.color = 'var(--text-2)'; }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}

          {statusMsg && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', paddingLeft: '0.25rem' }}>
              <div className="loader" style={{ width: '10px', height: '10px' }} />
              <span style={{ fontSize: '0.6875rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{statusMsg}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Bar */}
      <div style={{
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-1)',
        padding: '1rem 1.5rem',
        flexShrink: 0,
      }}>
        <div style={{ maxWidth: '860px', margin: '0 auto', display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={selectedRepoId ? 'Ask a question about your codebase… (Enter to send, Shift+Enter for newline)' : 'Select an indexed repo above to start chatting'}
              disabled={!selectedRepoId || isStreaming}
              rows={1}
              style={{
                width: '100%', padding: '0.75rem 1rem', resize: 'none',
                fontSize: '0.8125rem', lineHeight: '1.6',
                minHeight: '44px', maxHeight: '160px',
                overflow: 'auto',
                opacity: !selectedRepoId ? 0.5 : 1,
              }}
              onInput={e => {
                const t = e.target as HTMLTextAreaElement;
                t.style.height = 'auto';
                t.style.height = Math.min(t.scrollHeight, 160) + 'px';
              }}
            />
          </div>
          {isStreaming ? (
            <button
              onClick={stopStream}
              className="btn-ghost"
              style={{ padding: '0.625rem 1rem', fontSize: '0.6875rem', flexShrink: 0, height: '44px' }}
            >
              ◼ Stop
            </button>
          ) : (
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || !selectedRepoId}
              className="btn-primary"
              style={{ padding: '0.625rem 1rem', fontSize: '0.6875rem', flexShrink: 0, height: '44px', opacity: (!input.trim() || !selectedRepoId) ? 0.4 : 1 }}
            >
              Send →
            </button>
          )}
        </div>
        <div style={{ maxWidth: '860px', margin: '0.5rem auto 0', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {selectedRepo && (() => {
            try {
              const indexed = storageGet<string[]>(`codex_index_selection_${selectedRepo.repo_id}`);
              if (indexed && indexed.length > 0 && indexed.length < 1000) {
                const folders = [...new Set(indexed.map((p: string) => p.split('/').slice(0, -1).join('/') || '.'))];
                const label = `${indexed.length} FILES INDEXED · ${folders.slice(0, 3).map((f: string) => f + '/').join(' · ')}${folders.length > 3 ? ' · …' : ''}`;
                return (
                  <span
                    title="Only indexed files are searchable. Re-index from Index Manager to add more files."
                    style={{ fontSize: '10px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'help' }}
                  >
                    {label}
                  </span>
                );
              }
            } catch {}
            return null;
          })()}
          <span style={{ fontSize: '0.6rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Hybrid BM25 + Semantic retrieval
          </span>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Llama 3.3 70B · Groq
          </span>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Streamed via SSE
          </span>
        </div>
      </div>
    </div>
  );
}
