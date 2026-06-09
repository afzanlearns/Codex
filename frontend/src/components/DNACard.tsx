interface DNAProps {
  dna: {
    core_patterns: string[];
    transferable_skills: string[];
    domain_essence: string;
  };
}

export default function DNACard({ dna }: DNAProps) {

  if (!dna) return null;

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <p style={{ fontSize: '0.65rem', color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.75rem' }}>
        // Project DNA
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', border: '1px solid var(--border)' }}>
        <div style={{ background: 'var(--bg-1)', padding: '1.25rem' }}>
          <p style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-1)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Core Patterns
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {dna.core_patterns?.map((p, i) => (
              <li key={i} style={{ fontSize: '0.75rem', color: 'var(--text-2)', lineHeight: '1.7', marginBottom: '0.5rem', paddingLeft: '0.75rem', borderLeft: '2px solid var(--red)' }}>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div style={{ background: 'var(--bg-1)', padding: '1.25rem' }}>
          <p style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-1)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Transferable Skills
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {dna.transferable_skills?.map((s, i) => (
              <li key={i} style={{ fontSize: '0.75rem', color: 'var(--text-2)', lineHeight: '1.7', marginBottom: '0.5rem', paddingLeft: '0.75rem', borderLeft: '2px solid var(--red)' }}>
                {s}
              </li>
            ))}
          </ul>
        </div>
        <div style={{ background: 'var(--bg-1)', padding: '1.25rem' }}>
          <p style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-1)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Domain Essence
          </p>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-2)', lineHeight: '1.7', margin: 0 }}>
            {dna.domain_essence}
          </p>
        </div>
      </div>
    </div>
  );
}