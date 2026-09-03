import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
  ReferenceArea,
  CartesianGrid,
  Dot
} from 'recharts';
import { Clock, RefreshCw, Activity, Thermometer, Gauge, Layers } from 'lucide-react';
import { api } from '../api/client';
import { useLiveData } from '../context/LiveDataContext';

const TIME_RANGES = [
  { label: '50 Pts', value: '50' },
  { label: '100 Pts', value: '100' },
  { label: '200 Pts', value: '200' },
  { label: '500 Pts', value: '500' }
];

const PARAMETERS = [
  { id: 'temperature', label: 'Temperature', unit: '°C', color: '#0891B2', icon: Thermometer },
  { id: 'vibration', label: 'Vibration', unit: 'mm/s', color: '#059669', icon: Activity },
  { id: 'rpm', label: 'RPM', unit: 'RPM', color: '#6366F1', icon: Gauge },
  { id: 'pressure', label: 'Pressure', unit: 'bar', color: '#D97706', icon: Layers }
];

export function LiveTempChart({ height = 360, showControls = true }) {
  const { thresholds, latestReading } = useLiveData();
  const [selectedRange, setSelectedRange] = useState('100');
  const [selectedParam, setSelectedParam] = useState('temperature');
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchChartSeries = async (range) => {
    try {
      setIsRefreshing(true);
      const res = await api.getChartData(range);
      const rows = res.data || res.series || [];
      const formatted = rows.map(r => ({
        id: r.id,
        time: r.time || (r.timestamp || r.created_at || '').slice(11, 19),
        fullTime: r.timestamp || r.created_at || '',
        temperature: Number(r.temperature ?? r.machineTemperature ?? 0),
        ambientTemperature: Number(r.ambient_temperature ?? r.ambientTemperature ?? 0),
        vibration: Number(r.vibration ?? 0),
        rpm: Number(r.rpm ?? 0),
        pressure: Number(r.pressure ?? 0),
        condition: r.condition || 'Normal',
        isAnomaly: Boolean(r.isAnomaly || r.anomaly_flag === 1)
      }));
      setChartData(formatted);
    } catch (e) {
      console.error('Failed to load chart series:', e);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchChartSeries(selectedRange);
  }, [selectedRange]);

  useEffect(() => {
    if (latestReading && selectedRange === '100') {
      fetchChartSeries('100');
    }
  }, [latestReading?.id]);

  const activeParamMeta = PARAMETERS.find(p => p.id === selectedParam) || PARAMETERS[0];

  // Dynamic limits based on selected parameter
  let warnThresh = thresholds?.machine_temp_warning || 52.0;
  let critThresh = thresholds?.machine_temp_critical || 55.0;
  let normLow = thresholds?.machine_temp_min || thresholds?.normal_range_low || 20.0;
  let normHigh = thresholds?.machine_temp_max || thresholds?.normal_range_high || 55.0;

  if (selectedParam === 'vibration') {
    warnThresh = thresholds?.vibration_warning || 3.5;
    critThresh = thresholds?.vibration_critical || 4.5;
    normLow = thresholds?.vibration_min || 0.1;
    normHigh = thresholds?.vibration_max || 4.5;
  } else if (selectedParam === 'rpm') {
    warnThresh = thresholds?.rpm_warning || 3000;
    critThresh = thresholds?.rpm_critical || 3200;
    normLow = thresholds?.rpm_min || 800;
    normHigh = thresholds?.rpm_max || 3200;
  } else if (selectedParam === 'pressure') {
    warnThresh = thresholds?.pressure_warning || 7.0;
    critThresh = thresholds?.pressure_critical || 8.0;
    normLow = thresholds?.pressure_min || 1.0;
    normHigh = thresholds?.pressure_max || 8.0;
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white border border-slate-200 p-3 rounded-lg shadow-xl font-mono text-xs z-50 text-slate-800">
          <div className="text-slate-500 text-[11px] mb-1.5 border-b border-slate-100 pb-1 font-sans">
            {data.fullTime || label}
          </div>
          <div className="flex items-center justify-between gap-4 text-cyan-700 font-bold">
            <span>{activeParamMeta.label}:</span>
            <span>{data[selectedParam]?.toFixed(2)} {activeParamMeta.unit}</span>
          </div>
          {selectedParam === 'temperature' && (
            <div className="flex items-center justify-between gap-4 text-indigo-600 font-semibold mt-0.5">
              <span>Ambient Temp:</span>
              <span>{data.ambientTemperature?.toFixed(2)} °C</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-4 text-slate-500 mt-1 pt-1 border-t border-slate-100 text-[11px]">
            <span>Condition:</span>
            <span className={data.isAnomaly ? 'text-rose-600 font-bold' : 'text-emerald-600 font-bold'}>
              {data.condition}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  const renderCustomDot = (props) => {
    const { cx, cy, payload } = props;
    if (payload.isAnomaly) {
      return (
        <circle cx={cx} cy={cy} r={5} fill="#EF4444" stroke="#FFFFFF" strokeWidth={2} />
      );
    }
    return null;
  };

  return (
    <div className="industrial-card p-5">
      {showControls && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <span>Telemetry &amp; Anomaly Chart</span>
            </h3>
            <p className="text-xs text-slate-500">Live multi-parameter telemetry with anomaly detection highlights</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Parameter Selector */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
              {PARAMETERS.map((p) => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedParam(p.id)}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded transition ${
                      selectedParam === p.id
                        ? 'bg-cyan-600 text-white font-bold shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{p.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Time Range Selector */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
              {TIME_RANGES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setSelectedRange(r.value)}
                  className={`px-2 py-1 text-xs font-semibold rounded transition ${
                    selectedRange === r.value
                      ? 'bg-white text-slate-900 font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                  }`}
                >
                  {r.label}
                </button>
              ))}
              <button
                onClick={() => fetchChartSeries(selectedRange)}
                className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded ml-1"
                title="Refresh Chart"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-600' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recharts Canvas */}
      <div style={{ width: '100%', height }}>
        {loading ? (
          <div className="w-full h-full flex items-center justify-center text-slate-400 font-mono text-sm">
            Loading telemetry series...
          </div>
        ) : chartData.length === 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 font-mono text-xs border border-dashed border-slate-200 bg-slate-50/50 rounded-lg p-6">
            <Activity className="w-10 h-10 text-slate-300 mb-2.5" />
            <span className="text-slate-700 font-bold text-sm font-sans">No Telemetry Records Available</span>
            <span className="text-slate-500 mt-1 text-center max-w-sm font-sans">Connect ThingSpeak IoT channel or upload a CSV / XLSX dataset to plot live telemetry charts.</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              
              <XAxis
                dataKey="time"
                stroke="#94A3B8"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: '#E2E8F0' }}
              />
              <YAxis
                domain={['auto', 'auto']}
                stroke="#94A3B8"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: '#E2E8F0' }}
                unit={activeParamMeta.unit}
              />

              <Tooltip content={<CustomTooltip />} />
              
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ paddingBottom: '10px', fontSize: '11px' }}
                formatter={(value) => <span className="text-slate-600 font-medium">{value}</span>}
              />

              {/* Shaded Normal Operating Band */}
              <ReferenceArea
                y1={normLow}
                y2={normHigh}
                fill="#10B981"
                fillOpacity={0.08}
                stroke="#10B981"
                strokeOpacity={0.25}
                strokeDasharray="2 2"
              />

              {/* Warning Threshold Line */}
              <ReferenceLine
                y={warnThresh}
                stroke="#D97706"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{ value: `Warning (${warnThresh}${activeParamMeta.unit})`, fill: '#D97706', fontSize: 10, position: 'insideTopLeft' }}
              />

              {/* Critical Threshold Line */}
              <ReferenceLine
                y={critThresh}
                stroke="#DC2626"
                strokeDasharray="5 3"
                strokeWidth={1.5}
                label={{ value: `Critical (${critThresh}${activeParamMeta.unit})`, fill: '#DC2626', fontSize: 10, position: 'insideTopLeft' }}
              />

              {/* Selected Parameter Line */}
              <Line
                type="monotone"
                dataKey={selectedParam}
                name={activeParamMeta.label}
                stroke={activeParamMeta.color}
                strokeWidth={2}
                dot={renderCustomDot}
                activeDot={{ r: 5, fill: activeParamMeta.color, stroke: '#FFFFFF', strokeWidth: 2 }}
                isAnimationActive={false}
              />

              {/* Optional Ambient Temp Line when Temperature is selected */}
              {selectedParam === 'temperature' && (
                <Line
                  type="monotone"
                  dataKey="ambientTemperature"
                  name="Ambient Temperature"
                  stroke="#6366F1"
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 4, fill: '#6366F1' }}
                  isAnimationActive={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
