import IdeaCard from './IdeaCard';

interface IdeaGridProps {
  ideas: Array<{
    title: string;
    domain: string;
    one_liner: string;
    why_same_dna: string;
    what_transfers_directly: string[];
    what_is_new: string;
    difficulty: string;
    impact: string;
  }>;
}

export default function IdeaGrid({ ideas }: IdeaGridProps) {
  if (!ideas || ideas.length === 0) return null;

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <p style={{ fontSize: '0.65rem', color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.75rem' }}>
        // Product Ideas
      </p>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: '1px',
        border: '1px solid var(--border)',
        background: 'var(--border)',
      }}>
        {ideas.map((idea, i) => (
          <div key={i} style={{ background: 'var(--bg)' }}>
            <IdeaCard idea={idea} />
          </div>
        ))}
      </div>
    </div>
  );
}