import { useState } from 'react';
import { api } from '../lib/api';
import { Review } from '../types';
import ScoreRing from '../components/ScoreRing';
import ReviewCard from '../components/ReviewCard';

const LANGUAGES = ['typescript', 'javascript', 'python', 'java', 'go', 'rust', 'cpp', 'sql', 'php'];

const SCORE_KEYS: Array<{ key: keyof Review['scores']; label: string }> = [
  { key: 'correctness',     label: 'Correctness' },
  { key: 'security',        label: 'Security' },
  { key: 'readability',     label: 'Readability' },
  { key: 'performance',     label: 'Performance' },
  { key: 'maintainability', label: 'Maintainability' },
];

const PLACEHOLDER = `// Paste any code here to get an instant AI review
function fetchUserData(userId) {
  const query = "SELECT * FROM users WHERE id = " + userId;
  return db.execute(query);
}`;

export default function Playground() {
  const [code, setCode]         = useState('');
  const [language, setLanguage] = useState('javascript');
  const [review, setReview]     = useState<Review | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  async function handleReview() {
    if (!code.trim() || code.length < 10) {
      setError('Please paste at least 10 characters of code.');
      return;
    }
    setLoading(true);
    setError('');
    setReview(null);
    try {
      const result = await api.playground.review({ code, language });
      setReview(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review failed. Check your connection.');
    } finally {
      setLoading(false);
    }
  }

  function scoreColor(s: number) {
    if (s >= 8.5) return '#8b5cf6';
    if (s >= 7)   return '#10b981';
    if (s >= 5)   return '#f59e0b';
    return '#ef4444';
  }

  return (
    <div className="min-h-[100dvh] pt-28 pb-16 px-4 md:px-8 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="mb-8">
        <span className="eyebrow mb-3">Playground</span>
        <h1 className="text-3xl font-semibold tracking-tight mt-3">
          Instant code review
        </h1>
        <p className="text-white/30 mt-2 text-sm">No account needed. Paste code, select language, review.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

        {/* ── Left: Code Editor ── */}
        <div className="bezel-outer">
          <div className="bezel-inner">
            {/* Editor toolbar */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
                <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
                <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
              </div>
              <select
                value={language}
                onChange={e => setLanguage(e.target.value)}
                className="text-xs text-white/50 bg-transparent border border-white/10 rounded-full
                           px-3 py-1 outline-none cursor-pointer hover:border-white/20 transition-colors"
              >
                {LANGUAGES.map(l => (
                  <option key={l} value={l} style={{ background: '#0a0a0a' }}>{l}</option>
                ))}
              </select>
            </div>

            <textarea
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder={PLACEHOLDER}
              spellCheck={false}
              className="w-full min-h-[420px] bg-transparent resize-none outline-none
                         font-mono text-sm text-white/70 placeholder:text-white/15
                         p-5 leading-relaxed"
            />

            <div className="px-4 pb-4 flex items-center justify-between">
              <span className="text-xs text-white/20 font-mono">
                {code.length > 0 ? `${code.length} chars · ${code.split('\n').length} lines` : ''}
              </span>
              <button
                onClick={handleReview}
                disabled={loading}
                className="btn-primary group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Reviewing…
                  </>
                ) : (
                  <>
                    Review code
                    <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-sm
                                     transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                      ↗
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ── Right: Review Results ── */}
        <div className="space-y-4">
          {error && (
            <div className="bezel-outer border-red-500/20">
              <div className="bezel-inner px-5 py-4">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            </div>
          )}

          {!review && !loading && !error && (
            <div className="bezel-outer">
              <div className="bezel-inner px-6 py-12 flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.06]
                                flex items-center justify-center text-xl">
                  ⌘
                </div>
                <p className="text-white/30 text-sm leading-relaxed max-w-xs">
                  Your review will appear here. Findings are interactive — click any card for suggestions.
                </p>
              </div>
            </div>
          )}

          {loading && (
            <div className="bezel-outer">
              <div className="bezel-inner px-6 py-12 flex flex-col items-center gap-4">
                <div className="relative w-12 h-12">
                  <div className="absolute inset-0 rounded-full border-2 border-violet-500/20 border-t-violet-400 animate-spin" />
                </div>
                <p className="text-white/30 text-sm">Analyzing your code…</p>
              </div>
            </div>
          )}

          {review && (
            <>
              {/* Score overview */}
              <div className="bezel-outer"
                style={{ opacity: 0, animation: 'fade-up 0.7s cubic-bezier(0.32,0.72,0,1) forwards' }}>
                <div className="bezel-inner p-6">
                  <div className="flex items-start gap-6">
                    <ScoreRing score={review.scores.overall} size={100} label="Overall" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/50 leading-relaxed">{review.summary}</p>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-2 pt-5 border-t border-white/[0.06]">
                    {SCORE_KEYS.map(({ key, label }) => (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-xs text-white/30 w-24 shrink-0">{label}</span>
                        <div className="flex-1 h-0.5 rounded-full bg-white/[0.06] overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(review.scores[key] / 10) * 100}%`,
                              background: scoreColor(review.scores[key]),
                              transition: 'width 1.2s cubic-bezier(0.32,0.72,0,1)',
                            }}
                          />
                        </div>
                        <span className="text-xs font-mono w-6 text-right"
                              style={{ color: scoreColor(review.scores[key]) }}>
                          {review.scores[key].toFixed(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Comments */}
              {review.comments.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-white/25 uppercase tracking-widest px-1">
                    {review.comments.length} finding{review.comments.length !== 1 ? 's' : ''}
                  </p>
                  {review.comments.map((c, i) => (
                    <ReviewCard key={i} comment={c} index={i} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
