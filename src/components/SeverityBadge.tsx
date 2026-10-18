import React from 'react';
import {SeverityLevel} from '../types';

interface SeverityBadgeProps {
  level: SeverityLevel | string;
  size?: 'sm' | 'md';
  showDot?: boolean;
}

export const SeverityBadge: React.FC<SeverityBadgeProps> = ({
  level,
  size = 'md',
  showDot = true,
}) => {
  const norm = (level || '').toLowerCase();

  let styles = 'bg-slate-800 text-slate-300 border-slate-700';
  let dotColor = 'bg-slate-400';
  let displayLabel = level;

  if (norm === 'critical') {
    styles = 'bg-rose-950/40 text-rose-300 border-rose-500/40';
    dotColor = 'bg-rose-400';
    displayLabel = 'Critical';
  } else if (norm === 'high') {
    styles = 'bg-amber-950/40 text-amber-300 border-amber-500/40';
    dotColor = 'bg-amber-400';
    displayLabel = 'High';
  } else if (norm === 'medium') {
    styles = 'bg-yellow-950/40 text-yellow-300 border-yellow-500/40';
    dotColor = 'bg-yellow-400';
    displayLabel = 'Medium';
  } else if (norm === 'low') {
    styles = 'bg-sky-950/40 text-sky-300 border-sky-500/40';
    dotColor = 'bg-sky-400';
    displayLabel = 'Low';
  }

  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded border tabular-nums whitespace-nowrap select-none ${styles} ${padding}`}
    >
      {showDot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} aria-hidden="true" />}
      <span>{displayLabel}</span>
    </span>
  );
};
