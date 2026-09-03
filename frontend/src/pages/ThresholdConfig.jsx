import React, { useState, useEffect } from 'react';
import {
  Sliders,
  RotateCcw,
  Save,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Info,
  Thermometer,
  Layers,
  Activity,
  Gauge,
  Zap,
  Radio
} from 'lucide-react';
import { api } from '../api/client';
import { useLiveData } from '../context/LiveDataContext';

export function ThresholdConfig() {
  const { refreshTelemetry } = useLiveData();
  const [activeThresholds, setActiveThresholds] = useState(null);
  const [formData, setFormData] = useState({
    machine_temp_min: 20.0,
    machine_temp_max: 55.0,
    machine_temp_warning: 52.0,
    machine_temp_critical: 55.0,
    ambient_temp_min: 15.0,
    ambient_temp_max: 42.0,
    ambient_temp_warning: 40.0,
    ambient_temp_critical: 42.0,
    vibration_min: 0.1,
    vibration_max: 4.5,
    vibration_warning: 3.5,
    vibration_critical: 4.5,
    rpm_min: 800.0,
    rpm_max: 3200.0,
    rpm_warning: 3000.0,
    rpm_critical: 3200.0,
    pressure_min: 1.0,
    pressure_max: 8.0,
    pressure_warning: 7.0,
    pressure_critical: 8.0,
    current_min: 2.0,
    current_max: 25.0,
    voltage_min: 200.0,
    voltage_max: 250.0,
    consecutive_anomaly_threshold: 1
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  const fetchThresholds = async () => {
    try {
      setLoading(true);
      const res = await api.getThresholds();
      if (res.success && res.active) {
        setActiveThresholds(res.active);
        setFormData({
          machine_temp_min: res.active.machine_temp_min ?? res.active.normal_range_low ?? 20.0,
          machine_temp_max: res.active.machine_temp_max ?? res.active.normal_range_high ?? 55.0,
          machine_temp_warning: res.active.machine_temp_warning ?? 52.0,
          machine_temp_critical: res.active.machine_temp_critical ?? 55.0,
          ambient_temp_min: res.active.ambient_temp_min ?? 15.0,
          ambient_temp_max: res.active.ambient_temp_max ?? 42.0,
          ambient_temp_warning: res.active.ambient_temp_warning ?? 40.0,
          ambient_temp_critical: res.active.ambient_temp_critical ?? 42.0,
          vibration_min: res.active.vibration_min ?? 0.1,
          vibration_max: res.active.vibration_max ?? 4.5,
          vibration_warning: res.active.vibration_warning ?? 3.5,
          vibration_critical: res.active.vibration_critical ?? 4.5,
          rpm_min: res.active.rpm_min ?? 800.0,
          rpm_max: res.active.rpm_max ?? 3200.0,
          rpm_warning: res.active.rpm_warning ?? 3000.0,
          rpm_critical: res.active.rpm_critical ?? 3200.0,
          pressure_min: res.active.pressure_min ?? 1.0,
          pressure_max: res.active.pressure_max ?? 8.0,
          pressure_warning: res.active.pressure_warning ?? 7.0,
          pressure_critical: res.active.pressure_critical ?? 8.0,
          current_min: res.active.current_min ?? 2.0,
          current_max: res.active.current_max ?? 25.0,
          voltage_min: res.active.voltage_min ?? 200.0,
          voltage_max: res.active.voltage_max ?? 250.0,
          consecutive_anomaly_threshold: 1
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchThresholds();
  }, []);

  const handleChange = (field, val) => {
    setFormData(prev => ({ ...prev, [field]: parseFloat(val) || 0 }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (formData.machine_temp_min >= formData.machine_temp_max) {
      setStatusMsg({ type: 'error', text: 'Machine Temperature Min must be strictly lower than Max limit.' });
      return;
    }
    if (formData.vibration_min >= formData.vibration_max) {
      setStatusMsg({ type: 'error', text: 'Vibration Min must be strictly lower than Max limit.' });
      return;
    }
    if (formData.rpm_min >= formData.rpm_max) {
      setStatusMsg({ type: 'error', text: 'RPM Min must be strictly lower than Max limit.' });
      return;
    }

    try {
      setSaving(true);
      setStatusMsg(null);
      const res = await api.updateThresholds(formData);
      if (res.success) {
        setStatusMsg({ type: 'success', text: 'Thresholds saved successfully. 1-anomaly immediate alert rule active.' });
        await fetchThresholds();
        if (refreshTelemetry) await refreshTelemetry();
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
      setTimeout(() => setStatusMsg(null), 5000);
    }
  };

  const handleReset = async () => {
    try {
      setResetting(true);
      setStatusMsg(null);
      const res = await api.resetThresholds();
      if (res.success) {
        setStatusMsg({ type: 'success', text: 'Thresholds reset to calculated engineering defaults.' });
        await fetchThresholds();
        if (refreshTelemetry) await refreshTelemetry();
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message });
    } finally {
      setResetting(false);
      setTimeout(() => setStatusMsg(null), 5000);
    }
  };

  if (loading) {
    return (
      <div className="industrial-card p-12 text-center text-slate-400 font-mono text-sm">
        Loading threshold configuration...
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
              <Sliders className="w-5 h-5 text-amber-400" />
              <span>Machine Operating Limits &amp; Alert Rules</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Configure safe operating bounds for all machine telemetry channels.
            </p>
          </div>
          <button
            disabled={resetting}
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold border border-slate-700 transition"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${resetting ? 'animate-spin' : ''}`} />
            <span>Reset to Factory Defaults</span>
          </button>
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

      {/* Critical Trigger Rule Banner */}
      <div className="industrial-card p-4 bg-gradient-to-r from-red-950/40 via-slate-900 to-slate-900 border border-red-500/30">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-900/50 border border-red-700/60 text-red-300 font-bold">
              1 ANOMALY
            </div>
            <div>
              <div className="text-xs font-bold text-white uppercase tracking-wider">
                Anomaly Alert Trigger: 1 anomaly (Immediate Critical Alert)
              </div>
              <div className="text-[11px] text-slate-400">
                A single anomalous parameter violation immediately triggers a Critical Incident Alert and sends an alert email. No waiting for multiple readings.
              </div>
            </div>
          </div>
          <span className="text-[11px] px-3 py-1 bg-emerald-950 text-emerald-300 font-mono font-bold rounded border border-emerald-800">
            Rule Active: Exact 1
          </span>
        </div>
      </div>

      {/* Threshold Editing Form */}
      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {/* Card 1: Machine Temperature Limits */}
          <div className="industrial-card p-5 space-y-3 border-cyan-500/30">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-cyan-400" />
                <span>Temperature (°C)</span>
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 font-mono font-bold">
                Spindle
              </span>
            </div>

            <div className="space-y-2.5 font-mono text-xs">
              <div>
                <label className="block text-slate-400 mb-0.5">Safe Min Limit (°C):</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.machine_temp_min}
                  onChange={(e) => handleChange('machine_temp_min', e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-bold focus:border-cyan-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-0.5">Safe Max Limit (°C):</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.machine_temp_max}
                  onChange={(e) => handleChange('machine_temp_max', e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-bold focus:border-cyan-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-amber-400 mb-0.5">Warning Level (°C):</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.machine_temp_warning}
                  onChange={(e) => handleChange('machine_temp_warning', e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-amber-500/50 rounded-lg text-amber-300 font-bold focus:border-amber-400 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-rose-400 mb-0.5">Critical Level (°C):</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.machine_temp_critical}
                  onChange={(e) => handleChange('machine_temp_critical', e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-rose-500/50 rounded-lg text-rose-300 font-bold focus:border-rose-400 focus:outline-none"
                  required
                />
              </div>
            </div>
          </div>

          {/* Card 2: Vibration Limits */}
          <div className="industrial-card p-5 space-y-3 border-emerald-500/30">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>Vibration (mm/s)</span>
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 font-mono font-bold">
                Harmonics
              </span>
            </div>

            <div className="space-y-2.5 font-mono text-xs">
              <div>
                <label className="block text-slate-400 mb-0.5">Safe Min Limit (mm/s):</label>
                <input
                  type="number"
                  step="0.05"
                  value={formData.vibration_min}
                  onChange={(e) => handleChange('vibration_min', e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-bold focus:border-emerald-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-0.5">Safe Max Limit (mm/s):</label>
                <input
                  type="number"
                  step="0.05"
                  value={formData.vibration_max}
                  onChange={(e) => handleChange('vibration_max', e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-bold focus:border-emerald-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-amber-400 mb-0.5">Warning Level (mm/s):</label>
                <input
                  type="number"
                  step="0.05"
                  value={formData.vibration_warning}
                  onChange={(e) => handleChange('vibration_warning', e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-amber-500/50 rounded-lg text-amber-300 font-bold focus:border-amber-400 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-rose-400 mb-0.5">Critical Level (mm/s):</label>
                <input
                  type="number"
                  step="0.05"
                  value={formData.vibration_critical}
                  onChange={(e) => handleChange('vibration_critical', e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-rose-500/50 rounded-lg text-rose-300 font-bold focus:border-rose-400 focus:outline-none"
                  required
                />
              </div>
            </div>
          </div>

          {/* Card 3: RPM Limits */}
          <div className="industrial-card p-5 space-y-3 border-indigo-500/30">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Gauge className="w-4 h-4 text-indigo-400" />
                <span>Rotation (RPM)</span>
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-950 text-indigo-400 font-mono font-bold">
                Motor
              </span>
            </div>

            <div className="space-y-2.5 font-mono text-xs">
              <div>
                <label className="block text-slate-400 mb-0.5">Safe Min Limit (RPM):</label>
                <input
                  type="number"
                  step="10"
                  value={formData.rpm_min}
                  onChange={(e) => handleChange('rpm_min', e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-bold focus:border-indigo-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-0.5">Safe Max Limit (RPM):</label>
                <input
                  type="number"
                  step="10"
                  value={formData.rpm_max}
                  onChange={(e) => handleChange('rpm_max', e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-bold focus:border-indigo-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-amber-400 mb-0.5">Warning Level (RPM):</label>
                <input
                  type="number"
                  step="10"
                  value={formData.rpm_warning}
                  onChange={(e) => handleChange('rpm_warning', e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-amber-500/50 rounded-lg text-amber-300 font-bold focus:border-amber-400 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-rose-400 mb-0.5">Critical Level (RPM):</label>
                <input
                  type="number"
                  step="10"
                  value={formData.rpm_critical}
                  onChange={(e) => handleChange('rpm_critical', e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-rose-500/50 rounded-lg text-rose-300 font-bold focus:border-rose-400 focus:outline-none"
                  required
                />
              </div>
            </div>
          </div>

          {/* Card 4: Pressure Limits */}
          <div className="industrial-card p-5 space-y-3 border-amber-500/30">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                <span>Hydraulic Pressure (bar)</span>
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950 text-amber-400 font-mono font-bold">
                Hydraulics
              </span>
            </div>

            <div className="space-y-2.5 font-mono text-xs">
              <div>
                <label className="block text-slate-400 mb-0.5">Safe Min Limit (bar):</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.pressure_min}
                  onChange={(e) => handleChange('pressure_min', e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-bold focus:border-amber-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-0.5">Safe Max Limit (bar):</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.pressure_max}
                  onChange={(e) => handleChange('pressure_max', e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-bold focus:border-amber-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-amber-400 mb-0.5">Warning Level (bar):</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.pressure_warning}
                  onChange={(e) => handleChange('pressure_warning', e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-amber-500/50 rounded-lg text-amber-300 font-bold focus:border-amber-400 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-rose-400 mb-0.5">Critical Level (bar):</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.pressure_critical}
                  onChange={(e) => handleChange('pressure_critical', e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-rose-500/50 rounded-lg text-rose-300 font-bold focus:border-rose-400 focus:outline-none"
                  required
                />
              </div>
            </div>
          </div>

          {/* Card 5: Ambient Temperature */}
          <div className="industrial-card p-5 space-y-3 border-blue-500/30">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Radio className="w-4 h-4 text-blue-400" />
                <span>Ambient Temp (°C)</span>
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded bg-blue-950 text-blue-400 font-mono font-bold">
                Environment
              </span>
            </div>

            <div className="space-y-2.5 font-mono text-xs">
              <div>
                <label className="block text-slate-400 mb-0.5">Min Ambient Limit (°C):</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.ambient_temp_min}
                  onChange={(e) => handleChange('ambient_temp_min', e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-bold focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-0.5">Max Ambient Limit (°C):</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.ambient_temp_max}
                  onChange={(e) => handleChange('ambient_temp_max', e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-bold focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
            </div>
          </div>

          {/* Card 6: Current & Voltage */}
          <div className="industrial-card p-5 space-y-3 border-purple-500/30">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Zap className="w-4 h-4 text-purple-400" />
                <span>Electrical (A / V)</span>
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded bg-purple-950 text-purple-400 font-mono font-bold">
                Power
              </span>
            </div>

            <div className="space-y-2.5 font-mono text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-0.5">Min Current (A):</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.current_min}
                    onChange={(e) => handleChange('current_min', e.target.value)}
                    className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-bold focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-0.5">Max Current (A):</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.current_max}
                    onChange={(e) => handleChange('current_max', e.target.value)}
                    className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-bold focus:border-purple-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-0.5">Min Voltage (V):</label>
                  <input
                    type="number"
                    step="1"
                    value={formData.voltage_min}
                    onChange={(e) => handleChange('voltage_min', e.target.value)}
                    className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-bold focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-0.5">Max Voltage (V):</label>
                  <input
                    type="number"
                    step="1"
                    value={formData.voltage_max}
                    onChange={(e) => handleChange('voltage_max', e.target.value)}
                    className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-bold focus:border-purple-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold rounded-lg text-sm transition shadow-lg shadow-cyan-500/20"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving Changes...' : 'Save & Apply Thresholds'}</span>
          </button>
        </div>
      </form>

    </div>
  );
}
