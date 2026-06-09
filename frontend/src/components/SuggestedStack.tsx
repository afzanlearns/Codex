interface SuggestedStackProps {
  stack: {
    keep: string[];
    swap: Array<{ original: string; replacement: string; reason: string }>;
    add: string[];
  };
}

export default function SuggestedStack({ stack }: SuggestedStackProps) {
  if (!stack) return null;

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <p style={{ fontSize: '0.65rem', color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.75rem' }}>
        // Suggested Stack
      </p>
      <div style={{ border: '1px solid var(--border)' }}>
        {stack.keep?.length > 0 && (
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-1)' }}>
            <p style={{ fontSize: '0.6rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>Keep</p>
            <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
              {stack.keep.map((item, i) => (
                <span key={i} style={{
                  display: 'inline-block', padding: '0.15rem 0.5rem',
                  background: 'rgba(74,222,128,0.08)',
                  border: '1px solid rgba(74,222,128,0.3)',
                  color: '#4ade80',
                  fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em',
                }}>
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}

        {stack.swap?.length > 0 && (
          <div style={{ padding: '1rem 1.25rem', borderBottom: stack.add?.length > 0 ? '1px solid var(--border)' : 'none', background: 'var(--bg-1)' }}>
            <p style={{ fontSize: '0.6rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>Swap</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {stack.swap.map((item, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '1fr 1.5rem 1fr',
                  gap: '0.5rem', alignItems: 'center',
                  padding: '0.5rem', background: 'var(--bg-2)',
                  fontSize: '0.7rem',
                }}>
                  <span style={{ color: 'var(--text-2)' }}>{item.original}</span>
                  <span style={{ color: 'var(--red)', textAlign: 'center' }}>→</span>
                  <div>
                    <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>{item.replacement}</span>
                    <p style={{ fontSize: '0.6rem', color: 'var(--text-3)', margin: '0.125rem 0 0' }}>{item.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {stack.add?.length > 0 && (
          <div style={{ padding: '1rem 1.25rem', background: 'var(--bg-1)' }}>
            <p style={{ fontSize: '0.6rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>Add</p>
            <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
              {stack.add.map((item, i) => (
                <span key={i} style={{
                  display: 'inline-block', padding: '0.15rem 0.5rem',
                  background: 'rgba(96,165,250,0.08)',
                  border: '1px solid rgba(96,165,250,0.3)',
                  color: '#60a5fa',
                  fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em',
                }}>
                  + {item}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}