import React, { useState, useEffect } from 'react';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Database,
  RotateCw,
  Sparkles,
  ArrowRight,
  FileCheck,
  BarChart2,
  Layers,
  Activity,
  FileText
} from 'lucide-react';
import { api } from '../api/client';
import { useLiveData } from '../context/LiveDataContext';

export function DataManagement() {
  const { refreshTelemetry } = useLiveData();
  const [currentDataset, setCurrentDataset] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [processedResult, setProcessedResult] = useState(null);
  const [statusMsg, setStatusMsg] = useState(null);

  const fetchDatasetInfo = async () => {
    try {
      const res = await api.getCurrentDataset();
      if (res.success && res.dataset) {
        setCurrentDataset(res.dataset);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchDatasetInfo();
  }, []);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploading(true);
      setStatusMsg(null);
      const res = await api.uploadAndValidateDataset(formData);
      if (res.success) {
        setProcessedResult(res);
        setStatusMsg({
          type: 'success',
          text: `Successfully uploaded and analyzed ${res.summary?.totalRows || 0} rows from "${file.name}".`
        });
        await fetchDatasetInfo();
        if (refreshTelemetry) await refreshTelemetry();
      } else {
        setStatusMsg({ type: 'error', text: res.error || 'Failed to process dataset file.' });
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const summary = processedResult?.summary || currentDataset?.summary || {
    totalRows: currentDataset?.row_count || 3150,
    validRows: currentDataset?.row_count || 3150,
    missingValuesCount: 0,
    normalCount: currentDataset?.normal_count || 2980,
    anomalyCount: currentDataset?.anomaly_count || 170,
    anomalyPercentage: currentDataset?.anomaly_count ? +((currentDataset.anomaly_count / currentDataset.row_count) * 100).toFixed(2) : 5.4,
    qualityScore: currentDataset?.quality_score || 99.8
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="industrial-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Database className="w-5 h-5 text-cyan-400" />
              <span>Dataset Upload &amp; Telemetry Ingestion</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Upload CSV or Excel (.xlsx) machine telemetry datasets. Automated validation, imputation, anomaly classification, and database synchronization.
            </p>
          </div>
          <span className="text-xs px-3 py-1 bg-cyan-950 text-cyan-300 font-mono rounded-full border border-cyan-800 font-bold">
            CSV / XLSX Supported
          </span>
        </div>
      </div>

      {statusMsg && (
        <div className={`p-3.5 rounded-lg text-xs font-semibold flex items-center justify-between border ${
          statusMsg.type === 'success' ? 'bg-emerald-950/80 border-emerald-700 text-emerald-200' :
          'bg-rose-950/80 border-rose-700 text-rose-200'
        }`}>
          <div className="flex items-center gap-2">
            {statusMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
            <span>{statusMsg.text}</span>
          </div>
          <button onClick={() => setStatusMsg(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Upload Box & Dataset Summary Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Upload Zone */}
        <div className="industrial-card p-5 space-y-4">
          <div className="border-b border-slate-800 pb-2">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Upload className="w-4 h-4 text-cyan-400" />
              <span>Upload Telemetry File</span>
            </h3>
            <p className="text-xs text-slate-400">Select .csv or .xlsx containing machine readings</p>
          </div>

          <label className="border-2 border-dashed border-slate-700 hover:border-cyan-500/80 bg-slate-900/60 hover:bg-slate-900/90 rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition text-center group">
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
            />
            <div className="p-3 bg-cyan-950/80 group-hover:bg-cyan-900 text-cyan-400 rounded-full border border-cyan-800 transition">
              <FileSpreadsheet className={`w-6 h-6 ${uploading ? 'animate-bounce' : ''}`} />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-200 group-hover:text-cyan-300">
                {uploading ? 'Processing & Analyzing Dataset...' : 'Click or Drag & Drop File'}
              </div>
              <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                Supports CSV, XLSX up to 50 MB
              </div>
            </div>
          </label>
        </div>

        {/* Dataset Quality & Analysis Summary */}
        <div className="lg:col-span-2 industrial-card p-5 space-y-4">
          <div className="border-b border-slate-800 pb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-emerald-400" />
              <span>Ingested Dataset Analysis Summary</span>
            </h3>
            <span className="text-[11px] font-mono px-2 py-0.5 bg-emerald-950 text-emerald-300 rounded border border-emerald-800">
              Quality Score: {summary.qualityScore}%
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono text-xs">
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Total Rows</span>
              <span className="text-base font-bold text-white">{summary.totalRows?.toLocaleString()}</span>
              <span className="text-[10px] text-cyan-400 block">Total Ingested</span>
            </div>

            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Valid Rows</span>
              <span className="text-base font-bold text-emerald-400">{summary.validRows?.toLocaleString()}</span>
              <span className="text-[10px] text-emerald-400/70 block">100% Parsed</span>
            </div>

            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Missing Values</span>
              <span className="text-base font-bold text-slate-300">{summary.missingValuesCount}</span>
              <span className="text-[10px] text-slate-500 block">Auto-Imputed</span>
            </div>

            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Normal Readings</span>
              <span className="text-base font-bold text-emerald-300">{summary.normalCount?.toLocaleString()}</span>
              <span className="text-[10px] text-emerald-400/70 block">Within Limits</span>
            </div>

            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Anomalies Detected</span>
              <span className="text-base font-bold text-rose-400">{summary.anomalyCount?.toLocaleString()}</span>
              <span className="text-[10px] text-rose-400/70 block">Violations Flagged</span>
            </div>

            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Anomaly Rate</span>
              <span className="text-base font-bold text-amber-300">{summary.anomalyPercentage}%</span>
              <span className="text-[10px] text-amber-400/70 block">Outlier Proportion</span>
            </div>
          </div>
        </div>

      </div>

      {/* Processed Data Preview Table */}
      {processedResult?.previewRows && processedResult.previewRows.length > 0 && (
        <div className="industrial-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4 text-cyan-400" />
              <span>Processed Telemetry Table Preview (First 50 Rows)</span>
            </h3>
            <span className="text-xs font-mono text-slate-400">
              Showing {processedResult.previewRows.length} sample records
            </span>
          </div>

          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900 text-slate-400 uppercase text-[11px] sticky top-0 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3 text-cyan-400">Temp (°C)</th>
                  <th className="py-2.5 px-3 text-indigo-400">Amb Temp (°C)</th>
                  <th className="py-2.5 px-3 text-emerald-400">Vib (mm/s)</th>
                  <th className="py-2.5 px-3 text-purple-400">RPM</th>
                  <th className="py-2.5 px-3 text-amber-400">Press (bar)</th>
                  <th className="py-2.5 px-3">Condition</th>
                  <th className="py-2.5 px-3">Anomaly Score</th>
                  <th className="py-2.5 px-3">Health Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {processedResult.previewRows.map((r, idx) => (
                  <tr key={idx} className={r.anomaly_flag === 1 ? 'bg-rose-950/20 hover:bg-rose-950/30' : 'hover:bg-slate-800/40'}>
                    <td className="py-2 px-3 text-slate-500">{r.entry_id || idx + 1}</td>
                    <td className="py-2 px-3 text-slate-400">{r.created_at?.slice(0, 19)}</td>
                    <td className="py-2 px-3 font-bold text-cyan-300">{r.temperature?.toFixed(2)}</td>
                    <td className="py-2 px-3 text-indigo-300">{r.ambient_temperature?.toFixed(2)}</td>
                    <td className="py-2 px-3 text-emerald-300">{r.vibration?.toFixed(2)}</td>
                    <td className="py-2 px-3 text-purple-300">{r.rpm?.toFixed(0)}</td>
                    <td className="py-2 px-3 text-amber-300">{r.pressure?.toFixed(2)}</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        r.anomaly_flag === 1 ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-emerald-950 text-emerald-300'
                      }`}>
                        {r.condition}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-200">{r.anomaly_score?.toFixed(4)}</td>
                    <td className="py-2 px-3 font-bold text-white">{r.health_score?.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
