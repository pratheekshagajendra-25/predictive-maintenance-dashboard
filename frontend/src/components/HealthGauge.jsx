import React from 'react';
import { Shield, Info } from 'lucide-react';

export function HealthGauge({ score = null, status = "Excellent", condition = "HEALTHY", penalties = {}, size = 200 }) {
  const hasScore = score !== null && score !== undefined && !Number.isNaN(Number(score));
  const safeScore = hasScore ? Math.max(0, Math.min(100, Number(score))) : 0;
  
  // Calculate SVG arc parameters
  const strokeWidth = 14;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = Math.PI * radius; // Half circle gauge (180 deg)
  const strokeDashoffset = circumference - (safeScore / 100) * circumference;

  const getColor = () => {
    if (safeScore >= 90) return { stroke: '#10B981', text: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' };
    if (safeScore >= 75) return { stroke: '#34D399', text: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-500/30' };
    if (safeScore >= 50) return { stroke: '#F59E0B', text: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' };
    return { stroke: '#EF4444', text: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/30' };
  };

  const theme = getColor();

  return (
    <div className="flex flex-col items-center justify-center p-4">
      {/* SVG Radial Semi-Circle Gauge */}
      <div className="relative flex items-center justify-center" style={{ width: size, height: size * 0.65 }}>
        <svg
          width={size}
          height={size * 0.65}
          viewBox={`0 0 ${size} ${size * 0.65}`}
          className="overflow-visible"
        >
          <defs>
            <linearGradient id="healthGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#EF4444" />
              <stop offset="50%" stopColor="#F59E0B" />
              <stop offset="85%" stopColor="#10B981" />
              <stop offset="100%" stopColor="#06B6D4" />
            </linearGradient>
            <filter id="gaugeGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor={theme.stroke} floodOpacity="0.4" />
            </filter>
          </defs>

          {/* Background Track Arc */}
          <path
            d={`M ${strokeWidth},${size * 0.55} A ${radius},${radius} 0 0,1 ${size - strokeWidth},${size * 0.55}`}
            fill="none"
            stroke="#1E293B"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Value Arc */}
          <path
            d={`M ${strokeWidth},${size * 0.55} A ${radius},${radius} 0 0,1 ${size - strokeWidth},${size * 0.55}`}
            fill="none"
            stroke={theme.stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            filter="url(#gaugeGlow)"
            className="transition-all duration-1000 ease-out"
          />
        </svg>

        {/* Value Display in Gauge Center */}
        <div className="absolute top-[40%] flex flex-col items-center justify-center text-center">
          <div className="flex items-baseline gap-1">
            <span className={`text-4xl font-black font-mono tracking-tight ${theme.text}`}>
              {hasScore ? safeScore.toFixed(1) : '--'}
            </span>
            <span className="text-xs text-slate-500 font-mono">/ 100</span>
          </div>
          <div className={`mt-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider border ${theme.bg} ${theme.text}`}>
            {status}
          </div>
        </div>
      </div>

      {/* Health Range Scales */}
      <div className="w-full grid grid-cols-4 gap-1 text-[10px] text-center font-mono mt-3 px-2 text-slate-400">
        <div className="border-t-2 border-rose-500/80 pt-1">0-49 Poor</div>
        <div className="border-t-2 border-amber-500/80 pt-1">50-74 Warn</div>
        <div className="border-t-2 border-emerald-500/60 pt-1">75-89 Good</div>
        <div className="border-t-2 border-emerald-400 pt-1">90-100 Exc</div>
      </div>
    </div>
  );
}
