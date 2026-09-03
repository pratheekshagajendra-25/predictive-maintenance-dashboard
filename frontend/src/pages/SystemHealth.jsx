import React, { useState, useEffect } from 'react';
import {
  Server,
  Activity,
  Radio,
  Mail,
  Database,
  CheckCircle2,
  AlertCircle,
  Clock,
  Send,
  RotateCw,
  FileText,
  ShieldCheck,
  Zap,
  Cpu
} from 'lucide-react';
import { api } from '../api/client';
import { useLiveData } from '../context/LiveDataContext';
import { KpiCard } from '../components/KpiCard';

export function SystemHealth() {
  const { connection, refreshTelemetry } = useLiveData();
  const [healthData, setHealthData] = useState(null);
  const [logsData, setLogsData] = useState({ system_logs: [], email_logs: [], audit_logs: [] });
  const [activeLogTab, setActiveLogTab] = useState('system'); // 'system', 'email', 'audit'
  const [loading, setLoading] = useState(true);
  
  // Diagnostic tools state
  const [testEmailLoading, setTestEmailLoading] = useState(false);
  const [writeLoading, setWriteLoading] = useState(false);
  const [writeMachineTemp, setWriteMachineTemp] = useState(42.8);
  const [writeAmbientTemp, setWriteAmbientTemp] = useState(36.5);
  const [toolFeedback, setToolFeedback] = useState(null);

  const fetchDiagnostics = async () => {
    try {
      setLoading(true);
      const [hRes, lRes] = await Promise.all([
        api.getSystemHealth(),
        api.getSystemLogs(40)
      ]);
      if (hRes.success) setHealthData(hRes);
      if (lRes.success) setLogsData(lRes);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDiagnostics();
  }, []);

  const handleSendTestEmail = async () => {
    try {
      setTestEmailLoading(true);
      setToolFeedback(null);
      const res = await api.sendTestEmail();
      setToolFeedback({ type: 'success', text: res.message || 'Test email processed successfully.' });
      await fetchDiagnostics();
    } catch (e) {
      setToolFeedback({ type: 'error', text: `Email failed: ${e.message}` });
    } finally {
      setTestEmailLoading(false);
      setTimeout(() => setToolFeedback(null), 6000);
    }
  };

  const handleTestWrite = async (e) => {
    e.preventDefault();
    try {
      setWriteLoading(true);
      setToolFeedback(null);
      const res = await api.writeToThingspeak(writeMachineTemp, writeAmbientTemp);
      if (res.success) {
        setToolFeedback({ type: 'success', text: `ThingSpeak Write Success: Entry ID #${res.entry_id}` });
      } else {
        setToolFeedback({ type: 'error', text: res.message });
      }
      await fetchDiagnostics();
    } catch (e) {
      setToolFeedback({ type: 'error', text: `Write API error: ${e.message}` });
    } finally {
      setWriteLoading(false);
      setTimeout(() => setToolFeedback(null), 6000);
    }
  };

  const sys  = healthData?.system     || {};
  const ts   = healthData?.thingspeak || {};
  // API returns the key as "email", not "smtp"
  const smtp = healthData?.email      || {};

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="industrial-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Server className="w-5 h-5 text-cyan-400" />
              <span>System Health &amp; Infrastructure Diagnostics</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Live status of backend services, SQLite WAL database, ThingSpeak IoT poller, and SMTP notification engine.
            </p>
          </div>
          <button
            onClick={() => { fetchDiagnostics(); refreshTelemetry(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold border border-slate-700 transition"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Refresh Diagnostics</span>
          </button>
        </div>
      </div>

      {toolFeedback && (
        <div className={`p-3 rounded-lg text-xs font-semibold flex items-center justify-between border ${
          toolFeedback.type === 'success' ? 'bg-emerald-950/70 border-emerald-800 text-emerald-300' : 'bg-rose-950/70 border-rose-800 text-rose-300'
        }`}>
          <span>{toolFeedback.text}</span>
          <button onClick={() => setToolFeedback(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Subsystem Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Backend */}
        <div className="industrial-card p-4 space-y-2 border-emerald-500/30">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-semibold uppercase">Backend API</span>
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          </div>
          <div className="text-xl font-bold font-mono text-emerald-400">ONLINE</div>
          <div className="text-[11px] text-slate-400 font-mono">Flask 3.0 &bull; Port 5000</div>
        </div>

        {/* Database */}
        <div className="industrial-card p-4 space-y-2 border-cyan-500/30">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-semibold uppercase">SQLite Database</span>
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
          </div>
          <div className="text-xl font-bold font-mono text-cyan-400">CONNECTED</div>
          <div className="text-[11px] text-slate-400 font-mono">{sys.total_readings?.toLocaleString()} Readings &bull; WAL Mode</div>
        </div>

        {/* ThingSpeak */}
        <div className="industrial-card p-4 space-y-2 border-indigo-500/30">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-semibold uppercase">ThingSpeak Poller</span>
            <div className={`w-2.5 h-2.5 rounded-full ${ts.status === 'LIVE' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          </div>
          <div className="text-xl font-bold font-mono text-indigo-300">{ts.status || 'ACTIVE'}</div>
          <div className="text-[11px] text-slate-400 font-mono">Every {ts.pollInterval || '—'}s &bull; {ts.isConfigured ? 'IoT Feed Active' : 'Not Configured'}</div>
        </div>

        {/* ML Engine */}
        <div className="industrial-card p-4 space-y-2 border-amber-500/30">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-semibold uppercase">ML Model Engine</span>
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          </div>
          <div className="text-xl font-bold font-mono text-amber-300">ACTIVE</div>
          <div className="text-[11px] text-slate-400 font-mono">RF &bull; HistGB &bull; SVC &bull; IF</div>
        </div>
      </div>

      {/* Interactive Diagnostic Consoles */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Console 1: SMTP Email Verification Tool */}
        <div className="industrial-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                SMTP Notification Dispatcher
              </h3>
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
              smtp.configured ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-400'
            }`}>
              {smtp.configured ? 'SMTP ONLINE' : 'SIMULATED (LOGGED)'}
            </span>          </div>

          <div className="space-y-2 font-mono text-xs text-slate-300">
            <div className="flex justify-between p-2 rounded bg-slate-900 border border-slate-800">
              <span className="text-slate-400">Alert Recipient:</span>
              <span className="text-white font-bold">{smtp.alert_recipient_email || '—'}</span>
            </div>
            <div className="flex justify-between p-2 rounded bg-slate-900 border border-slate-800">
              <span className="text-slate-400">SMTP Server Host:</span>
              <span className="text-slate-300">{smtp.smtp_host || 'Simulated / Logged mode'}</span>
            </div>
          </div>

          <button
            disabled={testEmailLoading}
            onClick={handleSendTestEmail}
            className="w-full py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2"
          >
            <Send className={`w-3.5 h-3.5 ${testEmailLoading ? 'animate-pulse text-cyan-400' : ''}`} />
            <span>{testEmailLoading ? 'Sending Test Alert...' : 'Dispatch Diagnostic Test Alert Email'}</span>
          </button>
        </div>

        {/* Console 2: ThingSpeak Write API Tool */}
        <div className="industrial-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                ThingSpeak Write API Tester
              </h3>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-950 text-indigo-400 font-mono font-bold">
              Secure Proxy
            </span>
          </div>

          <form onSubmit={handleTestWrite} className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div>
                <label className="block text-slate-400 mb-1">Machine Temp (°C):</label>
                <input
                  type="number"
                  step="0.1"
                  value={writeMachineTemp}
                  onChange={(e) => setWriteMachineTemp(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-cyan-300 font-bold focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Ambient Temp (°C):</label>
                <input
                  type="number"
                  step="0.1"
                  value={writeAmbientTemp}
                  onChange={(e) => setWriteAmbientTemp(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-indigo-300 font-bold focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={writeLoading}
              className="w-full py-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-2"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{writeLoading ? 'Writing to ThingSpeak...' : 'Send Test Packet via Write API Key'}</span>
            </button>
          </form>

          <p className="text-[11px] text-slate-500">
            Securely posts test sensor values to ThingSpeak without exposing private Write API keys to the browser.
          </p>
        </div>

      </div>

      {/* System Logs & Audit Trail Tabs */}
      <div className="industrial-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Diagnostic Logs &amp; Audit Trail
            </h3>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setActiveLogTab('system')}
              className={`px-3 py-1 rounded font-bold transition ${activeLogTab === 'system' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400'}`}
            >
              System Events ({logsData.system_logs?.length || 0})
            </button>
            <button
              onClick={() => setActiveLogTab('email')}
              className={`px-3 py-1 rounded font-bold transition ${activeLogTab === 'email' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400'}`}
            >
              Email Logs ({logsData.email_logs?.length || 0})
            </button>
            <button
              onClick={() => setActiveLogTab('audit')}
              className={`px-3 py-1 rounded font-bold transition ${activeLogTab === 'audit' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400'}`}
            >
              Audit Trail ({logsData.audit_logs?.length || 0})
            </button>
          </div>
        </div>

        {/* Log Viewer Content */}
        <div className="overflow-x-auto max-h-[380px] font-mono text-xs">
          {activeLogTab === 'system' && (
            <table className="w-full text-left">
              <thead className="bg-slate-900/80 text-slate-400 uppercase text-[11px] border-b border-slate-800 sticky top-0 backdrop-blur">
                <tr>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Level</th>
                  <th className="py-2.5 px-3">Module</th>
                  <th className="py-2.5 px-3">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {logsData.system_logs?.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-800/30">
                    <td className="py-2 px-3 text-slate-400">{l.timestamp}</td>
                    <td className="py-2 px-3">
                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase ${
                        l.level === 'ERROR' ? 'bg-rose-500/20 text-rose-400' :
                        l.level === 'WARNING' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-slate-800 text-slate-300'
                      }`}>
                        {l.level}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-cyan-400 font-semibold">{l.module}</td>
                    <td className="py-2 px-3 text-slate-200">{l.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeLogTab === 'email' && (
            <table className="w-full text-left">
              <thead className="bg-slate-900/80 text-slate-400 uppercase text-[11px] border-b border-slate-800 sticky top-0 backdrop-blur">
                <tr>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Recipient</th>
                  <th className="py-2.5 px-3">Subject</th>
                  <th className="py-2.5 px-3">Severity</th>
                  <th className="py-2.5 px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {logsData.email_logs?.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-800/30">
                    <td className="py-2 px-3 text-slate-400">{e.timestamp}</td>
                    <td className="py-2 px-3 font-semibold text-slate-200">{e.recipient}</td>
                    <td className="py-2 px-3 text-slate-300 truncate max-w-xs">{e.subject}</td>
                    <td className="py-2 px-3 text-rose-400 font-bold">{e.severity}</td>
                    <td className="py-2 px-3 text-right">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        e.status === 'SENT' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
                        e.status === 'SIMULATED' ? 'bg-slate-800 text-slate-300' :
                        'bg-rose-950 text-rose-300 border border-rose-800'
                      }`}>
                        {e.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeLogTab === 'audit' && (
            <table className="w-full text-left">
              <thead className="bg-slate-900/80 text-slate-400 uppercase text-[11px] border-b border-slate-800 sticky top-0 backdrop-blur">
                <tr>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">User</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {logsData.audit_logs?.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-800/30">
                    <td className="py-2 px-3 text-slate-400">{a.timestamp}</td>
                    <td className="py-2 px-3 font-bold text-cyan-400">{a.username}</td>
                    <td className="py-2 px-3 text-slate-400 uppercase">{a.role}</td>
                    <td className="py-2 px-3 font-semibold text-slate-200">{a.action}</td>
                    <td className="py-2 px-3 text-slate-400 truncate max-w-sm">{a.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

    </div>
  );
}
