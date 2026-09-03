import React from 'react';

export function KpiCard({
  title,
  value,
  unit = '',
  subtitle,
  icon: Icon,
  trend,
  color = 'cyan', // 'cyan', 'emerald', 'amber', 'rose', 'indigo', 'slate'
  badge,
  className = ''
}) {
  const getColorStyles = () => {
    switch (color) {
      case 'emerald':
        return {
          border: 'border-slate-200 hover:border-emerald-300',
          iconBg: 'bg-emerald-50 text-emerald-600 border-emerald-200',
          valText: 'text-emerald-700',
          glow: 'hover:shadow-md'
        };
      case 'amber':
        return {
          border: 'border-slate-200 hover:border-amber-300',
          iconBg: 'bg-amber-50 text-amber-600 border-amber-200',
          valText: 'text-amber-700',
          glow: 'hover:shadow-md'
        };
      case 'rose':
        return {
          border: 'border-slate-200 hover:border-rose-300',
          iconBg: 'bg-rose-50 text-rose-600 border-rose-200',
          valText: 'text-rose-700',
          glow: 'hover:shadow-md'
        };
      case 'indigo':
        return {
          border: 'border-slate-200 hover:border-indigo-300',
          iconBg: 'bg-indigo-50 text-indigo-600 border-indigo-200',
          valText: 'text-indigo-700',
          glow: 'hover:shadow-md'
        };
      case 'slate':
        return {
          border: 'border-slate-200 hover:border-slate-300',
          iconBg: 'bg-slate-100 text-slate-600 border-slate-200',
          valText: 'text-slate-700',
          glow: 'hover:shadow-md'
        };
      default:
        return {
          border: 'border-slate-200 hover:border-cyan-300',
          iconBg: 'bg-cyan-50 text-cyan-600 border-cyan-200',
          valText: 'text-cyan-700',
          glow: 'hover:shadow-md'
        };
    }
  };

  const style = getColorStyles();

  return (
    <div className={`industrial-card p-5 group transition-all duration-300 relative overflow-hidden ${style.border} ${style.glow} ${className}`}>
      <div className="flex items-start justify-between">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</span>
        {Icon && (
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${style.iconBg}`}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span className={`text-2xl sm:text-3xl font-bold font-mono tracking-tight ${style.valText}`}>
          {value !== undefined && value !== null ? value : '--'}
        </span>
        {unit && <span className="text-sm font-semibold text-slate-500 font-sans">{unit}</span>}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        {subtitle && <p className="text-xs text-slate-500 font-mono truncate">{subtitle}</p>}
        {badge && (
          <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}
