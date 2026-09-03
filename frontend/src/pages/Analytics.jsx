import React, { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
  ScatterChart,
  Scatter,
  ZAxis,
  LineChart,
  Line
} from 'recharts';
import {
  BarChart3,
  TrendingUp,
  Sliders,
  Layers,
  Thermometer,
  CloudSun,
  Activity,
  Calculator
} from 'lucide-react';
import { api } from '../api/client';
import { KpiCard } from '../components/KpiCard';

export function Analytics() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAnalytics() {
      try {
        const res = await api.getStatistics();
        if (res.success && res.statistics) {
          setStats(res.statistics);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadAnalytics();
  }, []);

  if (loading || !stats) {
    return (
      <div className="industrial-card p-12 text-center text-slate-400 font-mono text-sm">
        Computing statistical characteristics from 3,150 dataset observations...
      </div>
    );
  }

  const mach = stats.machine_temperature || {};
  const amb = stats.ambient_temperature || {};
  const diff = stats.temperature_difference || {};
  const hourly = stats.hourly_statistics || [];
  const machDist = stats.machine_distribution || [];

  return (
    <div className="space-y-6">
      
      {/* 1. TOP HEADER */}
      <div className="industrial-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Calculator className="w-5 h-5 text-cyan-400" />
              <span>Statistical &amp; Historical Telemetry Analytics</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Characteristics calculated dynamically from the complete cleaned historical dataset (3,150 observations).
            </p>
          </div>
          <span className="text-xs px-3 py-1 bg-cyan-950/80 text-cyan-300 font-mono rounded-full border border-cyan-800 font-bold">
            Historical Dataset · N = {stats.total_observations?.toLocaleString()} Records
          </span>
        </div>
      </div>

      {/* 2. STATISTICAL PARAMETERS COMPARISON TABLE */}
      <div className="industrial-card p-5">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          <span>Learned Statistical Characteristics &amp; Limits</span>
        </h3>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900/80 text-slate-400 uppercase text-[11px] border-b border-slate-800">
              <tr>
                <th className="py-3 px-3">Metric</th>
                <th className="py-3 px-3 text-cyan-400 font-bold">Machine Temperature</th>
                <th className="py-3 px-3 text-indigo-400 font-bold">Ambient Temperature</th>
                <th className="py-3 px-3 text-slate-300">Temperature Difference (ΔT)</th>
                <th className="py-3 px-3 text-slate-400">Statistical Meaning</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              <tr className="hover:bg-slate-800/30">
                <td className="py-2.5 px-3 font-semibold text-slate-300">Mean (μ)</td>
                <td className="py-2.5 px-3 font-bold text-cyan-300">{mach.mean?.toFixed(2)} °C</td>
                <td className="py-2.5 px-3 text-indigo-300">{amb.mean?.toFixed(2)} °C</td>
                <td className="py-2.5 px-3">{diff.mean?.toFixed(2)} °C</td>
                <td className="py-2.5 px-3 text-slate-400">Arithmetic central operating average</td>
              </tr>
              <tr className="hover:bg-slate-800/30">
                <td className="py-2.5 px-3 font-semibold text-slate-300">Median (50%)</td>
                <td className="py-2.5 px-3 font-bold text-cyan-300">{mach.median?.toFixed(2)} °C</td>
                <td className="py-2.5 px-3 text-indigo-300">{amb.median?.toFixed(2)} °C</td>
                <td className="py-2.5 px-3">{diff.median?.toFixed(2)} °C</td>
                <td className="py-2.5 px-3 text-slate-400">Robust 50th percentile (skew-resistant)</td>
              </tr>
              <tr className="hover:bg-slate-800/30">
                <td className="py-2.5 px-3 font-semibold text-slate-300">Standard Deviation (σ)</td>
                <td className="py-2.5 px-3 font-bold text-cyan-300">{mach.std?.toFixed(2)} °C</td>
                <td className="py-2.5 px-3 text-indigo-300">{amb.std?.toFixed(2)} °C</td>
                <td className="py-2.5 px-3">{diff.std?.toFixed(2)} °C</td>
                <td className="py-2.5 px-3 text-slate-400">Thermal volatility / spread magnitude</td>
              </tr>
              <tr className="hover:bg-slate-800/30">
                <td className="py-2.5 px-3 font-semibold text-slate-300">Minimum &ndash; Maximum</td>
                <td className="py-2.5 px-3 font-bold text-cyan-300">{mach.min?.toFixed(2)} &ndash; {mach.max?.toFixed(2)} °C</td>
                <td className="py-2.5 px-3 text-indigo-300">{amb.min?.toFixed(2)} &ndash; {amb.max?.toFixed(2)} °C</td>
                <td className="py-2.5 px-3">{diff.min?.toFixed(2)} &ndash; {diff.max?.toFixed(2)} °C</td>
                <td className="py-2.5 px-3 text-slate-400">Observed extreme boundaries</td>
              </tr>
              <tr className="hover:bg-slate-800/30">
                <td className="py-2.5 px-3 font-semibold text-slate-300">Q1 (25%) &ndash; Q3 (75%)</td>
                <td className="py-2.5 px-3 font-bold text-cyan-300">{mach.q1?.toFixed(2)} &ndash; {mach.q3?.toFixed(2)} °C</td>
                <td className="py-2.5 px-3 text-indigo-300">{amb.q1?.toFixed(2)} &ndash; {amb.q3?.toFixed(2)} °C</td>
                <td className="py-2.5 px-3">{diff.q1?.toFixed(2)} &ndash; {diff.q3?.toFixed(2)} °C</td>
                <td className="py-2.5 px-3 text-slate-400">Interquartile middle 50% band</td>
              </tr>
              <tr className="hover:bg-slate-800/30">
                <td className="py-2.5 px-3 font-semibold text-slate-300">Interquartile Range (IQR)</td>
                <td className="py-2.5 px-3 font-bold text-cyan-300">{mach.iqr?.toFixed(2)} °C</td>
                <td className="py-2.5 px-3 text-indigo-300">{amb.iqr?.toFixed(2)} °C</td>
                <td className="py-2.5 px-3">{diff.iqr?.toFixed(2)} °C</td>
                <td className="py-2.5 px-3 text-slate-400">Spread of the central 50% data</td>
              </tr>
              <tr className="hover:bg-slate-800/30 bg-emerald-950/20">
                <td className="py-2.5 px-3 font-semibold text-emerald-300">Normal Operating Band</td>
                <td className="py-2.5 px-3 font-bold text-emerald-400">{mach.normal_range_low?.toFixed(2)} &ndash; {mach.normal_range_high?.toFixed(2)} °C</td>
                <td className="py-2.5 px-3 text-emerald-300">{amb.normal_range_low?.toFixed(2)} &ndash; {amb.normal_range_high?.toFixed(2)} °C</td>
                <td className="py-2.5 px-3 text-emerald-300">{diff.normal_range_low?.toFixed(2)} &ndash; {diff.normal_range_high?.toFixed(2)} °C</td>
                <td className="py-2.5 px-3 text-emerald-400 font-semibold">Empirical 5th &ndash; 95th Percentile baseline</td>
              </tr>
              <tr className="hover:bg-slate-800/30 bg-amber-950/20">
                <td className="py-2.5 px-3 font-semibold text-amber-300">Warning Threshold</td>
                <td className="py-2.5 px-3 font-bold text-amber-400">{mach.warning_threshold?.toFixed(2)} °C</td>
                <td className="py-2.5 px-3 text-amber-300">{amb.warning_threshold?.toFixed(2)} °C</td>
                <td className="py-2.5 px-3 text-amber-300">{diff.warning_threshold?.toFixed(2)} °C</td>
                <td className="py-2.5 px-3 text-amber-400 font-semibold">Calculated Q3 + 1.0 * IQR limit</td>
              </tr>
              <tr className="hover:bg-slate-800/30 bg-rose-950/20">
                <td className="py-2.5 px-3 font-semibold text-rose-300">Critical Threshold</td>
                <td className="py-2.5 px-3 font-bold text-rose-400">{mach.critical_threshold?.toFixed(2)} °C</td>
                <td className="py-2.5 px-3 text-rose-300">{amb.critical_threshold?.toFixed(2)} °C</td>
                <td className="py-2.5 px-3 text-rose-300">{diff.critical_threshold?.toFixed(2)} °C</td>
                <td className="py-2.5 px-3 text-rose-400 font-semibold">Calculated Q3 + 1.5 * IQR Tukey outlier fence</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. CHARTS SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Chart 1: Machine Temperature Distribution Histogram */}
        <div className="industrial-card p-5">
          <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Machine Temperature Distribution
              </h3>
              <p className="text-xs text-slate-400">Frequency counts across binned temperature intervals</p>
            </div>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-cyan-400 font-mono">
              Histogram
            </span>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={machDist} margin={{ top: 10, right: 10, left: -15, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                <XAxis
                  dataKey="bin_label"
                  stroke="#64748B"
                  fontSize={9}
                  angle={-35}
                  textAnchor="end"
                  tickLine={false}
                />
                <YAxis stroke="#64748B" fontSize={10} tickLine={false} axisLine={{ stroke: '#334155' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px', fontSize: '11px', fontFamily: 'monospace' }}
                  formatter={(value) => [`${value} readings`, 'Count']}
                />
                <Bar dataKey="count" name="Frequency" fill="#06B6D4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Hourly Temperature & Anomaly Trends */}
        <div className="industrial-card p-5">
          <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Diurnal / Hourly Thermal Profile
              </h3>
              <p className="text-xs text-slate-400">Average Machine vs Ambient temperature by hour of day</p>
            </div>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-indigo-400 font-mono">
              24-Hour Cycle
            </span>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hourly} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                <XAxis dataKey="hour_label" stroke="#64748B" fontSize={10} tickLine={false} />
                <YAxis domain={['auto', 'auto']} stroke="#64748B" fontSize={10} tickLine={false} unit="°C" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px', fontSize: '11px', fontFamily: 'monospace' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Line type="monotone" dataKey="mean_machine_temp" name="Mean Machine Temp" stroke="#06B6D4" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="mean_ambient_temp" name="Mean Ambient Temp" stroke="#818CF8" strokeWidth={1.5} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      <div className="industrial-card p-5 text-xs text-slate-400 space-y-2">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">Live Machine Health Formula</h3>
        <p className="font-mono text-cyan-300">
          Health = 100 − deviation penalty − threshold proximity − anomaly score penalty − volatility penalty
        </p>
        <p>
          Tiers: 90–100 Excellent, 75–89 Good, 50–74 Warning, 0–49 Critical. Near-warning temperatures, threshold breaches, and anomaly detections immediately reduce the health score. Live health is calculated from the current machine reading and is never assumed to be 100.
        </p>
      </div>

    </div>
  );
}
