import React, { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid
} from 'recharts';
import {
  Cpu,
  CheckCircle2,
  Brain,
  Shield,
  Layers,
  Award,
  BarChart2,
  Info,
  RefreshCw
} from 'lucide-react';
import { api } from '../api/client';

export function ModelPerformance() {
  const [modelsData, setModelsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadModels = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getModels();
      if (res.success && Array.isArray(res.models) && res.models.length > 0) {
        setModelsData(res.models);
      } else {
        setError('No trained model evaluation metrics returned by backend.');
      }
    } catch (e) {
      console.error('Failed to load ML models:', e);
      setError(e.message || 'Failed to load ML model evaluation metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadModels();
  }, []);

  // Friendly display names map
  const modelNameMap = {
    'RandomForest': 'Random Forest',
    'XGBoost': 'XGBoost',
    'SVC': 'SVM / SVC',
    'IsolationForest': 'Isolation Forest'
  };

  // Format data for cross-model comparison chart
  const comparisonData = modelsData.map((m) => {
    const acc = Number(m.Accuracy ?? m.accuracy ?? 0);
    const prec = Number(m.Precision ?? m.precision ?? 0);
    const rec = Number(m.Recall ?? m.recall ?? 0);
    const f1 = Number(m.F1_Score ?? m.f1_score ?? m.F1 ?? 0);
    const roc = Number(m.ROC_AUC ?? m.roc_auc ?? 0);

    return {
      name: modelNameMap[m.Model] || m.Model || 'Model',
      rawModel: m.Model,
      Accuracy: parseFloat((acc <= 1.0 ? acc * 100 : acc).toFixed(2)),
      Precision: parseFloat((prec <= 1.0 ? prec * 100 : prec).toFixed(2)),
      Recall: parseFloat((rec <= 1.0 ? rec * 100 : rec).toFixed(2)),
      F1_Score: parseFloat((f1 <= 1.0 ? f1 * 100 : f1).toFixed(2)),
      ROC_AUC: parseFloat((roc <= 1.0 ? roc * 100 : roc).toFixed(2))
    };
  });

  if (loading) {
    return (
      <div className="industrial-card p-12 text-center text-slate-500 font-mono text-sm">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-cyan-600" />
        Loading trained ML model evaluation metrics (Random Forest, XGBoost, SVM/SVC, Isolation Forest)...
      </div>
    );
  }

  if (error && modelsData.length === 0) {
    return (
      <div className="industrial-card p-8 text-center space-y-3">
        <p className="text-rose-600 font-bold text-sm">{error}</p>
        <button
          onClick={loadModels}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-bold text-xs shadow-xs"
        >
          Retry Loading Models
        </button>
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
              <Cpu className="w-5 h-5 text-indigo-600" />
              <span>Machine Learning Model Performance &amp; Evaluation</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1 font-sans">
              Evaluation metrics derived from the validated hold-out test split (N=788 observations) across all 4 algorithms.
            </p>
          </div>
          <span className="text-xs px-3 py-1 bg-indigo-50 text-indigo-700 font-mono rounded-full border border-indigo-200 font-bold shadow-xs">
            4 Evaluated Algorithms
          </span>
        </div>
      </div>

      {/* 4 Model Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {modelsData.map((m) => {
          const acc = Number(m.Accuracy ?? 0);
          const prec = Number(m.Precision ?? 0);
          const rec = Number(m.Recall ?? 0);
          const f1 = Number(m.F1_Score ?? 0);
          const roc = Number(m.ROC_AUC ?? 0);
          const displayName = modelNameMap[m.Model] || m.Model;

          return (
            <div key={m.Model} className="industrial-card p-5 space-y-4 border-slate-200 hover:border-indigo-400 transition shadow-xs">
              <div className="flex items-start justify-between border-b border-slate-200 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900 tracking-tight">{displayName}</h3>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {m.Model === 'IsolationForest' ? 'Unsupervised Detector' : 'Supervised Classifier'}
                  </span>
                </div>
                <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
                  <Brain className="w-4 h-4" />
                </div>
              </div>

              <div className="space-y-2 font-mono text-xs">
                <div className="flex justify-between items-center text-slate-700">
                  <span className="text-slate-500 font-sans">Accuracy:</span>
                  <span className="font-bold text-emerald-600">{(acc <= 1.0 ? acc * 100 : acc).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between items-center text-slate-700">
                  <span className="text-slate-500 font-sans">Precision:</span>
                  <span className="font-bold text-cyan-600">{(prec <= 1.0 ? prec * 100 : prec).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between items-center text-slate-700">
                  <span className="text-slate-500 font-sans">Recall:</span>
                  <span className="font-bold text-indigo-600">{(rec <= 1.0 ? rec * 100 : rec).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between items-center text-slate-700">
                  <span className="text-slate-500 font-sans">F1 Score:</span>
                  <span className="font-bold text-amber-600">{(f1 <= 1.0 ? f1 * 100 : f1).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between items-center text-slate-700 pt-1 border-t border-slate-200">
                  <span className="text-slate-500 font-sans">ROC AUC:</span>
                  <span className="font-bold text-slate-900">{(roc <= 1.0 ? roc * 100 : roc).toFixed(2)}%</span>
                </div>
              </div>

              {/* Confusion Matrix Mini Grid */}
              <div className="pt-2">
                <div className="text-[10px] text-slate-500 font-mono mb-1.5 text-center font-sans">Test Split Confusion Matrix</div>
                <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono text-center">
                  <div className="p-1.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800">
                    <div className="text-[9px] text-emerald-600 font-sans">TN</div>
                    <strong>{m.True_Negative ?? 0}</strong>
                  </div>
                  <div className="p-1.5 rounded bg-rose-50 border border-rose-200 text-rose-800">
                    <div className="text-[9px] text-rose-600 font-sans">FP</div>
                    <strong>{m.False_Positive ?? 0}</strong>
                  </div>
                  <div className="p-1.5 rounded bg-amber-50 border border-amber-200 text-amber-800">
                    <div className="text-[9px] text-amber-600 font-sans">FN</div>
                    <strong>{m.False_Negative ?? 0}</strong>
                  </div>
                  <div className="p-1.5 rounded bg-cyan-50 border border-cyan-200 text-cyan-800">
                    <div className="text-[9px] text-cyan-600 font-sans">TP</div>
                    <strong>{m.True_Positive ?? 0}</strong>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Model Comparison Bar Chart */}
      <div className="industrial-card p-5">
        <div className="flex flex-wrap items-center justify-between mb-4 border-b border-slate-200 pb-3 gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Cross-Model Performance Metrics Comparison
            </h3>
            <p className="text-xs text-slate-500 font-sans">Comparing Accuracy, Precision, Recall, and F1 Score across all four algorithms</p>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 font-mono border border-slate-200 font-bold">
            Test Split (N=788)
          </span>
        </div>

        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={comparisonData} margin={{ top: 15, right: 25, left: -5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="name" stroke="#64748B" fontSize={12} tickLine={false} />
              <YAxis domain={[80, 100]} stroke="#64748B" fontSize={11} tickLine={false} unit="%" />
              <Tooltip
                contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#CBD5E1', borderRadius: '8px', fontSize: '11px', fontFamily: 'monospace', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                formatter={(value) => [`${value}%`]}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
              <Bar dataKey="Accuracy" name="Accuracy" fill="#10B981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Precision" name="Precision" fill="#06B6D4" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Recall" name="Recall" fill="#6366F1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="F1_Score" name="F1 Score" fill="#F59E0B" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Model Methodology & Architecture Notes */}
      <div className="industrial-card p-5 space-y-3">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5 font-sans">
          <Info className="w-4 h-4 text-cyan-600" />
          <span>Training Methodology &amp; Architecture Notes</span>
        </h4>
        <div className="text-xs text-slate-600 space-y-2 leading-relaxed font-sans">
          <p>
            &bull; <strong>Ensemble Architecture:</strong> Majority voting strategy across Random Forest, XGBoost, Support Vector Classifier (RBF kernel with standard scaling), and Isolation Forest. Anomaly is flagged when 2 or more models agree.
          </p>
          <p>
            &bull; <strong>Evaluation Split:</strong> Evaluated on strict hold-out test split (N=788) preserved from the original dataset without data leakage or post-hoc threshold tailoring.
          </p>
          <p>
            &bull; <strong>Isolation Forest:</strong> Fit unsupervised with 4.2% expected contamination to match realistic industrial minority fault distribution.
          </p>
        </div>
      </div>

    </div>
  );
}
