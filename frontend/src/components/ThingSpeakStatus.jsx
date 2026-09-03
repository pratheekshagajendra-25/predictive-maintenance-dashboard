import React from 'react';
import { Radio, WifiOff } from 'lucide-react';
import { useLiveData } from '../context/LiveDataContext';

export function ThingSpeakStatus({ compact = false }) {
  const { connection } = useLiveData();
  const isLive = connection?.status === 'LIVE' && connection?.connected === true;

  const lastReadingTime = connection?.lastReading
    ? connection.lastReading.replace('T', ' ').split('.')[0] + ' UTC'
    : 'None';

  const lastFetchTime = connection?.lastSuccessfulFetch
    ? connection.lastSuccessfulFetch.replace('T', ' ').split('.')[0] + ' UTC'
    : 'None';

  if (compact) {
    return (
      <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-bold border ${
        isLive
          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
          : 'bg-rose-50 border-rose-200 text-rose-700'
      }`}>
        <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
        <span>{isLive ? '🟢 LIVE — ThingSpeak Connected' : '🔴 OFFLINE — ThingSpeak Not Connected'}</span>
      </div>
    );
  }

  return (
    <div className={`industrial-card p-4 border ${
      isLive ? 'border-emerald-200 bg-emerald-50/40' : 'border-rose-200 bg-rose-50/40'
    }`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {isLive ? <Radio className="w-5 h-5 text-emerald-600 animate-pulse" /> : <WifiOff className="w-5 h-5 text-rose-600" />}
          <div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">ThingSpeak IoT Status</div>
            <div className="text-sm font-bold font-mono">
              {isLive ? (
                <span className="text-emerald-700">🟢 LIVE &bull; ThingSpeak Connected</span>
              ) : (
                <span className="text-rose-700">🔴 OFFLINE &bull; ThingSpeak Not Connected</span>
              )}
            </div>
          </div>
        </div>
        <span className={`w-2.5 h-2.5 rounded-full ${isLive ? 'bg-emerald-500 animate-ping' : 'bg-rose-500'}`} />
      </div>

      <div className="mt-3 pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono text-slate-600">
        <div>
          <span className="text-slate-400 font-sans">Last successful reading:</span>{' '}
          <strong className={isLive ? 'text-slate-800' : 'text-slate-500'}>{lastReadingTime}</strong>
        </div>
        <div>
          <span className="text-slate-400 font-sans">Last successful ThingSpeak fetch:</span>{' '}
          <strong className={isLive ? 'text-slate-800' : 'text-slate-500'}>{lastFetchTime}</strong>
        </div>
      </div>
    </div>
  );
}
