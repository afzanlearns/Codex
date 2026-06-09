import { useState } from 'react';

interface IdeaProps {
  idea: {
    title: string;
    domain: string;
    one_liner: string;
    why_same_dna: string;
    what_transfers_directly: string[];
    what_is_new: string;
    difficulty: string;
    impact: string;
  };
}

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: '#4ade80',
  intermediate: '#fbbf24',
  advanced: '#f87171',
};

const DOMAIN_COLORS_LIST = [
  '#60a5fa', '#a78bfa', '#f472b6', '#fb923c', '#34d399', '#38bdf8', '#e879f9',
];

function domainColor(domain: string): string {
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = domain.charCodeAt(i) + ((hash << 5) - hash);
  }
  return DOMAIN_COLORS_LIST[Math.abs(hash) % DOMAIN_COLORS_LIST.length];
}

export default function IdeaCard({ idea }: IdeaProps) {
  const [showDetails, setShowDetails] = useState(false);

  const diffColor = DIFFICULTY_COLORS[idea.difficulty] || '#9ca3af';
  const domColor = domainColor(idea.domain);

  return (
    <div style={{
      background: 'var(--bg-1)',
      border: '1px solid var(--border)',
      padding: '1.25rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
        <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-1)', margin: 0, lineHeight: '1.4' }}>
          {idea.title}
        </p>
        <span style={{
          fontSize: '0.55rem', padding: '0.15rem 0.5rem',
          background: `${diffColor}20`,
          border: `1px solid ${diffColor}40`,
          color: diffColor,
          textTransform: 'uppercase', letterSpacing: '0.08em',
          flexShrink: 0,
        }}>
          {idea.difficulty}
        </span>
      </div>

      <span style={{
        display: 'inline-block', alignSelf: 'flex-start',
        fontSize: '0.55rem', padding: '0.15rem 0.5rem',
        background: `${domColor}15`,
        border: `1px solid ${domColor}35`,
        color: domColor,
        textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>
        {idea.domain}
      </span>

      <p style={{ fontSize: '0.75rem', color: 'var(--text-2)', lineHeight: '1.7', margin: 0 }}>
        {idea.one_liner}
      </p>

      <p style={{ fontSize: '0.6875rem', color: 'var(--text-3)', lineHeight: '1.6', margin: 0 }}>
        {idea.impact}
      </p>

      <button
        onClick={() => setShowDetails(!showDetails)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--red)', fontSize: '0.6rem',
          textTransform: 'uppercase', letterSpacing: '0.08em',
          padding: 0, fontFamily: 'inherit', textAlign: 'left',
          marginTop: 'auto',
        }}
      >
        {showDetails ? 'Hide details' : 'View details →'}
      </button>

      {showDetails && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <p style={{ fontSize: '0.6rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>Why same DNA</p>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-2)', margin: 0, lineHeight: '1.6' }}>{idea.why_same_dna}</p>
          </div>
          {idea.what_transfers_directly?.length > 0 && (
            <div>
              <p style={{ fontSize: '0.6rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>What transfers directly</p>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {idea.what_transfers_directly.map((item, i) => (
                  <li key={i} style={{ fontSize: '0.7rem', color: 'var(--text-2)', lineHeight: '1.6', marginBottom: '0.25rem', paddingLeft: '0.5rem', borderLeft: '2px solid var(--border-2)' }}>
                    <code style={{ fontSize: '0.65rem', color: 'var(--red)' }}>{item}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p style={{ fontSize: '0.6rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>What is new</p>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-2)', margin: 0, lineHeight: '1.6' }}>{idea.what_is_new}</p>
          </div>
        </div>
      )}
    </div>
  );
}