import React, { useState, useEffect } from 'react';
import {
  Activity,
  AlertTriangle,
  Search,
  Brain
} from 'lucide-react';
import { api } from '../api/client';
import { KpiCard } from '../components/KpiCard';

export function AnomalyAnalysis() {
  const [anomalies,       setAnomalies]       = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [totalCount,      setTotalCount]      = useState(0);
  const [minTemp,         setMinTemp]         = useState('');
  const [maxTemp,         setMaxTemp]         = useState('');
  const [searchQuery,     setSearchQuery]     = useState('');
  const [selectedAnomaly, setSelectedAnomaly] = useState(null);
  const [explainData,     setExplainData]     = useState(null);
  const [explaining,      setExplaining]      = useState(false);

  // ── Derived KPI values computed from the fetched anomaly list ─────────────
  const [kpiMax,     setKpiMax]     = useState(null);  // hottest anomaly temperature
  const [kpiMin,     setKpiMin]     = useState(null);  // coldest anomaly temperature
  const [kpiAvgConf, setKpiAvgConf] = useState(null);  // average final confidence %

  const fetchAnomalies = async () => {
    try {
      setLoading(true);
      const params = { limit: 100 };
      if (minTemp) params.min_temp = minTemp;
      if (maxTemp) params.max_temp = maxTemp;
      const res = await api.getAnomalies(params);
      if (res.success) {
        const list = res.anomalies || [];
        setAnomalies(list);
        setTotalCount(res.total || 0);

        // Compute real KPI values from the fetched records
        if (list.length > 0) {
          const temps = list.map((a) => a.temperature ?? a.machineTemperature ?? 0);
          setKpiMax(Math.max(...temps));
          setKpiMin(Math.min(...temps));

          const confs = list
            .map((a) => a.finalConfidence ?? a.final_confidence)
            .filter((c) => c != null && !isNaN(c));
          setKpiAvgConf(
            confs.length > 0
              ? confs.reduce((s, v) => s + v, 0) / confs.length
              : null
          );
        } else {
          setKpiMax(null);
          setKpiMin(null);
          setKpiAvgConf(null);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnomalies();
  }, []);

  const handleInspectExplanation = async (anom) => {
    setSelectedAnomaly(anom);
    try {
      setExplaining(true);
      const machTemp = anom.machineTemperature ?? anom.temperature ?? 0;
      const ambTemp  = anom.ambientTemperature ?? anom.ambient_temperature ?? 36.5;
      const res = await api.explainReading(machTemp, ambTemp);
      if (res.success) setExplainData(res.prediction);
    } catch (e) {
      console.error(e);
    } finally {
      setExplaining(false);
    }
  };

  const filteredList = anomalies.filter((a) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      String(a.id).includes(q) ||
      String(a.entryId ?? a.entry_id ?? '').includes(q) ||
      (a.timestamp ?? a.created_at ?? '').toLowerCase().includes(q)
    );
  });

  // ── Helpers to normalise field names (DB returns snake_case, API returns camelCase) ──
  const machTemp  = (a) => a.machineTemperature  ?? a.temperature         ?? 0;
  const ambTemp   = (a) => a.ambientTemperature  ?? a.ambient_temperature ?? 0;
  const tempDiff  = (a) => a.temperatureDifference ?? a.temperature_difference ?? 0;
  const std10     = (a) => a.rollingStd10        ?? a.rolling_std_10      ?? null;
  const roc       = (a) => a.rateOfChange        ?? a.rate_of_change      ?? 0;
  const score     = (a) => a.anomalyScore        ?? a.anomaly_score       ?? 0;
  const rfProb    = (a) => a.rfProbability       ?? a.rf_probability      ?? 0;
  const xgbProb   = (a) => a.xgbProbability      ?? a.xgb_probability     ?? 0;
  const entryId   = (a) => a.entryId             ?? a.entry_id            ?? a.id;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="industrial-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              <span>Multi-Variable Machine Anomaly Analysis</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Explore and audit all detected sensor outliers identified through Isolation Forest,
              Random Forest, and statistical rules.
            </p>
          </div>
          <span className="text-xs px-3 py-1 bg-amber-950/80 text-amber-300 font-mono rounded-full border border-amber-800 font-bold">
            {totalCount} Total Anomalies Flagged
          </span>
        </div>
      </div>

      {/* Summary KPI Grid — values computed from real fetched data */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Anomalies"
          value={totalCount}
          unit="Records"
          subtitle="ML ensemble flagged readings"
          icon={AlertTriangle}
          color="amber"
          badge="DETECTION COUNT"
        />
        <KpiCard
          title="Max Anomaly Temp"
          value={kpiMax != null ? kpiMax.toFixed(2) : '—'}
          unit={kpiMax != null ? '°C' : ''}
          subtitle={kpiMax != null ? 'Highest recorded anomaly temperature' : 'No anomalies loaded'}
          icon={Activity}
          color="rose"
          badge="PEAK SEVERITY"
        />
        <KpiCard
          title="Min Anomaly Temp"
          value={kpiMin != null ? kpiMin.toFixed(2) : '—'}
          unit={kpiMin != null ? '°C' : ''}
          subtitle={kpiMin != null ? 'Lowest recorded anomaly temperature' : 'No anomalies loaded'}
          icon={Activity}
          color="cyan"
          badge="SUB-COOLED"
        />
        <KpiCard
          title="Avg Anomaly Confidence"
          value={kpiAvgConf != null ? kpiAvgConf.toFixed(1) : '—'}
          unit={kpiAvgConf != null ? '%' : ''}
          subtitle="Multi-model ensemble agreement"
          icon={Brain}
          color="emerald"
          badge="ENSEMBLE PRECISION"
        />
      </div>

      {/* Filter Toolbar & Anomalies Table */}
      <div className="industrial-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4 mb-4">

          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by ID or timestamp…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 font-mono focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Temperature range filters */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-mono">Temp Range:</span>
            <input
              type="number"
              placeholder="Min °C"
              value={minTemp}
              onChange={(e) => setMinTemp(e.target.value)}
              className="w-20 px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
            />
            <span className="text-slate-600">–</span>
            <input
              type="number"
              placeholder="Max °C"
              value={maxTemp}
              onChange={(e) => setMaxTemp(e.target.value)}
              className="w-20 px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
            />
            <button
              onClick={fetchAnomalies}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-semibold border border-slate-700"
            >
              Filter
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto max-h-[480px]">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900/90 text-slate-400 uppercase text-[11px] border-b border-slate-800 sticky top-0 backdrop-blur z-10">
              <tr>
                <th className="py-3 px-3">Record ID</th>
                <th className="py-3 px-3">Timestamp</th>
                <th className="py-3 px-3 text-rose-400 font-bold">Machine Temp</th>
                <th className="py-3 px-3 text-indigo-400">Ambient Temp</th>
                <th className="py-3 px-3">Temp Diff (ΔT)</th>
                <th className="py-3 px-3">Rolling Std</th>
                <th className="py-3 px-3">Rate of Change</th>
                <th className="py-3 px-3">Anomaly Score</th>
                <th className="py-3 px-3">RF / XGB Prob</th>
                <th className="py-3 px-3 text-right">Root Cause</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-500 font-mono">
                    Querying anomaly records…
                  </td>
                </tr>
              ) : filteredList.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-500 font-mono">
                    No anomalies matching current filter criteria.
                  </td>
                </tr>
              ) : (
                filteredList.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-2.5 px-3 font-bold text-cyan-400">#{entryId(a)}</td>
                    <td className="py-2.5 px-3 text-slate-400">{a.timestamp ?? a.created_at}</td>
                    <td className="py-2.5 px-3 font-bold text-rose-400">{machTemp(a).toFixed(2)} °C</td>
                    <td className="py-2.5 px-3 text-indigo-300">{ambTemp(a).toFixed(2)} °C</td>
                    <td className="py-2.5 px-3">{tempDiff(a).toFixed(2)} °C</td>
                    <td className="py-2.5 px-3 text-slate-400">{std10(a)?.toFixed(2) ?? '--'}</td>
                    <td className="py-2.5 px-3 text-amber-400">{roc(a).toFixed(2)}</td>
                    <td className="py-2.5 px-3 font-bold text-amber-300">{score(a).toFixed(4)}</td>
                    <td className="py-2.5 px-3 text-slate-400">
                      {(rfProb(a) * 100).toFixed(0)}% / {(xgbProb(a) * 100).toFixed(0)}%
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => handleInspectExplanation(a)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-cyan-950 hover:text-cyan-400 text-slate-300 rounded text-xs font-semibold border border-slate-700 transition"
                      >
                        Explain
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between font-mono">
          <span>Showing {filteredList.length} of {totalCount} anomalies</span>
          <span>Label: Condition = 'Anomaly' &bull; Multi-model ensemble</span>
        </div>
      </div>

      {/* SHAP / Root Cause Explanation Modal */}
      {selectedAnomaly && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="industrial-card max-w-lg w-full p-6 space-y-4 border-slate-700">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-cyan-400" />
                <h4 className="text-sm font-bold text-white font-mono">
                  Anomaly Root-Cause Inspector
                  (Reading #{entryId(selectedAnomaly)})
                </h4>
              </div>
              <button
                onClick={() => { setSelectedAnomaly(null); setExplainData(null); }}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {explaining ? (
              <div className="py-8 text-center text-slate-400 text-xs font-mono">
                Computing Shapley feature contributions…
              </div>
            ) : explainData ? (
              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-cyan-400 font-bold uppercase tracking-wider text-[10px]">
                    Natural-Language Explanation:
                  </span>
                  <p className="text-slate-200 mt-1 leading-relaxed font-sans">
                    {explainData.explanation}
                  </p>
                </div>

                <div>
                  <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                    Top Contributing Feature Weights:
                  </span>
                  <div className="space-y-1.5 mt-1.5 font-mono">
                    {explainData.shap_contributions?.map((sc, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-2 rounded bg-slate-900/80 border border-slate-800/80"
                      >
                        <span className="text-slate-300 font-semibold">{sc.feature}:</span>
                        <div className="flex items-center gap-3">
                          <span className="text-slate-400">
                            {typeof sc.value === 'number' ? sc.value.toFixed(2) : sc.value}
                          </span>
                          <span className={`font-bold ${sc.contribution > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {sc.contribution > 0
                              ? `+${sc.contribution.toFixed(4)}`
                              : sc.contribution.toFixed(4)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => { setSelectedAnomaly(null); setExplainData(null); }}
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
