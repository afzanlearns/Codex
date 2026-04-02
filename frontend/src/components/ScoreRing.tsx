import { useEffect, useRef } from 'react';

interface Props {
  score: number;   // 0–10
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
  label?: string;
}

function scoreColor(score: number): string {
  if (score >= 8.5) return 'var(--accent)';  // orange-red — excellent
  if (score >= 7)   return '#10b981';  // emerald — good
  if (score >= 5)   return '#f59e0b';  // amber — medium
  if (score >= 3)   return '#f97316';  // orange — low
  return '#ef4444';                    // red — critical
}

export default function ScoreRing({
  score,
  size = 120,
  strokeWidth = 6,
  showLabel = true,
  label,
}: Props) {
  const circleRef = useRef<SVGCircleElement>(null);
  const radius    = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const targetOffset  = circumference - (score / 10) * circumference;
  const color         = scoreColor(score);

  useEffect(() => {
    const el = circleRef.current;
    if (!el) return;

    // Start at full offset (empty ring), animate to target
    el.style.strokeDashoffset = String(circumference);
    el.style.transition = 'none';

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = 'stroke-dashoffset 1.4s cubic-bezier(0.32,0.72,0,1)';
        el.style.strokeDashoffset = String(targetOffset);
      });
    });
  }, [score, circumference, targetOffset]);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
        />
        {/* Progress */}
        <circle
          ref={circleRef}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference}
          style={{ filter: `drop-shadow(0 0 6px ${color}60)` }}
        />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums" style={{ color }}>
            {score.toFixed(1)}
          </span>
          {label && (
            <span className="text-[10px] uppercase tracking-widest text-white/30 mt-0.5">
              {label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
