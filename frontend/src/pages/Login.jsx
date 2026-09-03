import React, { useState } from 'react';
import { Activity, ShieldCheck, User, Lock, AlertCircle, ArrowRight, CheckCircle2, Cpu, Radio, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('Admin@12345');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please enter username and password.');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await login(username, password);
    } catch (err) {
      setError(err.message || 'Login failed. Ensure the backend server is running.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = async (demoUser, demoPass) => {
    setUsername(demoUser);
    setPassword(demoPass);
    try {
      setLoading(true);
      setError(null);
      await login(demoUser, demoPass);
    } catch (err) {
      setError(err.message || 'Login failed. Ensure the backend server is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 sm:p-6 text-slate-800">
      <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        
        {/* Left Side: Industrial Overview */}
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/25">
              <Activity className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 font-sans">
                PREDICTIVE<span className="text-cyan-600">IQ</span>
              </h1>
              <p className="text-xs font-mono text-cyan-700 uppercase tracking-wider font-bold">
                Industry 4.0 Telemetry Platform
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 font-sans">
              Real-Time Machine Telemetry &amp; Anomaly Detection
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed font-sans">
              Industrial predictive maintenance platform integrated with live ThingSpeak IoT channels, dynamic IQR thresholds, 1-anomaly immediate critical alerting engine, and telemetry analytics.
            </p>
          </div>

          {/* Key Features List */}
          <div className="space-y-2.5 pt-2 font-sans">
            <div className="flex items-center gap-3 text-xs text-slate-700 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Multi-parameter telemetry (Temperature, Vibration, RPM, Pressure)</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-700 font-medium">
              <CheckCircle2 className="w-4 h-4 text-cyan-600 shrink-0" />
              <span>1-Anomaly immediate critical incident detection &amp; email alerts</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-700 font-medium">
              <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>Supervised (RF, XGB/HistGB, SVC) &amp; Unsupervised Isolation Forest</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-700 font-medium">
              <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
              <span>0-100 Machine Health Scoring &amp; SHAP explainability</span>
            </div>
          </div>
        </div>

        {/* Right Side: Login Card */}
        <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-xl border border-slate-200">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-slate-900 tracking-tight font-sans">System Sign In</h3>
            <p className="text-xs text-slate-500 mt-1 font-sans">Select your access role or enter credentials to continue</p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2 font-sans font-medium">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 font-sans">
                Username or Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin or customer"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-cyan-600 font-mono transition"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 font-sans">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-cyan-600 font-mono transition"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg text-sm transition-all duration-200 shadow-md shadow-cyan-600/20 flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
            >
              {loading ? (
                <span className="font-mono text-xs">Authenticating...</span>
              ) : (
                <>
                  <span>Authenticate &amp; Enter</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Logins Section */}
          <div className="mt-6 pt-5 border-t border-slate-200">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3 text-center font-sans">
              Quick One-Click Demo Access
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleQuickDemo('admin', 'Admin@12345')}
                className="p-2.5 rounded-lg bg-slate-50 hover:bg-cyan-50 border border-slate-200 hover:border-cyan-300 text-left transition group shadow-2xs"
              >
                <div className="flex items-center gap-1.5 text-cyan-700 font-bold text-xs">
                  <Shield className="w-3.5 h-3.5" />
                  <span>Admin Role</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Full System Access</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickDemo('customer', 'Customer@12345')}
                className="p-2.5 rounded-lg bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-left transition group shadow-2xs"
              >
                <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-xs">
                  <User className="w-3.5 h-3.5" />
                  <span>Customer Role</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Operator Monitoring</div>
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
