import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  Radio,
  Wifi,
  WifiOff,
  RefreshCw,
  Cpu,
  Layers,
  Thermometer
} from 'lucide-react';
import { useLiveData } from '../context/LiveDataContext';
import { api } from '../api/client';

export function MachineStatusBadge({ compact = false }) {
  const {
    latestReading,
    connection,
    machineStatus,
    manualRefresh,
    isRefreshing,
    refreshFeedback
  } = useLiveData();

  const [machineInfo, setMachineInfo] = useState({
    name: 'Machine 01',
    id: 'MACH-01',
    type: 'Industrial Machine',
    location: 'Bay 3 &bull; Production Line A'
  });

  useEffect(() => {
    api.getSystemHealth()
      .then(res => {
        if (res.success && res.machine) {
          setMachineInfo(prev => ({
            ...prev,
            name: res.machine.name || prev.name,
            id: res.machine.id || prev.id,
            location: res.machine.location || prev.location
          }));
        }
      })
      .catch(() => {});
  }, []);

  const isLive = connection?.status === 'LIVE' && connection?.connected === true;

  const getStatusConfig = () => {
    switch (machineStatus) {
      case 'CRITICAL':
        return {
          label: 'CRITICAL',
          color: 'bg-rose-50 text-rose-700 border-rose-200',
          dot:   'bg-rose-500',
          icon:  AlertOctagon,
          glow:  'shadow-sm shadow-rose-200',
        };
      case 'WARNING':
        return {
          label: 'WARNING',
          color: 'bg-amber-50 text-amber-700 border-amber-200',
          dot:   'bg-amber-500',
          icon:  AlertTriangle,
          glow:  'shadow-sm shadow-amber-200',
        };
      default:
        return {
          label: latestReading ? 'HEALTHY' : 'AWAITING DATA',
          color: latestReading
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-slate-100 text-slate-600 border-slate-200',
          dot: latestReading ? 'bg-emerald-500' : 'bg-slate-400',
          icon: ShieldCheck,
          glow: latestReading ? 'shadow-sm shadow-emerald-200' : '',
        };
    }
  };

  const statusConfig = getStatusConfig();
  const StatusIcon   = statusConfig.icon;

  // ── Compact variant (used in Navbar) ─────────────────────────────────────
  if (compact) {
    return (
      <div className="flex items-center gap-2.5">
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold uppercase tracking-wider ${statusConfig.color}`}>
          <span className={`w-2 h-2 rounded-full ${statusConfig.dot} animate-pulse`} />
          <span>{statusConfig.label}</span>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold border ${
          isLive
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-rose-50 border-rose-200 text-rose-700'
        }`}>
          <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
          <span>{isLive ? '🟢 LIVE — ThingSpeak Connected' : '🔴 OFFLINE — ThingSpeak Not Connected'}</span>
        </div>
      </div>
    );
  }

  // ── Full variant ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-2">
      {/* Refresh feedback toast */}
      {refreshFeedback && (
        <div className={`p-2.5 rounded-lg text-xs font-semibold flex items-center justify-between border shadow-sm ${
          refreshFeedback.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
          refreshFeedback.type === 'error'   ? 'bg-rose-50   border-rose-200   text-rose-800'    :
                                               'bg-slate-50  border-slate-200  text-slate-700'
        }`}>
          <span>{refreshFeedback.text}</span>
        </div>
      )}

      <div className="industrial-card p-4 sm:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        
        {/* Machine Metadata */}
        <div className="flex items-start sm:items-center gap-3 sm:gap-4">
          <div className="p-3 bg-cyan-50 text-cyan-700 rounded-xl border border-cyan-200 shrink-0">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-wide">
                {machineInfo.name}
              </h2>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono border border-slate-200 font-semibold">
                {machineInfo.id}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1 font-mono">
              <span dangerouslySetInnerHTML={{ __html: machineInfo.location }} />
              <span className="text-slate-300">&bull;</span>
              <span>{machineInfo.type}</span>
            </div>
          </div>
        </div>

        {/* Status Badges & Refresh Button */}
        <div className="flex items-center flex-wrap gap-3">

          {/* Machine condition badge */}
          <div className={`flex items-center gap-2 px-3.5 py-2 rounded-lg border text-xs font-bold tracking-wide uppercase ${statusConfig.color} ${statusConfig.glow}`}>
            <span className={`w-2.5 h-2.5 rounded-full ${statusConfig.dot} animate-ping`} />
            <StatusIcon className="w-4 h-4" />
            <span>STATUS: {statusConfig.label}</span>
          </div>

          {/* Genuine ThingSpeak connection state */}
          <div className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold border font-mono ${
            isLive  ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                      'bg-rose-50   border-rose-200   text-rose-800'
          }`}>
            <span className={`w-2.5 h-2.5 rounded-full ${
              isLive  ? 'bg-emerald-500 animate-pulse' :
                        'bg-rose-500'
            }`} />
            <span>
              {isLive ? '🟢 LIVE — ThingSpeak Connected' : '🔴 OFFLINE — ThingSpeak Not Connected'}
            </span>
          </div>

          {/* Manual Refresh */}
          <button
            disabled={isRefreshing}
            onClick={manualRefresh}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold transition shadow-xs"
            title="Force a ThingSpeak poll immediately"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-600 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh Now</span>
          </button>
        </div>

      </div>
    </div>
  );
}
