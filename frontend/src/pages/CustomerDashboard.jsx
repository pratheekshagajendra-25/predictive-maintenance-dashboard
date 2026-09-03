import React, { useState } from 'react';
import {
  Thermometer,
  CloudSun,
  HeartPulse,
  AlertTriangle,
  Bell,
  Clock,
  CheckCircle2,
  AlertOctagon,
  ShieldCheck,
  Info,
  Layers,
  ArrowUpRight
} from 'lucide-react';
import { useLiveData } from '../context/LiveDataContext';
import { MachineStatusBadge } from '../components/MachineStatusBadge';
import { KpiCard } from '../components/KpiCard';
import { LiveTempChart } from '../components/LiveTempChart';
import { HealthGauge } from '../components/HealthGauge';
import { ThingSpeakStatus } from '../components/ThingSpeakStatus';

export function CustomerDashboard({ onNavigate }) {
  const { latestReading, thresholds, alerts, alertCounts, acknowledgeAlert, connection } = useLiveData();
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [ackLoading, setAckLoading] = useState(false);

  const machineTemp = latestReading?.machineTemperature;
  const ambientTemp = latestReading?.ambientTemperature;
  const healthScore = latestReading?.healthScore;
  const healthStatus = latestReading?.healthStatus || (latestReading ? 'Excellent' : 'Awaiting data');
  const healthCondition = latestReading?.healthCondition || (latestReading ? 'HEALTHY' : 'UNKNOWN');
  const lastReadingTime = latestReading?.thingspeakTimestamp || latestReading?.timestamp || '--';
  const lastFetchTime = connection?.lastSuccessfulFetch
    ? connection.lastSuccessfulFetch.replace('T', ' ').split('.')[0]
    : 'Never';

  const warnThresh = thresholds?.machine_temp_warning || 52.29;
  const critThresh = thresholds?.machine_temp_critical || 55.27;
  const normLow = thresholds?.normal_range_low || 34.61;
  const normHigh = thresholds?.normal_range_high || 49.05;

  const handleAcknowledge = async (alertId) => {
    try {
      setAckLoading(true);
      await acknowledgeAlert(alertId);
    } catch (e) {
      console.error(e);
    } finally {
      setAckLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* 1. TOP HEADER */}
      <MachineStatusBadge />
      <ThingSpeakStatus />

      {/* 2. KPI CARDS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* KPI 1: Machine Temperature */}
        <KpiCard
          title="Machine Temperature"
          value={machineTemp !== undefined ? machineTemp.toFixed(2) : '--'}
          unit="°C"
          subtitle={`Normal: ${normLow} - ${normHigh}°C`}
          icon={Thermometer}
          color={machineTemp >= critThresh ? 'rose' : machineTemp >= warnThresh ? 'amber' : 'cyan'}
          badge={machineTemp >= critThresh ? 'CRITICAL' : machineTemp >= warnThresh ? 'WARNING' : 'NORMAL'}
        />

        {/* KPI 2: Ambient Temperature */}
        <KpiCard
          title="Ambient Temperature"
          value={ambientTemp !== undefined ? ambientTemp.toFixed(2) : '--'}
          unit="°C"
          subtitle="Ambient Reference"
          icon={CloudSun}
          color="indigo"
          badge="ENV"
        />

        {/* KPI 3: Machine Health Score */}
        <KpiCard
          title="Machine Health"
          value={healthScore != null ? healthScore.toFixed(1) : '--'}
          unit="/ 100"
          subtitle={healthStatus}
          icon={HeartPulse}
          color={healthScore == null ? 'cyan' : healthScore < 50 ? 'rose' : healthScore < 75 ? 'amber' : 'emerald'}
          badge={healthCondition}
        />

        {/* KPI 4: 1-Anomaly Immediate Alert Rule */}
        <KpiCard
          title="Alert Sentinel"
          value={latestReading?.anomaly_flag === 1 ? 'ANOMALY' : 'NORMAL'}
          unit=""
          subtitle="1 Anomaly = Instant Alert"
          icon={AlertTriangle}
          color={latestReading?.anomaly_flag === 1 ? 'rose' : 'emerald'}
          badge={latestReading?.anomaly_flag === 1 ? 'TRIGGERED' : 'MONITORING'}
        />

        {/* KPI 5: Active Alerts */}
        <KpiCard
          title="Active Alerts"
          value={alertCounts.active}
          unit="Alerts"
          subtitle="Requires attention"
          icon={Bell}
          color={alertCounts.active > 0 ? 'rose' : 'emerald'}
          badge={alertCounts.active > 0 ? 'ATTENTION' : 'HEALTHY'}
        />

        {/* KPI 6: Last Reading */}
        <KpiCard
          title="Last Reading"
          value={String(lastReadingTime).includes('T') ? String(lastReadingTime).split('T')[1].replace('Z', '') : (String(lastReadingTime).split(' ')[1] || lastReadingTime)}
          subtitle={`Fetch: ${lastFetchTime}`}
          icon={Clock}
          color="cyan"
          badge={connection?.status || 'OFFLINE'}
        />
      </div>

      {/* 3. MAIN SECTION: TEMPERATURE CHART & HEALTH GAUGE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Interactive Temperature Chart */}
        <div className="lg:col-span-2 space-y-4">
          <LiveTempChart height={380} showControls={true} />
        </div>

        {/* Right 1 Col: Machine Health Gauge & Breakdown */}
        <div className="industrial-card p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Health Condition</h3>
                <p className="text-xs text-slate-500">Dynamic 0–100 Assessment</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded font-bold uppercase ${
                healthScore >= 90 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                healthScore >= 75 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                healthScore >= 50 ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                'bg-rose-50 text-rose-700 border border-rose-200'
              }`}>
                {healthStatus}
              </span>
            </div>

            {/* SVG Health Gauge */}
            <div className="py-2">
              <HealthGauge score={healthScore} status={healthStatus} condition={healthCondition} size={220} />
            </div>

            {/* Health Score Diagnostic Factors */}
            <div className="space-y-2 mt-1">
              <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                <span>Assessment Factors</span>
                <span className="text-[10px] text-slate-500 font-mono">Weighted Penalties</span>
              </div>

              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 text-xs space-y-1.5 font-mono">
                <div className="flex justify-between items-center text-slate-600">
                  <span>Temperature Deviation:</span>
                  <span className={machineTemp > normHigh ? 'text-amber-700 font-bold' : 'text-emerald-700 font-bold'}>
                    {machineTemp > normHigh ? `+${(machineTemp - normHigh).toFixed(2)}°C` : 'Inside Range'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>Critical Proximity:</span>
                  <span className={machineTemp >= warnThresh ? 'text-rose-700 font-bold' : 'text-emerald-700 font-bold'}>
                    {(critThresh - (machineTemp || 0)).toFixed(2)}°C buffer
                  </span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>Anomaly Alert Rule:</span>
                  <span className="text-cyan-700 font-bold">
                    1 Anomaly = Immediate Alert
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-200 text-[11px] text-slate-500 flex items-center gap-1.5">
            <Info className="w-4 h-4 text-cyan-600 shrink-0" />
            <span>Score dynamically updates as new telemetry readings arrive.</span>
          </div>
        </div>
      </div>

      {/* 4. CUSTOMER ACTIVE ALERTS PANEL */}
      <div className="industrial-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>Active Machine Alerts</span>
            </h3>
            <p className="text-xs text-slate-500">Immediate critical alert dispatched for every single anomalous reading</p>
          </div>
          <span className="text-xs px-2.5 py-1 rounded bg-slate-100 text-slate-700 font-mono border border-slate-200 font-semibold">
            {alerts.length} Total Alerts in View
          </span>
        </div>

        {alerts.length === 0 ? (
          <div className="py-10 text-center text-slate-400">
            <ShieldCheck className="w-12 h-12 text-emerald-500 mx-auto mb-2 opacity-80" />
            <p className="text-sm font-semibold text-slate-800 font-sans">No Active Machine Alerts</p>
            <p className="text-xs text-slate-500 mt-0.5 font-sans">Machine is operating within expected statistical limits.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[11px] border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3">Alert ID</th>
                  <th className="py-3 px-3">Time</th>
                  <th className="py-3 px-3">Severity</th>
                  <th className="py-3 px-3">Machine Temp</th>
                  <th className="py-3 px-3">Threshold</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {alerts.map((alt) => (
                  <tr key={alt.alertId} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-3 font-bold text-cyan-700">{alt.alertId}</td>
                    <td className="py-3 px-3 text-slate-600">{alt.timestamp}</td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-50 text-rose-700 border border-rose-200">
                        {alt.severity}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-bold text-rose-700">{alt.machineTemperature?.toFixed(2)} °C</td>
                    <td className="py-3 px-3 text-slate-600">{alt.thresholdValue?.toFixed(2)} °C</td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        alt.status === 'ACTIVE' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                        alt.status === 'ACKNOWLEDGED' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}>
                        {alt.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      {alt.status === 'ACTIVE' ? (
                        <button
                          disabled={ackLoading}
                          onClick={() => handleAcknowledge(alt.alertId)}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold transition text-xs shadow-xs"
                        >
                          Acknowledge
                        </button>
                      ) : (
                        <button
                          onClick={() => setSelectedAlert(alt)}
                          className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded font-semibold transition text-xs shadow-xs"
                        >
                          View Details
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between font-sans">
          <span>Note: System thresholds are managed by Lead Maintenance Engineers (Admins).</span>
          {onNavigate && (
            <button
              onClick={() => onNavigate('alerts')}
              className="text-cyan-700 hover:underline flex items-center gap-1 font-semibold"
            >
              <span>View Full History</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Alert Details Modal */}
      {selectedAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="industrial-card max-w-lg w-full p-6 space-y-4 border-slate-200 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <AlertOctagon className="w-5 h-5 text-rose-600" />
                <h4 className="text-sm font-bold text-slate-900 font-mono">Alert Details: {selectedAlert.alertId}</h4>
              </div>
              <button
                onClick={() => setSelectedAlert(null)}
                className="text-slate-400 hover:text-slate-700 text-base"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2.5 text-xs font-sans">
              <div className="p-3 rounded bg-slate-50 border border-slate-200">
                <span className="text-slate-500 font-semibold">Trigger Reason:</span>
                <p className="text-slate-800 font-bold mt-1">{selectedAlert.triggerReason}</p>
              </div>

              <div className="p-3 rounded bg-amber-50/50 border border-amber-200">
                <span className="text-amber-800 font-semibold">Recommended Action:</span>
                <p className="text-amber-900 font-medium mt-1">{selectedAlert.recommendedAction}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 font-mono text-slate-700 pt-1">
                <div>Timestamp: <span className="text-slate-900 font-bold">{selectedAlert.timestamp}</span></div>
                <div>Severity: <span className="text-rose-700 font-bold">{selectedAlert.severity}</span></div>
                <div>Machine Temp: <span className="text-slate-900 font-bold">{selectedAlert.machineTemperature?.toFixed(2)} °C</span></div>
                <div>Ambient Temp: <span className="text-slate-900 font-bold">{selectedAlert.ambientTemperature?.toFixed(2)} °C</span></div>
                <div>Health Score: <span className="text-slate-900 font-bold">{selectedAlert.healthScore?.toFixed(1)}/100</span></div>
                <div>Anomaly Trigger: <span className="text-cyan-700 font-bold">1-Anomaly Rule</span></div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedAlert(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
