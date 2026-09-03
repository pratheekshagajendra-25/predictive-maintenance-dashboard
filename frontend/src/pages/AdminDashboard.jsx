import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Layers,
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  Radio,
  HeartPulse,
  Server,
  Zap,
  RotateCw,
  Sliders,
  Cpu,
  ArrowRight,
  TrendingUp,
  Thermometer,
  Gauge,
  Upload,
  FileSpreadsheet,
  Trash2,
  Mail,
  CheckCircle2,
  Clock,
  FileCheck,
  AlertCircle
} from 'lucide-react';
import { useLiveData } from '../context/LiveDataContext';
import { api } from '../api/client';
import { MachineStatusBadge } from '../components/MachineStatusBadge';
import { KpiCard } from '../components/KpiCard';
import { LiveTempChart } from '../components/LiveTempChart';

export function AdminDashboard({ onNavigate }) {
  const { latestReading, connection, alertCounts, thresholds, refreshTelemetry } = useLiveData();
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [pollLoading, setPollLoading] = useState(false);
  const [injectLoading, setInjectLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState(null);
  const [activeDatasetSummary, setActiveDatasetSummary] = useState(null);
  const [recentAlerts, setRecentAlerts] = useState([]);
  const [recentReadings, setRecentReadings] = useState([]);

  // Fetch all live metrics, alerts, and telemetry for the main dashboard
  const fetchDashboardData = useCallback(async () => {
    try {
      setLoadingStats(true);
      const [statsRes, alertsRes, readingsRes] = await Promise.all([
        api.getStatistics().catch(() => ({ success: false })),
        api.getAlerts({ limit: 10 }).catch(() => ({ alerts: [] })),
        api.getReadings({ limit: 25 }).catch(() => ({ readings: [] }))
      ]);

      if (statsRes.success && statsRes.statistics) {
        setStats(statsRes.statistics);
        if (statsRes.statistics.latest_dataset) {
          setActiveDatasetSummary(statsRes.statistics.latest_dataset);
        } else {
          setActiveDatasetSummary(null);
        }
      }

      if (alertsRes.alerts) {
        setRecentAlerts(alertsRes.alerts);
      }

      if (readingsRes.readings) {
        setRecentReadings(readingsRes.readings);
      }
    } catch (e) {
      console.error('Dashboard data load error:', e);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 10000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  // Handle direct dataset file upload from the main dashboard
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setFeedbackMsg(null);
      const formData = new FormData();
      formData.append('file', file);

      const res = await api.uploadDataset(formData);
      if (res.success) {
        setFeedbackMsg({
          type: 'success',
          text: `Successfully processed ${res.summary?.totalRows || 0} rows from "${file.name}". Detected ${res.summary?.anomalyCount || 0} anomalies and triggered instant email alerts.`
        });
        await fetchDashboardData();
        await refreshTelemetry();
      } else {
        setFeedbackMsg({
          type: 'error',
          text: res.error || 'Failed to process dataset upload.'
        });
      }
    } catch (err) {
      setFeedbackMsg({
        type: 'error',
        text: err.response?.data?.error || err.message || 'Error uploading dataset.'
      });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  // Reset uploaded dataset
  const handleResetDataset = async () => {
    if (!window.confirm('Are you sure you want to clear all uploaded dataset records and reset the dashboard?')) {
      return;
    }

    try {
      setResetting(true);
      const res = await api.resetDataset();
      if (res.success) {
        setFeedbackMsg({
          type: 'success',
          text: 'Dataset records cleared successfully. Dashboard reset to baseline.'
        });
        setActiveDatasetSummary(null);
        await fetchDashboardData();
        await refreshTelemetry();
      }
    } catch (err) {
      setFeedbackMsg({
        type: 'error',
        text: 'Failed to reset dataset.'
      });
    } finally {
      setResetting(false);
    }
  };

  // Manual Poll ThingSpeak
  const handleManualPoll = async () => {
    try {
      setPollLoading(true);
      const res = await api.pollNow();
      if (res.success) {
        setFeedbackMsg({
          type: 'success',
          text: res.result?.message || 'ThingSpeak feeds polled successfully.'
        });
        await fetchDashboardData();
        await refreshTelemetry();
      }
    } catch (err) {
      setFeedbackMsg({
        type: 'error',
        text: err.response?.data?.error || 'ThingSpeak poll failed.'
      });
    } finally {
      setPollLoading(false);
    }
  };

  // Inject 1-Anomaly Immediate Test Alert
  const handleInjectTestAnomaly = async () => {
    try {
      setInjectLoading(true);
      const res = await api.testAlert({
        temperature: 96.5,
        ambient_temperature: 31.0,
        vibration: 12.8,
        rpm: 3800,
        pressure: 9.2
      });

      if (res.success) {
        setFeedbackMsg({
          type: 'success',
          text: `🚨 1-Anomaly Test Triggered! Anomaly detected (${res.anomaly?.condition}), Critical Alert #${res.alert?.id} generated, and instant email dispatched to ${res.email?.recipient || 'operator'}.`
        });
        await fetchDashboardData();
        await refreshTelemetry();
      } else {
        setFeedbackMsg({
          type: 'error',
          text: res.error || 'Test anomaly trigger failed.'
        });
      }
    } catch (err) {
      setFeedbackMsg({
        type: 'error',
        text: err.response?.data?.error || err.message || 'Error triggering test anomaly.'
      });
    } finally {
      setInjectLoading(false);
    }
  };

  const totalReadings = stats?.total_samples ?? 0;
  const normalReadings = stats?.normal_count ?? 0;
  const anomalyCount = stats?.anomaly_count ?? 0;
  const anomalyRate = stats?.anomaly_rate ?? 0;
  const criticalAlerts = stats?.critical_alerts ?? 0;
  const emailsSent = stats?.emails_sent ?? 0;
  const emailsFailed = stats?.emails_failed ?? 0;
  const healthScore = stats?.health_score ?? (totalReadings > 0 ? (latestReading?.healthScore ?? 100) : null);

  return (
    <div className="space-y-6">
      
      {/* 1. TOP HEADER WITH MACHINE METADATA & STATUS */}
      <MachineStatusBadge />

      {/* FEEDBACK NOTIFICATION BANNER */}
      {feedbackMsg && (
        <div className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between border shadow-sm ${
          feedbackMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
          feedbackMsg.type === 'error'   ? 'bg-rose-50   border-rose-200   text-rose-800'    :
                                           'bg-slate-50  border-slate-200  text-slate-700'
        }`}>
          <div className="flex items-center gap-2">
            {feedbackMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertOctagon className="w-4 h-4 text-rose-600" />}
            <span>{feedbackMsg.text}</span>
          </div>
          <button onClick={() => setFeedbackMsg(null)} className="text-slate-400 hover:text-slate-700 ml-3">
            &times;
          </button>
        </div>
      )}

      {/* 2. DATASET UPLOAD & QUICK ACTION PANEL (DIRECTLY IN DASHBOARD) */}
      <div className="industrial-card p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 border-l-4 border-l-cyan-600">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-cyan-50 text-cyan-700 rounded-xl border border-cyan-200">
            <Upload className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Telemetry Dataset Ingestion &amp; Live Actions
            </h3>
            <p className="text-xs text-slate-500">
              Upload CSV / Excel dataset to immediately update dashboard metrics, charts, and trigger anomaly emails.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Upload File Input Button */}
          <label className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer shadow-sm ${
            uploading
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white'
          }`}>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
            />
            <FileSpreadsheet className={`w-4 h-4 ${uploading ? 'animate-spin' : ''}`} />
            <span>{uploading ? 'Processing Dataset...' : 'Upload CSV / XLSX'}</span>
          </label>

          {/* Reset Dataset Button */}
          {activeDatasetSummary && (
            <button
              disabled={resetting}
              onClick={handleResetDataset}
              className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-300 hover:border-rose-300 rounded-lg text-xs font-bold transition disabled:opacity-50 shadow-xs"
              title="Clear all uploaded dataset records"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>{resetting ? 'Clearing...' : 'Clear Dataset'}</span>
            </button>
          )}

          {/* Poll Live IoT */}
          <button
            disabled={pollLoading}
            onClick={handleManualPoll}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold transition disabled:opacity-50 shadow-xs"
            title="Poll ThingSpeak IoT Channel"
          >
            <RotateCw className={`w-3.5 h-3.5 text-cyan-600 ${pollLoading ? 'animate-spin' : ''}`} />
            <span>Poll IoT</span>
          </button>

          {/* Inject Test Anomaly */}
          <button
            disabled={injectLoading}
            onClick={handleInjectTestAnomaly}
            className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-800 rounded-lg text-xs font-bold transition disabled:opacity-50 shadow-xs"
            title="Inject 1-anomaly test event"
          >
            <Zap className={`w-3.5 h-3.5 text-rose-600 ${injectLoading ? 'animate-spin' : ''}`} />
            <span>Test 1-Anomaly Alert</span>
          </button>
        </div>
      </div>

      {/* 3. DATASET UPLOAD SUMMARY BANNER (INSIDE DASHBOARD) */}
      {activeDatasetSummary && (
        <div className="industrial-card p-5 border border-cyan-200 bg-gradient-to-r from-cyan-50/60 via-white to-slate-50 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-cyan-700" />
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Dataset Upload Summary &bull; <span className="font-mono text-cyan-700">{activeDatasetSummary.filename}</span>
              </h3>
            </div>
            <span className="text-xs font-mono text-slate-500">
              Uploaded: {activeDatasetSummary.uploaded_at?.replace('T', ' ').slice(0, 19)} UTC
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 text-center font-mono text-xs">
            <div className="p-2.5 bg-white rounded-lg border border-slate-200 shadow-2xs">
              <div className="text-[10px] text-slate-500 uppercase font-sans">Total Rows</div>
              <div className="text-base font-bold text-slate-900">{activeDatasetSummary.row_count?.toLocaleString()}</div>
            </div>
            <div className="p-2.5 bg-white rounded-lg border border-slate-200 shadow-2xs">
              <div className="text-[10px] text-slate-500 uppercase font-sans">Valid Rows</div>
              <div className="text-base font-bold text-emerald-700">{activeDatasetSummary.row_count?.toLocaleString()}</div>
            </div>
            <div className="p-2.5 bg-white rounded-lg border border-slate-200 shadow-2xs">
              <div className="text-[10px] text-slate-500 uppercase font-sans">Normal Rows</div>
              <div className="text-base font-bold text-emerald-700">{activeDatasetSummary.normal_count?.toLocaleString()}</div>
            </div>
            <div className="p-2.5 bg-white rounded-lg border border-slate-200 shadow-2xs">
              <div className="text-[10px] text-slate-500 uppercase font-sans">Anomaly Rows</div>
              <div className="text-base font-bold text-rose-700">{activeDatasetSummary.anomaly_count?.toLocaleString()}</div>
            </div>
            <div className="p-2.5 bg-white rounded-lg border border-slate-200 shadow-2xs">
              <div className="text-[10px] text-slate-500 uppercase font-sans">Anomaly Rate</div>
              <div className="text-base font-bold text-amber-700">{activeDatasetSummary.anomaly_rate}%</div>
            </div>
            <div className="p-2.5 bg-white rounded-lg border border-slate-200 shadow-2xs">
              <div className="text-[10px] text-slate-500 uppercase font-sans">Critical Alerts</div>
              <div className="text-base font-bold text-rose-700">{activeDatasetSummary.anomaly_count?.toLocaleString()}</div>
            </div>
            <div className="p-2.5 bg-white rounded-lg border border-slate-200 shadow-2xs">
              <div className="text-[10px] text-slate-500 uppercase font-sans">Emails Sent</div>
              <div className="text-base font-bold text-emerald-700">{emailsSent?.toLocaleString()}</div>
            </div>
            <div className="p-2.5 bg-white rounded-lg border border-slate-200 shadow-2xs">
              <div className="text-[10px] text-slate-500 uppercase font-sans">Emails Failed</div>
              <div className={`text-base font-bold ${emailsFailed > 0 ? 'text-rose-700' : 'text-slate-500'}`}>
                {emailsFailed?.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. MAIN DASHBOARD OVERVIEW KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
        {/* Card 1: Total Samples */}
        <KpiCard
          title="Total Samples"
          value={totalReadings.toLocaleString()}
          unit="Records"
          subtitle="Processed Telemetry"
          icon={Layers}
          color="cyan"
          badge="INGESTION"
        />

        {/* Card 2: Normal Readings */}
        <KpiCard
          title="Normal Readings"
          value={normalReadings.toLocaleString()}
          unit="Normal"
          subtitle={`${(100 - anomalyRate).toFixed(1)}% safe operation`}
          icon={ShieldCheck}
          color="emerald"
          badge="HEALTHY"
        />

        {/* Card 3: Detected Anomalies */}
        <KpiCard
          title="Anomalies"
          value={anomalyCount.toLocaleString()}
          unit="Detected"
          subtitle={`${anomalyRate}% Anomaly Rate`}
          icon={AlertTriangle}
          color="rose"
          badge="OUTLIERS"
        />

        {/* Card 4: Anomaly Rate */}
        <KpiCard
          title="Anomaly Rate"
          value={anomalyRate.toFixed(2)}
          unit="%"
          subtitle="Trained Baseline"
          icon={TrendingUp}
          color={anomalyRate > 5 ? 'rose' : 'amber'}
          badge="RATIO"
        />

        {/* Card 5: Critical Alerts */}
        <KpiCard
          title="Critical Alerts"
          value={criticalAlerts.toLocaleString()}
          unit="Alerts"
          subtitle="1-Anomaly Immediate Triggers"
          icon={AlertOctagon}
          color={criticalAlerts > 0 ? 'rose' : 'emerald'}
          badge={criticalAlerts > 0 ? 'ATTENTION' : 'CLEAR'}
        />

        {/* Card 6: Emails Sent */}
        <KpiCard
          title="Emails Sent"
          value={emailsSent.toLocaleString()}
          unit="Dispatched"
          subtitle="Verified SMTP Port 587"
          icon={Mail}
          color="emerald"
          badge="NOTIFIED"
        />

        {/* Card 7: Email Failures */}
        <KpiCard
          title="Email Failures"
          value={emailsFailed.toLocaleString()}
          unit="Failed"
          subtitle="Safe Error Handling"
          icon={AlertCircle}
          color={emailsFailed > 0 ? 'rose' : 'slate'}
          badge={emailsFailed > 0 ? 'FAILED' : 'NONE'}
        />

        {/* Card 8: Machine Health Score */}
        <KpiCard
          title="Health Score"
          value={healthScore != null ? `${healthScore.toFixed(1)}` : '--'}
          unit="/ 100"
          subtitle={stats?.machine_status || 'Machine 01'}
          icon={HeartPulse}
          color={healthScore < 50 ? 'rose' : healthScore < 75 ? 'amber' : 'emerald'}
          badge="HEALTH INDEX"
        />
      </div>

      {/* 5. REAL-TIME MULTI-PARAMETER CHART */}
      <LiveTempChart height={380} showControls={true} />

      {/* 6. TELEMETRY STREAM & ALERT HISTORY GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Telemetry Data Stream Table */}
        <div className="industrial-card p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-600" />
              <span>Telemetry Data Stream</span>
            </h3>
            <span className="text-xs font-mono text-slate-500">
              Latest {recentReadings.length} records
            </span>
          </div>

          <div className="overflow-x-auto max-h-80">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] sticky top-0 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-2.5">#</th>
                  <th className="py-2.5 px-2.5">Timestamp</th>
                  <th className="py-2.5 px-2.5 text-cyan-700">Temp</th>
                  <th className="py-2.5 px-2.5 text-emerald-700">Vib</th>
                  <th className="py-2.5 px-2.5 text-purple-700">RPM</th>
                  <th className="py-2.5 px-2.5 text-emerald-700">Health</th>
                  <th className="py-2.5 px-2.5">Condition</th>
                  <th className="py-2.5 px-2.5">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {recentReadings.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-slate-400 font-mono">No readings available</td>
                  </tr>
                ) : (
                  recentReadings.map((r, idx) => {
                    const isAnom = r.anomaly_flag === 1 || r.anomalyFlag === 1;
                    const mTemp = Number(r.temperature ?? r.machine_temperature ?? 0);
                    const v = Number(r.vibration ?? 0);
                    const spd = Number(r.rpm ?? 0);
                    const hScore = Number(r.health_score ?? r.healthScore ?? (isAnom ? 35.0 : 95.0));
                    return (
                      <tr key={r.id || idx} className={isAnom ? 'bg-rose-50/60 hover:bg-rose-50' : 'hover:bg-slate-50/80'}>
                        <td className="py-2 px-2.5 text-slate-500">{r.entry_id || idx + 1}</td>
                        <td className="py-2 px-2.5 text-slate-600">{r.created_at?.slice(0, 19)}</td>
                        <td className={`py-2 px-2.5 font-bold ${isAnom ? 'text-rose-600' : 'text-cyan-700'}`}>
                          {mTemp.toFixed(1)}°C
                        </td>
                        <td className="py-2 px-2.5 text-emerald-700 font-medium">{v > 0 ? `${v.toFixed(2)}` : '—'}</td>
                        <td className="py-2 px-2.5 text-purple-700 font-medium">{spd > 0 ? `${spd.toFixed(0)}` : '—'}</td>
                        <td className="py-2 px-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                            hScore < 50
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : hScore < 75
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}>
                            {hScore.toFixed(1)}/100
                          </span>
                        </td>
                        <td className="py-2 px-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isAnom ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}>
                            {isAnom ? 'CRITICAL' : 'NORMAL'}
                          </span>
                        </td>
                        <td className="py-2 px-2.5 text-[10px] text-slate-500 font-mono">
                          {r.data_source || 'DATASET_UPLOAD'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Alert History Table */}
        <div className="industrial-card p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-rose-600" />
              <span>Incident &amp; Alert History</span>
            </h3>
            <span className="text-xs font-mono text-rose-600 font-bold">
              {recentAlerts.length} Active Events
            </span>
          </div>

          <div className="overflow-x-auto max-h-80">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] sticky top-0 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-2.5">Alert ID</th>
                  <th className="py-2.5 px-2.5">Entry / Row</th>
                  <th className="py-2.5 px-2.5 text-amber-700">Parameter</th>
                  <th className="py-2.5 px-2.5 text-rose-700">Value</th>
                  <th className="py-2.5 px-2.5">Severity</th>
                  <th className="py-2.5 px-2.5">Email Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {recentAlerts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400 font-mono">No incidents recorded</td>
                  </tr>
                ) : (
                  recentAlerts.map((a, idx) => {
                    const emailSent = a.email_status === 'EMAIL SENT' || a.email_sent === 1;
                    return (
                      <tr key={a.alert_id || idx} className="hover:bg-slate-50">
                        <td className="py-2 px-2.5 text-cyan-700 font-bold">{a.alert_id}</td>
                        <td className="py-2 px-2.5 text-slate-600">{a.entry_id || '—'}</td>
                        <td className="py-2 px-2.5 text-amber-700 font-medium">{a.parameter}</td>
                        <td className="py-2 px-2.5 font-bold text-rose-600">{Number(a.value || 0).toFixed(1)}</td>
                        <td className="py-2 px-2.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            {a.severity || 'CRITICAL'}
                          </span>
                        </td>
                        <td className="py-2 px-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            emailSent ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}>
                            {a.email_status || (emailSent ? 'EMAIL SENT' : 'EMAIL FAILED')}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

    </div>
  );
}
