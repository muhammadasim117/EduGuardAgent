import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
}

export const EduGuardLogo: React.FC<LogoProps> = ({
  className = '',
  size = 'md',
  showSubtitle = true,
}) => {
  const iconDimensions = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-12 h-12',
  }[size];

  const titleStyles = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-2xl',
  }[size];

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* Original Geometric Security Shield + Scholar Nexus Crest */}
      <div className={`relative ${iconDimensions} shrink-0 group`}>
        {/* Glow halo */}
        <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-cyan-500/30 via-indigo-500/25 to-blue-600/30 blur-sm opacity-80 group-hover:opacity-100 transition-opacity" />

        <svg
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="relative w-full h-full drop-shadow-md"
        >
          <defs>
            <linearGradient id="shieldGrad" x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#38BDF8" />
              <stop offset="45%" stopColor="#6366F1" />
              <stop offset="100%" stopColor="#1E40AF" />
            </linearGradient>
            <linearGradient id="crestGrad" x1="16" y1="12" x2="32" y2="34" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#E0F2FE" />
              <stop offset="100%" stopColor="#38BDF8" />
            </linearGradient>
            <linearGradient id="coreGlow" x1="20" y1="20" x2="28" y2="28" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#38BDF8" />
              <stop offset="100%" stopColor="#818CF8" />
            </linearGradient>
          </defs>

          {/* Outer Cyber Shield Polygon */}
          <path
            d="M24 4L7 11V22.5C7 32.5 14.3 41.5 24 44C33.7 41.5 41 32.5 41 22.5V11L24 4Z"
            fill="#090F1E"
            stroke="url(#shieldGrad)"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />

          {/* Academic Scholar Cap / Crest Chevron */}
          <path
            d="M24 13L14 18L24 23L34 18L24 13Z"
            fill="url(#crestGrad)"
            fillOpacity="0.9"
          />

          {/* Lower Aegis Plate Lines */}
          <path
            d="M17 21V28C17 32.5 20 36 24 37.5C28 36 31 32.5 31 28V21"
            stroke="url(#shieldGrad)"
            strokeWidth="2"
            strokeLinecap="round"
          />

          {/* AI Neural Diamond Core */}
          <path
            d="M24 25L28 29L24 33L20 29L24 25Z"
            fill="url(#coreGlow)"
          />

          {/* Central AI Pulse Dot */}
          <circle cx="24" cy="29" r="1.5" fill="#FFFFFF" />
        </svg>
      </div>

      {/* Brand Wordmark and Team Attribution */}
      <div className="flex flex-col leading-tight">
        <div className="flex items-center gap-1.5">
          <span className={`${titleStyles} font-bold tracking-tight text-white font-sans whitespace-nowrap`}>
            EduGuard<span className="text-cyan-400 font-semibold ml-1">Agent</span>
          </span>
        </div>
        {showSubtitle && (
          <span className="text-[11px] font-medium tracking-wider text-slate-400 uppercase">
            by SentrX
          </span>
        )}
      </div>
    </div>
  );
};
