import React, { useState, useEffect } from 'react';
import {
  Radio,
  Key,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Activity,
  Server,
  Zap,
  Save,
  RotateCw,
  Eye,
  EyeOff,
  Wifi,
  WifiOff,
  Shield
} from 'lucide-react';
import { api } from '../api/client';
import { useLiveData } from '../context/LiveDataContext';

export function ThingSpeakConfig() {
  const { refreshTelemetry } = useLiveData();
  const [formData, setFormData] = useState({
    channel_id: '',
    read_api_key: '',
    write_api_key: '',
    poll_interval_sec: 30,
    freshness_limit_sec: 120,
    data_source: 'both'
  });
  const [showReadKey, setShowReadKey] = useState(false);
  const [showWriteKey, setShowWriteKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [statusMsg, setStatusMsg] = useState(null);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const res = await api.getThingspeakConfig();
      if (res.success && res.config) {
        setFormData({
          channel_id: res.config.channel_id || '',
          read_api_key: res.config.masked_read_api_key || '',
          write_api_key: res.config.masked_write_api_key || '',
          poll_interval_sec: res.config.poll_interval_sec || 30,
          freshness_limit_sec: res.config.freshness_limit_sec || 120,
          data_source: res.config.data_source || 'both'
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleTestConnection = async () => {
    try {
      setTesting(true);
      setTestResult(null);
      const res = await api.testThingspeakConnection(formData.channel_id, formData.read_api_key);
      setTestResult(res);
      await refreshTelemetry();
    } catch (err) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      setDisconnecting(true);
      setStatusMsg(null);
      const res = await api.disconnectThingspeak();
      if (res.success) {
        setStatusMsg({ type: 'success', text: res.message || 'ThingSpeak disconnected. LIVE polling stopped.' });
        setTestResult(null);
        await fetchConfig();
        await refreshTelemetry();
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setStatusMsg(null);
      const res = await api.updateThingspeakConfig(formData);
      if (res.success) {
        setStatusMsg({ type: 'success', text: res.message || 'ThingSpeak configuration saved successfully.' });
        await fetchConfig();
        await refreshTelemetry();
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
      setTimeout(() => setStatusMsg(null), 5000);
    }
  };

  if (loading) {
    return (
      <div className="industrial-card p-12 text-center text-slate-400 font-mono text-sm">
        Loading ThingSpeak configuration...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="industrial-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Radio className="w-5 h-5 text-cyan-400" />
              <span>ThingSpeak Connection</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Configure your ThingSpeak Channel ID, Read API Key, and polling cadence. API keys are securely stored on backend and masked.
            </p>
          </div>
          <span className="text-xs px-3 py-1 bg-slate-800 text-slate-300 font-mono rounded-full border border-slate-700">
            field1 &rarr; Machine Temp &bull; field2 &rarr; Ambient Temp
          </span>
        </div>
      </div>

      {statusMsg && (
        <div className={`p-3 rounded-lg text-xs font-semibold flex items-center justify-between border ${
          statusMsg.type === 'success' ? 'bg-emerald-950/70 border-emerald-800 text-emerald-300' : 'bg-rose-950/70 border-rose-800 text-rose-300'
        }`}>
          <div className="flex items-center gap-2">
            {statusMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{statusMsg.text}</span>
          </div>
          <button onClick={() => setStatusMsg(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Main Grid: Settings Form & Live Diagnostic Test Box */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Column: Configuration Form */}
        <div className="industrial-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-400" />
              <span>Channel Credentials &amp; Polling Rules</span>
            </h3>
            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-cyan-400 font-mono font-bold">
              Admin Only
            </span>
          </div>

          <form onSubmit={handleSave} className="space-y-4 text-xs font-mono">
            {/* Channel ID */}
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                ThingSpeak Channel ID <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={formData.channel_id}
                onChange={(e) => setFormData(p => ({ ...p, channel_id: e.target.value }))}
                placeholder="e.g. 3454545"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-bold focus:border-cyan-500 focus:outline-none"
                required
              />
              <p className="text-[11px] text-slate-500 font-sans mt-0.5">Numeric channel ID from your ThingSpeak channel settings.</p>
            </div>

            {/* Read API Key */}
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Read API Key <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <input
                  type={showReadKey ? 'text' : 'password'}
                  value={formData.read_api_key}
                  onChange={(e) => setFormData(p => ({ ...p, read_api_key: e.target.value }))}
                  placeholder="Enter Read API Key"
                  className="w-full pl-3 pr-10 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:border-cyan-500 focus:outline-none"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowReadKey(!showReadKey)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
                >
                  {showReadKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-slate-500 font-sans mt-0.5">Required to read feeds from private IoT channels.</p>
            </div>

            {/* Write API Key (Optional) */}
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Write API Key <span className="text-slate-500">(Optional &ndash; for Write API testing)</span>
              </label>
              <div className="relative">
                <input
                  type={showWriteKey ? 'text' : 'password'}
                  value={formData.write_api_key}
                  onChange={(e) => setFormData(p => ({ ...p, write_api_key: e.target.value }))}
                  placeholder="Optional Write API Key"
                  className="w-full pl-3 pr-10 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:border-cyan-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowWriteKey(!showWriteKey)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
                >
                  {showWriteKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Polling Interval & Freshness Limit */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Polling Interval (sec)
                </label>
                <input
                  type="number"
                  min="15"
                  max="300"
                  value={formData.poll_interval_sec}
                  onChange={(e) => setFormData(p => ({ ...p, poll_interval_sec: parseInt(e.target.value) || 30 }))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-bold focus:border-cyan-500 focus:outline-none"
                />
                <span className="text-[10px] text-slate-500">Min 15s (ThingSpeak rate limit)</span>
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Freshness Limit (sec)
                </label>
                <input
                  type="number"
                  min="30"
                  max="600"
                  value={formData.freshness_limit_sec}
                  onChange={(e) => setFormData(p => ({ ...p, freshness_limit_sec: parseInt(e.target.value) || 120 }))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-bold focus:border-cyan-500 focus:outline-none"
                />
                <span className="text-[10px] text-slate-500">Age before marked STALE</span>
              </div>
            </div>

            {/* Data Source Mode */}
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Data Source Operation Mode
              </label>
              <select
                value={formData.data_source}
                onChange={(e) => setFormData(p => ({ ...p, data_source: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-sans focus:border-cyan-500 focus:outline-none"
              >
                <option value="both">Both (Historical Dataset for Stats &amp; ML, ThingSpeak for Live)</option>
                <option value="thingspeak">Live ThingSpeak Only</option>
                <option value="dataset">Uploaded Historical Dataset Only</option>
              </select>
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                disabled={testing}
                onClick={handleTestConnection}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-bold transition"
              >
                <Zap className={`w-3.5 h-3.5 text-amber-400 ${testing ? 'animate-spin' : ''}`} />
                <span>{testing ? 'Testing...' : 'TEST CONNECTION'}</span>
              </button>

              <button
                type="button"
                disabled={disconnecting}
                onClick={handleDisconnect}
                className="flex items-center gap-2 px-4 py-2 bg-rose-950/50 hover:bg-rose-950/80 text-rose-300 border border-rose-800/70 rounded-lg text-xs font-bold transition"
              >
                <WifiOff className="w-3.5 h-3.5" />
                <span>{disconnecting ? 'Disconnecting...' : 'DISCONNECT'}</span>
              </button>

              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold rounded-lg text-xs transition shadow-lg shadow-cyan-500/20"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? 'Saving...' : 'SAVE CONNECTION'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Live Connection Test Feedback & Status Inspector */}
        <div className="space-y-4">
          
          <div className="industrial-card p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <span>Connection Test &amp; Diagnostic Readout</span>
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                Direct Ping
              </span>
            </div>

            {!testResult ? (
              <div className="py-10 text-center text-slate-400 text-xs font-mono space-y-2">
                <Server className="w-10 h-10 text-slate-600 mx-auto" />
                <p>Click <strong>"TEST CONNECTION"</strong> to perform a genuine backend query to api.thingspeak.com.</p>
                <p className="text-[11px] text-slate-500">Verifies authentication, channel existence, and reads latest entry packet.</p>
              </div>
            ) : testResult.success ? (
              <div className="space-y-3 font-mono text-xs">
                <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/80 text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <strong className="text-sm">🟢 ThingSpeak Connected!</strong>
                    <p className="text-[11px] text-emerald-200/90 mt-0.5">{testResult.message}</p>
                  </div>
                </div>

                <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 space-y-2 text-slate-300">
                  <div className="flex justify-between border-b border-slate-800 pb-1.5">
                    <span className="text-slate-400">Channel ID:</span>
                    <strong className="text-white">{testResult.channelId} ({testResult.channelName})</strong>
                  </div>
                  <div className="flex justify-between border-b border-slate-800 pb-1.5">
                    <span className="text-slate-400">Latest Entry ID:</span>
                    <strong className="text-cyan-400">#{testResult.latestEntryId}</strong>
                  </div>
                  <div className="flex justify-between border-b border-slate-800 pb-1.5">
                    <span className="text-slate-400">Latest Machine Temperature:</span>
                    <strong className="text-rose-400">{testResult.latestMachineTemperature !== null ? `${testResult.latestMachineTemperature?.toFixed(2)} °C` : 'N/A'}</strong>
                  </div>
                  <div className="flex justify-between border-b border-slate-800 pb-1.5">
                    <span className="text-slate-400">Latest Ambient Temperature:</span>
                    <strong className="text-indigo-400">{testResult.latestAmbientTemperature !== null ? `${testResult.latestAmbientTemperature?.toFixed(2)} °C` : 'N/A'}</strong>
                  </div>
                  <div className="flex justify-between border-b border-slate-800 pb-1.5">
                    <span className="text-slate-400">ThingSpeak Timestamp (Sensor):</span>
                    <strong className="text-white">{testResult.thingspeakTimestamp}</strong>
                  </div>
                  <div className="flex justify-between pt-0.5">
                    <span className="text-slate-400">Last Successful Fetch (Backend):</span>
                    <strong className="text-slate-300">{testResult.lastSuccessfulFetch}</strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 font-mono text-xs">
                <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800 text-rose-300 flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-sm">🔴 ThingSpeak Connection Failed</strong>
                    <p className="text-xs text-rose-200 mt-1 leading-relaxed">{testResult.error}</p>
                    {testResult.errorCode && (
                      <span className="inline-block mt-2 px-2 py-0.5 rounded bg-rose-900/60 text-[10px] font-bold">
                        Error Code: {testResult.errorCode}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Security Notice Card */}
          <div className="industrial-card p-5 space-y-2">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-cyan-400" />
              <span>Zero Frontend Credential Exposure</span>
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed font-sans">
              ThingSpeak credentials and private Read/Write keys are stored encrypted in the backend SQLite configuration repository. The browser interface only communicates through authorized backend REST APIs.
            </p>
          </div>

        </div>

      </div>

    </div>
  );
}
