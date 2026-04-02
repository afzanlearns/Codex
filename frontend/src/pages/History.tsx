import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api';

interface HistoryItem {
  id: number;
  score_overall: number;
  language: string;
  summary: string;
  is_playground: boolean;
  created_at: string;
  share_slug?: string;
}

function scoreColor(s: number) {
  if (s >= 8.5) return 'var(--red)';
  if (s >= 7)   return '#10b981';
  if (s >= 5)   return '#fbbf24';
  return '#f87171';
}

function grade(s: number) {
  if (s >= 8.5) return 'A';
  if (s >= 7)   return 'B';
  if (s >= 5)   return 'C';
  if (s >= 3)   return 'D';
  return 'F';
}

export default function History() {
  const [items, setItems]         = useState<HistoryItem[]>([]);
  const [filtered, setFiltered]   = useState<HistoryItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filterLang, setFilterLang] = useState('all');
  const [filterScore, setFilterScore] = useState('all');
  const [sortBy, setSortBy]       = useState<'date'|'score'>('date');
  const navigate = useNavigate();

  useEffect(() => {
    api.reviews.history()
      .then(data => {
        setItems(data as HistoryItem[]);
        setFiltered(data as HistoryItem[]);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let result = [...items];
    if (filterLang !== 'all') result = result.filter(r => r.language === filterLang);
    if (filterScore === 'high')   result = result.filter(r => r.score_overall >= 7);
    if (filterScore === 'medium') result = result.filter(r => r.score_overall >= 4 && r.score_overall < 7);
    if (filterScore === 'low')    result = result.filter(r => r.score_overall < 4);
    result.sort((a, b) => sortBy === 'date'
      ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      : b.score_overall - a.score_overall
    );
    setFiltered(result);
  }, [items, filterLang, filterScore, sortBy]);

  const languages = ['all', ...Array.from(new Set(items.map(r => r.language).filter(Boolean)))];
  const sel = (val: string, cur: string, set: any) => (
    <select value={val === cur ? val : cur} onChange={e => set(e.target.value)} style={{
      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 0, color: 'var(--text-2)', fontSize: '0.75rem',
      padding: '0.3rem 0.75rem', cursor: 'pointer', outline: 'none',
    }}>
      {val === 'lang' ? languages.map(l => <option key={l} value={l} style={{ background: '#111' }}>{l === 'all' ? 'All languages' : l}</option>)
        : val === 'score' ? ['all','high','medium','low'].map(s => <option key={s} value={s} style={{ background: '#111' }}>{s === 'all' ? 'All scores' : s + ' score'}</option>)
        : ['date','score'].map(s => <option key={s} value={s} style={{ background: '#111' }}>Sort: {s}</option>)
      }
    </select>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingTop: '6.5rem', paddingBottom: '4rem' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 1.5rem' }}>
        <div style={{ marginBottom: '1.75rem' }}>
          <p style={{ fontSize: '0.65rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.15em', margin: '0 0 0.4rem' }}>Review History</p>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: '#fff', margin: '0 0 0.4rem', letterSpacing: '-0.02em' }}>All Reviews</h1>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-2)', margin: 0 }}>Every review you've submitted — click any row to view details</p>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '0.625rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          {sel('lang', filterLang, setFilterLang)}
          {sel('score', filterScore, setFilterScore)}
          {sel('sort', sortBy, setSortBy)}
          <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-3)', alignSelf: 'center' }}>
            {filtered.length} reviews
          </span>
        </div>

        {/* Table */}
        <div style={{ background: 'var(--bg-1)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '50px 1fr 90px 90px 100px', gap: '1rem', padding: '0.75rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-3)' }}>
            <span>Grade</span><span>Summary</span><span>Language</span><span style={{ textAlign: 'right' }}>Score</span><span style={{ textAlign: 'right' }}>Date</span>
          </div>

          {loading ? (
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {[...Array(5)].map((_, i) => <div key={i} style={{ height: '3.5rem', borderRadius: 0, background: 'var(--bg-1)' }} />)}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-3)', fontSize: '0.875rem' }}>
              No reviews yet. <Link to="/playground" style={{ color: 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', textDecoration: 'none' }}>
              Try the playground 
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </Link>
          </div>
          ) : (
            filtered.map(item => {
              const scoreNum = typeof item.score_overall === 'number' ? item.score_overall : parseFloat(item.score_overall) || 0;
              const g = grade(scoreNum);
              const gColor = scoreColor(scoreNum);
              return (
                <div
                  key={item.id}
                  onClick={() => navigate(`/review/${item.id}`)}
                  style={{
                    display: 'grid', gridTemplateColumns: '50px 1fr 90px 90px 100px',
                    gap: '1rem', padding: '0.875rem 1.25rem',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    cursor: 'pointer', transition: 'background 0.2s', alignItems: 'center',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ width: '1.75rem', height: '1.75rem', borderRadius: '0.4rem', background: `${gColor}15`, border: `1px solid ${gColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: gColor }}>
                    {g}
                  </span>
                  <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.55)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.summary}
                  </p>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-2)', "fontFamily": "'Geist Mono', monospace" }}>{item.language || '—'}</span>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: gColor, "fontFamily": "'Geist Mono', monospace", textAlign: 'right' }}>{scoreNum.toFixed(1)}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-3)', textAlign: 'right' }}>
                    {new Date(item.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
