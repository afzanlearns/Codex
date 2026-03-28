import { useEffect, useRef, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  delay?: number;
  className?: string;
}

export default function AnimatedEntry({ children, delay = 0, className = '' }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
            el.style.filter = 'blur(0px)';
          }, delay);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: 0,
        transform: 'translateY(24px)',
        filter: 'blur(4px)',
        transition: `opacity 0.8s cubic-bezier(0.32,0.72,0,1),
                     transform 0.8s cubic-bezier(0.32,0.72,0,1),
                     filter 0.8s cubic-bezier(0.32,0.72,0,1)`,
        willChange: 'transform, opacity',
      }}
    >
      {children}
    </div>
  );
}
