import { useState } from 'react';
import { ReviewComment } from '../types';

const SEV_CONFIG = {
  info:     { dot: 'bg-blue-400/70',   label: 'Info',     text: 'text-blue-300' },
  low:      { dot: 'bg-teal-400/70',   label: 'Low',      text: 'text-teal-300' },
  medium:   { dot: 'bg-amber-400/70',  label: 'Medium',   text: 'text-amber-300' },
  high:     { dot: 'bg-orange-400/70', label: 'High',     text: 'text-orange-300' },
  critical: { dot: 'bg-red-400/70',    label: 'Critical', text: 'text-red-300' },
};

interface Props {
  comment: ReviewComment;
  index: number;
}

export default function ReviewCard({ comment, index }: Props) {
  const [expanded, setExpanded] = useState(false);
  const sev = SEV_CONFIG[comment.severity];

  return (
    <div
      className="bezel-outer cursor-pointer group"
      style={{
        opacity: 0,
        transform: 'translateY(16px)',
        animation: `fade-up 0.6s cubic-bezier(0.32,0.72,0,1) ${index * 60}ms forwards`,
      }}
      onClick={() => setExpanded(e => !e)}
    >
      <div className="bezel-inner p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`w-2 h-2 rounded-full shrink-0 ${sev.dot}`} />
            <span className={`text-xs font-medium uppercase tracking-wider ${sev.text}`}>
              {sev.label}
            </span>
            {comment.filename && (
              <span className="text-xs text-white/30 font-mono truncate">
                {comment.filename}
                {comment.line_start && `:${comment.line_start}`}
              </span>
            )}
          </div>
          {/* Category pills */}
          <div className="flex gap-1 shrink-0">
            {comment.categories.slice(0, 2).map(cat => (
              <span
                key={cat}
                className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full
                           bg-white/[0.06] border border-white/10 text-white/40"
              >
                {cat}
              </span>
            ))}
          </div>
        </div>

        {/* Finding */}
        <p className="mt-3 text-sm text-white/70 leading-relaxed">{comment.content}</p>

        {/* Suggestion — expandable */}
        {comment.suggestion && (
          <div
            className="overflow-hidden transition-all duration-500"
            style={{ maxHeight: expanded ? '200px' : '0', opacity: expanded ? 1 : 0 }}
          >
            <div className="mt-3 pt-3 border-t border-white/[0.06]">
              <span className="text-[10px] uppercase tracking-widest text-violet-400/70">
                Suggestion
              </span>
              <p className="mt-1.5 text-sm text-white/50 leading-relaxed">{comment.suggestion}</p>
            </div>
          </div>
        )}

        {comment.suggestion && (
          <div className="mt-2 flex items-center gap-1">
            <span className="text-[10px] text-white/25 transition-all duration-300 group-hover:text-white/40">
              {expanded ? 'Hide suggestion ↑' : 'View suggestion ↓'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
