import React, { useState, useEffect, useCallback } from 'react';
import {
  Radio,
  RefreshCw,
  Sliders,
  AlertTriangle,
  Clock,
  Play,
  Pause,
  Filter,
  CheckCircle2,
  AlertOctagon,
  Thermometer,
  CloudSun,
  Wifi,
  WifiOff,
  Database,
  Activity,
  Gauge,
  Layers,
  Zap
} from 'lucide-react';
import { useLiveData } from '../context/LiveDataContext';
import { api } from '../api/client';
import { MachineStatusBadge } from '../components/MachineStatusBadge';
import { LiveTempChart } from '../components/LiveTempChart';

export function LiveMonitoring() {
  const {
    latestReading,
    connection,
    pollIntervalMs,
    setPollIntervalMs,
    refreshTelemetry,
  } = useLiveData();

  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [pollLoading, setPollLoading] = useState(false);
  const [filterCondition, setFilterCondition] = useState('all');

  // Fetch recent readings from DB
  const fetchStream = useCallback(async () => {
    if (isPaused) return;
    try {
      const res = await api.getReadings({ limit: 40 });
      if (res.success && res.readings) setReadings(res.readings);
    } catch (e) {
      console.error('Stream fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [isPaused]);

  useEffect(() => {
    fetchStream();
    const id = setInterval(fetchStream, pollIntervalMs || 15000);
    return () => clearInterval(id);
  }, [fetchStream, pollIntervalMs]);

  // Manual poll: trigger ThingSpeak fetch then refresh table
  const handleManualPoll = async () => {
    try {
      setPollLoading(true);
      await api.pollNow();
      if (refreshTelemetry) await refreshTelemetry();
      await fetchStream();
    } catch (e) {
      console.error('Manual poll error:', e);
    } finally {
      setPollLoading(false);
    }
  };

  const filteredReadings = readings.filter((r) => {
    const isAnom = r.anomaly_flag === 1 || r.anomalyFlag === 1;
    if (filterCondition === 'anomaly') return isAnom;
    if (filterCondition === 'normal') return !isAnom;
    return true;
  });

  const connStatus = connection?.status || 'OFFLINE';
  const isLive = connStatus === 'LIVE';

  const temp = Number(latestReading?.temperature ?? latestReading?.machine_temperature ?? latestReading?.machineTemperature ?? 0);
  const ambTemp = Number(latestReading?.ambient_temperature ?? latestReading?.ambientTemperature ?? 0);
  const vib = Number(latestReading?.vibration ?? 1.2);
  const rpm = Number(latestReading?.rpm ?? 1800);
  const press = Number(latestReading?.pressure ?? 4.0);
  const health = Number(latestReading?.health_score ?? latestReading?.healthScore ?? 100);
  const isAnomaly = Boolean(latestReading?.anomaly_flag === 1 || latestReading?.anomalyFlag === 1);

  return (
    <div className="space-y-6">

      {/* Status Header */}
      <MachineStatusBadge />

      {/* Connection Mode Indicator */}
      <div className={`industrial-card p-3 flex flex-wrap items-center justify-between gap-3 text-xs font-mono border ${
        isLive ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300' : 'bg-slate-900 border-slate-700 text-slate-300'
      }`}>
        <div className="flex items-center gap-2">
          {isLive ? <Wifi className="w-4 h-4 text-emerald-400" /> : <WifiOff className="w-4 h-4 text-rose-400" />}
          <span>
            {isLive ? (
              <strong className="text-emerald-300">🟢 LIVE IoT Stream Active &bull; Connected to ThingSpeak Channel</strong>
            ) : (
              <strong className="text-slate-300">🔴 ThingSpeak IoT Disconnected &bull; Displaying Database / Ingested Telemetry</strong>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2 text-slate-400 text-[11px]">
          <span>Data Source: <strong className="text-white">{latestReading?.data_source || (isLive ? 'ThingSpeak Live' : 'Database Ingestion')}</strong></span>
        </div>
      </div>

      {/* Real-Time Telemetry Chart */}
      <LiveTempChart height={340} showControls={true} />

      {/* Live Reading Snapshot Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Machine Temp */}
        <div className="industrial-card p-3 text-center space-y-1">
          <div className="flex items-center justify-center gap-1 text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
            <Thermometer className="w-3.5 h-3.5 text-cyan-400" />
            Machine Temp
          </div>
          <div className={`text-xl font-bold font-mono ${isAnomaly ? 'text-rose-400' : 'text-cyan-300'}`}>
            {temp.toFixed(2)} °C
          </div>
        </div>

        {/* Ambient Temp */}
        <div className="industrial-card p-3 text-center space-y-1">
          <div className="flex items-center justify-center gap-1 text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
            <CloudSun className="w-3.5 h-3.5 text-indigo-400" />
            Ambient Temp
          </div>
          <div className="text-xl font-bold font-mono text-indigo-300">
            {ambTemp.toFixed(2)} °C
          </div>
        </div>

        {/* Vibration */}
        <div className="industrial-card p-3 text-center space-y-1">
          <div className="flex items-center justify-center gap-1 text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            Vibration
          </div>
          <div className="text-xl font-bold font-mono text-emerald-300">
            {vib.toFixed(2)} mm/s
          </div>
        </div>

        {/* RPM */}
        <div className="industrial-card p-3 text-center space-y-1">
          <div className="flex items-center justify-center gap-1 text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
            <Gauge className="w-3.5 h-3.5 text-purple-400" />
            Speed
          </div>
          <div className="text-xl font-bold font-mono text-purple-300">
            {rpm.toFixed(0)} RPM
          </div>
        </div>

        {/* Machine Health Score */}
        <div className="industrial-card p-3 text-center space-y-1">
          <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Machine Health</div>
          <div className={`text-xl font-bold font-mono ${
            health >= 75 ? 'text-emerald-400' :
            health >= 50 ? 'text-amber-400' : 'text-rose-400'
          }`}>
            {health.toFixed(1)} / 100
          </div>
        </div>

        {/* Anomaly Rule */}
        <div className="industrial-card p-3 text-center space-y-1">
          <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Alert Trigger</div>
          <div className={`text-xs font-bold font-mono p-1 rounded ${isAnomaly ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-emerald-950 text-emerald-300'}`}>
            {isAnomaly ? '🚨 CRITICAL' : '1 Anomaly Rule'}
          </div>
        </div>
      </div>

      {/* Stream Table & Controls */}
      <div className="industrial-card p-5 space-y-4">
        
        {/* Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              <span>Telemetry Data Stream</span>
            </h3>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
              {filteredReadings.length} records
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter */}
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-lg p-1 text-xs font-mono">
              <span className="text-[10px] text-slate-500 px-1">FILTER:</span>
              {['all', 'normal', 'anomaly'].map((cond) => (
                <button
                  key={cond}
                  onClick={() => setFilterCondition(cond)}
                  className={`px-2 py-0.5 rounded uppercase font-bold text-[10px] ${
                    filterCondition === cond ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {cond}
                </button>
              ))}
            </div>

            {/* Poll Cadence Selector */}
            <select
              value={pollIntervalMs}
              onChange={(e) => setPollIntervalMs(parseInt(e.target.value, 10))}
              className="px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-slate-200 focus:outline-none"
            >
              <option value={5000}>Refresh 5s</option>
              <option value={15000}>Refresh 15s</option>
              <option value={30000}>Refresh 30s</option>
            </select>

            {/* Pause/Resume Stream */}
            <button
              onClick={() => setIsPaused(!isPaused)}
              className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold border transition ${
                isPaused ? 'bg-amber-950 text-amber-300 border-amber-700' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              <span>{isPaused ? 'Resume' : 'Pause'}</span>
            </button>

            {/* Manual Poll */}
            <button
              disabled={pollLoading}
              onClick={handleManualPoll}
              className="flex items-center gap-1.5 px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-slate-950 rounded-lg text-xs font-bold transition shadow disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${pollLoading ? 'animate-spin' : ''}`} />
              <span>Poll Now</span>
            </button>
          </div>
        </div>

        {/* Readings Table */}
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900 text-slate-400 uppercase text-[11px] sticky top-0 border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3 text-cyan-400">Machine Temp</th>
                <th className="py-2.5 px-3 text-indigo-400">Ambient Temp</th>
                <th className="py-2.5 px-3 text-emerald-400">Vibration</th>
                <th className="py-2.5 px-3 text-purple-400">RPM</th>
                <th className="py-2.5 px-3">Condition</th>
                <th className="py-2.5 px-3">Anomaly Score</th>
                <th className="py-2.5 px-3">Health Score</th>
                <th className="py-2.5 px-3">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-500 font-mono">
                    Loading telemetry stream...
                  </td>
                </tr>
              ) : filteredReadings.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-500 font-mono">
                    No readings found matching filter.
                  </td>
                </tr>
              ) : (
                filteredReadings.map((r, idx) => {
                  const isAnom = r.anomaly_flag === 1 || r.anomalyFlag === 1;
                  const mTemp = Number(r.temperature ?? r.machine_temperature ?? r.machineTemperature ?? 0);
                  const aTemp = Number(r.ambient_temperature ?? r.ambientTemperature ?? 0);
                  const v = Number(r.vibration ?? 0);
                  const spd = Number(r.rpm ?? 0);
                  const anomScore = Number(r.anomaly_score ?? r.anomalyScore ?? 0);
                  const hScore = Number(r.health_score ?? r.healthScore ?? 100);

                  return (
                    <tr key={r.id || idx} className={isAnom ? 'bg-rose-950/25 hover:bg-rose-950/35' : 'hover:bg-slate-800/40'}>
                      <td className="py-2 px-3 text-slate-500">{r.entry_id || r.id || idx + 1}</td>
                      <td className="py-2 px-3 text-slate-400">{r.thingspeak_created_at || r.created_at || '—'}</td>
                      <td className={`py-2 px-3 font-bold ${isAnom ? 'text-rose-400' : 'text-cyan-300'}`}>
                        {mTemp.toFixed(2)} °C
                      </td>
                      <td className="py-2 px-3 text-indigo-300">{aTemp.toFixed(2)} °C</td>
                      <td className="py-2 px-3 text-emerald-300">{v > 0 ? `${v.toFixed(2)} mm/s` : '—'}</td>
                      <td className="py-2 px-3 text-purple-300">{spd > 0 ? `${spd.toFixed(0)} RPM` : '—'}</td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isAnom ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-emerald-950 text-emerald-300'
                        }`}>
                          {r.condition || (isAnom ? 'Anomaly' : 'Normal')}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-300">{anomScore.toFixed(4)}</td>
                      <td className="py-2 px-3 font-bold text-white">{hScore.toFixed(1)}</td>
                      <td className="py-2 px-3 text-[11px] text-slate-500 font-mono">{r.data_source || 'DATABASE'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

      </div>

    </div>
  );
}
