import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  CheckCircle,
  Clock,
  Search,
  Filter,
  Layers,
  FileText,
  Mail,
  ShieldCheck,
  Send,
  Zap,
  RefreshCw
} from 'lucide-react';
import { api } from '../api/client';
import { useLiveData } from '../context/LiveDataContext';
import { KpiCard } from '../components/KpiCard';

export function AlertManagement() {
  const { alertCounts, refreshTelemetry } = useLiveData();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [resolveModal, setResolveModal] = useState(null);
  const [resolveNotes, setResolveNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const params = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (severityFilter !== 'all') params.severity = severityFilter;
      const res = await api.getAlerts(params);
      if (res.success && res.alerts) {
        setAlerts(res.alerts);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [statusFilter, severityFilter]);

  const handleAcknowledge = async (alertId) => {
    try {
      setActionLoading(true);
      await api.acknowledgeAlert(alertId);
      await fetchAlerts();
      if (refreshTelemetry) await refreshTelemetry();
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolve = async (e) => {
    e.preventDefault();
    if (!resolveModal) return;
    try {
      setActionLoading(true);
      await api.resolveAlert(resolveModal.alert_id || resolveModal.alertId, resolveNotes);
      setResolveModal(null);
      setResolveNotes('');
      await fetchAlerts();
      if (refreshTelemetry) await refreshTelemetry();
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="industrial-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <AlertOctagon className="w-5 h-5 text-rose-400" />
              <span>Alert History &amp; Incident Lifecycle</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Audit log of 1-anomaly critical alerts, parameter violations, acknowledgements, resolutions, and SMTP email delivery.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchAlerts}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
              title="Refresh Alert Log"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
            <span className="text-xs px-3 py-1 bg-slate-800 text-slate-300 font-mono rounded-full border border-slate-700">
              {alertCounts.active} Active &bull; {alertCounts.resolved || 0} Resolved
            </span>
          </div>
        </div>
      </div>

      {/* KPI Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="Active Critical Alerts"
          value={alerts.filter(a => (a.status || '').toUpperCase() !== 'RESOLVED').length}
          unit="Incidents"
          subtitle="Trigger: 1 Anomaly"
          icon={AlertOctagon}
          color="rose"
          badge="1-ANOMALY"
        />
        <KpiCard
          title="Dispatched Alert Emails"
          value={alerts.filter(a => a.email_sent === 1 || a.email_status === 'SENT').length}
          unit="Emails"
          subtitle="STARTTLS SMTP Port 587"
          icon={Mail}
          color="cyan"
          badge="DELIVERED"
        />
        <KpiCard
          title="Resolved Incidents"
          value={alerts.filter(a => (a.status || '').toUpperCase() === 'RESOLVED').length}
          unit="Resolved"
          subtitle="Closed by Maintenance"
          icon={ShieldCheck}
          color="emerald"
          badge="RESOLVED"
        />
      </div>

      {/* Table Card */}
      <div className="industrial-card p-5 space-y-4">
        
        {/* Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg p-1 text-xs">
              <span className="text-[10px] text-slate-500 px-1 font-mono">STATUS:</span>
              {['all', 'CRITICAL', 'ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-0.5 rounded font-mono font-bold text-[11px] uppercase ${
                    statusFilter === st ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg p-1 text-xs">
              <span className="text-[10px] text-slate-500 px-1 font-mono">SEVERITY:</span>
              {['all', 'CRITICAL', 'WARNING'].map((sev) => (
                <button
                  key={sev}
                  onClick={() => setSeverityFilter(sev)}
                  className={`px-2.5 py-0.5 rounded font-mono font-bold text-[11px] uppercase ${
                    severityFilter === sev ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>
          </div>

          <span className="text-xs font-mono text-slate-400">
            Showing {alerts.length} alert records
          </span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900/80 text-slate-400 uppercase text-[11px] border-b border-slate-800">
              <tr>
                <th className="py-3 px-3">Alert ID</th>
                <th className="py-3 px-3">Machine ID</th>
                <th className="py-3 px-3">Timestamp</th>
                <th className="py-3 px-3">Parameter</th>
                <th className="py-3 px-3 text-rose-400">Value</th>
                <th className="py-3 px-3">Severity</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Email Status</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500 font-mono">
                    Loading alerts history...
                  </td>
                </tr>
              ) : alerts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500 font-mono">
                    No alert incidents found matching filter.
                  </td>
                </tr>
              ) : (
                alerts.map((alt) => {
                  const alertId = alt.alert_id || alt.alertId;
                  const machineId = alt.machine_id || alt.machineId || 'Machine-01';
                  const param = alt.parameter || 'Temperature';
                  const val = alt.value ?? alt.machine_temperature ?? alt.machineTemperature ?? 0;
                  const sev = alt.severity || 'CRITICAL';
                  const status = (alt.status || 'CRITICAL').toUpperCase();
                  const emailStatus = alt.email_status || (alt.email_sent ? 'SENT' : 'PENDING');

                  return (
                    <tr key={alertId} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-3 font-bold text-cyan-400">{alertId}</td>
                      <td className="py-3 px-3 font-semibold text-white">{machineId}</td>
                      <td className="py-3 px-3 text-slate-400">{alt.timestamp || alt.created_at}</td>
                      <td className="py-3 px-3 text-amber-300 font-semibold">{param}</td>
                      <td className="py-3 px-3 font-bold text-rose-400">
                        {typeof val === 'number' ? val.toFixed(2) : val}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                          sev === 'CRITICAL' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' :
                          'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                        }`}>
                          {sev}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          status === 'CRITICAL' || status === 'ACTIVE' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
                          status === 'ACKNOWLEDGED' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                          'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        }`}>
                          {status}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                          emailStatus === 'SENT' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
                          emailStatus === 'FAILED' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
                          'bg-slate-800 text-slate-300'
                        }`}>
                          {emailStatus}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right space-x-1.5 whitespace-nowrap">
                        {status !== 'RESOLVED' && (
                          <>
                            {status !== 'ACKNOWLEDGED' && (
                              <button
                                disabled={actionLoading}
                                onClick={() => handleAcknowledge(alertId)}
                                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/30 rounded text-[10px] font-bold transition"
                              >
                                Acknowledge
                              </button>
                            )}
                            <button
                              disabled={actionLoading}
                              onClick={() => setResolveModal(alt)}
                              className="px-2 py-1 bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 rounded text-[10px] font-bold transition"
                            >
                              Resolve
                            </button>
                          </>
                        )}
                        {status === 'RESOLVED' && (
                          <span className="text-[11px] text-emerald-400 flex items-center justify-end gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Resolved</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* Resolution Modal */}
      {resolveModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="industrial-card p-6 max-w-md w-full space-y-4 border-emerald-500/40">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span>Resolve Incident #{resolveModal.alert_id || resolveModal.alertId}</span>
            </h3>
            <p className="text-xs text-slate-400">
              Provide resolution notes to verify machine operating status and mark the alert as resolved.
            </p>

            <form onSubmit={handleResolve} className="space-y-3">
              <textarea
                value={resolveNotes}
                onChange={(e) => setResolveNotes(e.target.value)}
                placeholder="e.g. Spindle cooling fluid replaced, normal vibration verified under full CNC load."
                rows={3}
                className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-xs font-mono focus:border-emerald-500 focus:outline-none"
                required
              />

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResolveModal(null)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded-lg text-xs transition"
                >
                  {actionLoading ? 'Resolving...' : 'Confirm Resolution'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
