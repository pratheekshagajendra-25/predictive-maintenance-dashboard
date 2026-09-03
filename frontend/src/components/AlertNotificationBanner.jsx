import React, { useState } from 'react';
import { AlertOctagon, CheckCircle2, X } from 'lucide-react';
import { useLiveData } from '../context/LiveDataContext';

export function AlertNotificationBanner() {
  const { alerts, acknowledgeAlert } = useLiveData();
  const [acknowledging, setAcknowledging] = useState(false);
  const [dismissedIds, setDismissedIds] = useState([]);

  // Find latest active unacknowledged alert
  const activeAlert = alerts?.find(a => {
    const status = (a.status || '').toUpperCase();
    const id = a.alert_id || a.alertId;
    return (status === 'ACTIVE' || status === 'CRITICAL') && !dismissedIds.includes(id);
  });

  if (!activeAlert) return null;

  const alertId = activeAlert.alert_id || activeAlert.alertId;
  const severity = activeAlert.severity || 'CRITICAL';
  const timestamp = activeAlert.timestamp || activeAlert.created_at || '';
  const reason = activeAlert.trigger_reason || activeAlert.triggerReason || '1 Anomaly threshold violation detected.';
  const temp = activeAlert.machine_temperature ?? activeAlert.machineTemperature ?? activeAlert.value ?? 0;
  const health = activeAlert.health_score ?? activeAlert.healthScore ?? 40.0;

  const handleAcknowledge = async () => {
    try {
      setAcknowledging(true);
      if (acknowledgeAlert) await acknowledgeAlert(alertId);
    } catch (e) {
      console.error(e);
    } finally {
      setAcknowledging(false);
    }
  };

  const isCritical = severity === 'CRITICAL';

  return (
    <div className={`w-full px-4 py-3 border-b text-white shadow-xl transition-all duration-300 relative z-40 ${
      isCritical
        ? 'bg-gradient-to-r from-rose-900/90 via-rose-950/95 to-slate-900 border-rose-600/80 shadow-[0_4px_25px_rgba(225,29,72,0.3)]'
        : 'bg-gradient-to-r from-amber-900/90 via-amber-950/95 to-slate-900 border-amber-600/80 shadow-[0_4px_25px_rgba(245,158,11,0.25)]'
    }`}>
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center animate-bounce ${
            isCritical ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
          }`}>
            <AlertOctagon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-black uppercase px-2 py-0.5 rounded tracking-wider ${
                isCritical ? 'bg-rose-500 text-slate-950' : 'bg-amber-500 text-slate-950'
              }`}>
                {severity} ALERT
              </span>
              <span className="text-xs font-mono text-slate-300">ID: {alertId}</span>
              <span className="text-xs font-mono text-slate-400">&bull; {timestamp}</span>
            </div>
            <p className="text-xs sm:text-sm font-medium text-slate-100 mt-0.5">
              <strong>{reason}</strong> &bull; Telemetry: <span className="font-mono font-bold text-rose-300">{Number(temp).toFixed(2)} °C</span> &bull; Health Score: <span className="font-mono font-bold">{Number(health).toFixed(1)}/100</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleAcknowledge}
            disabled={acknowledging}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg text-xs font-bold transition shadow"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{acknowledging ? 'Acknowledging...' : 'Acknowledge Alert'}</span>
          </button>
          <button
            onClick={() => setDismissedIds(prev => [...prev, alertId])}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg"
            title="Dismiss banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
