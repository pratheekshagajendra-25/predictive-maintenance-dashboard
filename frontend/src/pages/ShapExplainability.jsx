import React, { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell
} from 'recharts';
import {
  Brain,
  Sparkles,
  Sliders,
  HelpCircle,
  TrendingUp,
  Layers,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { api } from '../api/client';

export function ShapExplainability() {
  const [featureImportance, setFeatureImportance] = useState([]);
  const [loading, setLoading] = useState(true);

  // Interactive Live Explainer State
  const [testTemp, setTestTemp] = useState(56.5);
  const [testAmbient, setTestAmbient] = useState(37.0);
  const [liveExplanation, setLiveExplanation] = useState(null);
  const [explaining, setExplaining] = useState(false);

  useEffect(() => {
    async function loadShap() {
      try {
        setLoading(true);
        const res = await api.getShap();
        if (res.success && Array.isArray(res.feature_importance)) {
          setFeatureImportance(res.feature_importance);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadShap();
    handleLiveExplain(56.5, 37.0);
  }, []);

  const handleLiveExplain = async (t, a) => {
    try {
      setExplaining(true);
      const res = await api.explainReading(t, a);
      if (res.success && res.prediction) {
        setLiveExplanation(res.prediction);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setExplaining(false);
    }
  };

  const chartData = featureImportance.map(d => {
    const rawName = d.feature || d.Feature || 'Feature';
    const val = Number(d.importance || d.RandomForest_Importance || d.mean_shap || 0);
    return {
      feature: rawName.replace(/_/g, ' '),
      rawFeature: rawName,
      importance: parseFloat((val <= 1.0 ? val * 100 : val).toFixed(2))
    };
  }).sort((a, b) => b.importance - a.importance).slice(0, 8);

  if (loading) {
    return (
      <div className="industrial-card p-12 text-center text-slate-500 font-mono text-sm">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-cyan-600" />
        Loading SHAP feature attribution weights &amp; feature importance...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="industrial-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Brain className="w-5 h-5 text-cyan-600" />
              <span>SHAP Feature Explainability &amp; Root-Cause Diagnostics</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1 font-sans">
              Transparent feature contribution weights explaining how individual variables drive normal vs anomaly classifications.
            </p>
          </div>
          <span className="text-xs px-3 py-1 bg-cyan-50 text-cyan-700 font-mono rounded-full border border-cyan-200 font-bold shadow-xs">
            Row-Level Additive Contributions
          </span>
        </div>
      </div>

      {/* Main Grid: Global Feature Importance Chart & Interactive Explainer */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Global SHAP Feature Importance Chart */}
        <div className="industrial-card p-5">
          <div className="flex items-center justify-between mb-4 border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Top Features Influencing Machine Condition
              </h3>
              <p className="text-xs text-slate-500 font-sans">Random Forest &amp; SHAP importance weighting (%)</p>
            </div>
            <span className="text-xs px-2.5 py-0.5 rounded-md bg-slate-100 text-cyan-800 font-mono border border-slate-200 font-bold">
              Global Weights
            </span>
          </div>

          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 10, right: 30, left: 40, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                <XAxis type="number" stroke="#64748B" fontSize={11} tickLine={false} unit="%" />
                <YAxis dataKey="feature" type="category" stroke="#475569" fontSize={11} tickLine={false} width={130} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#CBD5E1', borderRadius: '8px', fontSize: '11px', fontFamily: 'monospace', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value) => [`${value}%`, 'Importance Weight']}
                />
                <Bar dataKey="importance" fill="#06B6D4" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? '#0891B2' : index === 1 ? '#0284C7' : index === 2 ? '#4F46E5' : '#6366F1'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Interactive "Why Was This Reading Considered Abnormal?" Tool */}
        <div className="industrial-card p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-600" />
                <span>Interactive Root-Cause Engine</span>
              </h3>
              <p className="text-xs text-slate-500 font-sans">Evaluate any temperature point &amp; inspect model reason</p>
            </div>
            <span className="text-xs px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-800 font-mono font-bold border border-amber-200">
              Live Inspector
            </span>
          </div>

          {/* Controls */}
          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div>
              <label className="block text-slate-600 mb-1 font-sans font-semibold">Machine Temp (°C):</label>
              <input
                type="number"
                step="0.1"
                value={testTemp}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  setTestTemp(val);
                  handleLiveExplain(val, testAmbient);
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-cyan-600"
              />
            </div>
            <div>
              <label className="block text-slate-600 mb-1 font-sans font-semibold">Ambient Temp (°C):</label>
              <input
                type="number"
                step="0.1"
                value={testAmbient}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  setTestAmbient(val);
                  handleLiveExplain(testTemp, val);
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-cyan-600"
              />
            </div>
          </div>

          {/* Live Outcome Box */}
          {liveExplanation && (
            <div className="space-y-3 pt-2">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {liveExplanation.isAnomaly ? (
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                    ) : (
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    )}
                    <span className="text-xs font-bold text-slate-900">
                      Condition: {liveExplanation.condition} ({liveExplanation.probability?.toFixed(1)}% Anomaly Risk)
                    </span>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-black uppercase ${
                    liveExplanation.isAnomaly ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}>
                    {liveExplanation.isAnomaly ? 'ABNORMAL' : 'NORMAL'}
                  </span>
                </div>

                <p className="text-xs text-slate-600 font-sans leading-relaxed border-t border-slate-200 pt-2">
                  <strong>Decision Engine:</strong> {liveExplanation.decisionMethod}
                </p>
              </div>

              {/* Feature contributions waterfall */}
              <div className="space-y-1.5 font-mono text-xs">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-sans">
                  Top Contributing Variables (Shapley Direction):
                </span>
                {liveExplanation.shap_values?.slice(0, 5).map((sc, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200 shadow-2xs">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-800 font-semibold">{sc.feature}:</span>
                      <span className="text-[11px] text-slate-500 font-mono">({sc.value})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 font-sans">{sc.impact}</span>
                      <span className={`font-bold ${sc.contribution > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {sc.contribution > 0 ? `+${sc.contribution.toFixed(3)}` : sc.contribution.toFixed(3)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Feature Importance Table */}
      <div className="industrial-card p-5">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3">
          Complete Feature Weights Breakdown
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-100 text-slate-700 uppercase text-[11px] border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">Feature Name</th>
                <th className="py-2.5 px-3 text-cyan-700">Random Forest Importance</th>
                <th className="py-2.5 px-3 text-indigo-700">Gradient Boosting Permutation</th>
                <th className="py-2.5 px-3 text-amber-700">Mean Abs SHAP Approx</th>
                <th className="py-2.5 px-3 text-slate-600 font-sans">Engineering Meaning</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {featureImportance.map((f, i) => {
                const fname = f.feature || f.Feature;
                const rfImp = Number(f.importance || f.RandomForest_Importance || 0);
                const gbImp = Number(f.gradient_boosting || f.GradientBoosting_Permutation_Importance || 0);
                const shapVal = Number(f.mean_shap || f.Mean_Abs_SHAP_Approx || 0);

                return (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-bold text-slate-900">{fname}</td>
                    <td className="py-2 px-3 text-cyan-700 font-bold">{(rfImp <= 1.0 ? rfImp * 100 : rfImp).toFixed(2)}%</td>
                    <td className="py-2 px-3 text-indigo-700">{(gbImp <= 1.0 ? gbImp * 100 : gbImp).toFixed(2)}%</td>
                    <td className="py-2 px-3 text-amber-700 font-bold">{shapVal.toFixed(5)}</td>
                    <td className="py-2 px-3 text-slate-500 text-[11px] font-sans">
                      {fname === 'Temperature' ? 'Primary Machine thermal condition' :
                       fname === 'Rolling_Std_10' ? 'Thermal volatility over 10-reading window' :
                       fname === 'Temperature_Difference' ? 'Thermal differential vs environment' :
                       fname === 'Deviation_From_Normal' ? 'Magnitude beyond learned 5-95% band' :
                       fname === 'Rate_Of_Change' ? 'Thermal ramp rate per reading' : 'Temporal cyclic feature'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
