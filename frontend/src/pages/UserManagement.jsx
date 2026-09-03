import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  User,
  CheckCircle2,
  AlertCircle,
  Lock,
  Mail,
  KeyRound
} from 'lucide-react';
import { api } from '../api/client';

export function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    role: 'customer',
    full_name: ''
  });
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await api.getUsers();
      if (res.success && res.users) {
        setUsers(res.users);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setStatusMsg(null);
      const res = await api.createUser(formData);
      if (res.success) {
        setStatusMsg({ type: 'success', text: res.message || 'User created successfully.' });
        setShowAddModal(false);
        setFormData({ username: '', email: '', password: '', role: 'customer', full_name: '' });
        await fetchUsers();
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
      setTimeout(() => setStatusMsg(null), 5000);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="industrial-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Users className="w-5 h-5 text-cyan-400" />
              <span>Role-Based User &amp; Operator Access Management</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Configure access roles for Plant Operators (Customer view) and Lead Maintenance Engineers (Admin full view).
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 rounded-lg text-xs font-bold transition shadow"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add New User</span>
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

      {/* Role Permissions Matrix Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="industrial-card p-5 border-cyan-500/30 space-y-3">
          <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
            <Shield className="w-4 h-4" />
            <span>Administrator (Maintenance Engineer)</span>
          </div>
          <ul className="text-xs text-slate-300 space-y-1.5 list-disc list-inside">
            <li>Full access to real-time &amp; historical telemetry</li>
            <li>Modify &amp; reset statistical warning/critical thresholds</li>
            <li>Inspect Scikit-Learn models, confusion matrices &amp; SHAP feature importance</li>
            <li>Manage, acknowledge &amp; resolve alert incidents with audit notes</li>
            <li>Send manual ThingSpeak test points &amp; inject test anomalies</li>
            <li>Manage users, credentials &amp; system diagnostic logs</li>
          </ul>
        </div>

        <div className="industrial-card p-5 border-emerald-500/30 space-y-3">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
            <User className="w-4 h-4" />
            <span>Customer (Plant Operator)</span>
          </div>
          <ul className="text-xs text-slate-300 space-y-1.5 list-disc list-inside">
            <li>Dedicated simplified monitoring dashboard</li>
            <li>Real-time Machine Status (Healthy / Warning / Critical)</li>
            <li>Machine Health Score gauge (0–100) and risk factors</li>
            <li>Interactive temperature graphs with normal bands</li>
            <li>View and acknowledge active machine alerts</li>
            <li>Cannot modify thresholds, ML models, or system settings</li>
          </ul>
        </div>
      </div>

      {/* Users Table */}
      <div className="industrial-card p-5">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3">
          Registered Platform Accounts
        </h3>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900/80 text-slate-400 uppercase text-[11px] border-b border-slate-800">
              <tr>
                <th className="py-3 px-3">User ID</th>
                <th className="py-3 px-3">Full Name</th>
                <th className="py-3 px-3">Username</th>
                <th className="py-3 px-3">Email Address</th>
                <th className="py-3 px-3">Role</th>
                <th className="py-3 px-3">Created Date</th>
                <th className="py-3 px-3 text-right">Last Login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 font-mono">
                    Loading users list...
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-2.5 px-3 font-bold text-cyan-400">#{u.id}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-100 font-sans">{u.full_name}</td>
                    <td className="py-2.5 px-3 text-slate-300">{u.username}</td>
                    <td className="py-2.5 px-3 text-slate-400">{u.email}</td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                        u.role === 'admin' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">{u.created_at?.split('T')[0] || u.created_at}</td>
                    <td className="py-2.5 px-3 text-right text-slate-400">{u.last_login ? u.last_login.split('T')[0] : 'Never'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="industrial-card max-w-md w-full p-6 space-y-4 border-slate-700">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-cyan-400" />
                <h4 className="text-sm font-bold text-white font-mono">Create New Platform User</h4>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Full Name:</label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData(p => ({ ...p, full_name: e.target.value }))}
                  placeholder="e.g. Alex Henderson"
                  className="w-full p-2 bg-slate-900 border border-slate-700 rounded text-slate-100 focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Username:</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData(p => ({ ...p, username: e.target.value }))}
                  placeholder="e.g. alex_engineer"
                  className="w-full p-2 bg-slate-900 border border-slate-700 rounded text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Email Address:</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))}
                  placeholder="e.g. alex@facility.com"
                  className="w-full p-2 bg-slate-900 border border-slate-700 rounded text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Password:</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData(p => ({ ...p, password: e.target.value }))}
                  placeholder="••••••••"
                  className="w-full p-2 bg-slate-900 border border-slate-700 rounded text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Role Permission:</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData(p => ({ ...p, role: e.target.value }))}
                  className="w-full p-2 bg-slate-900 border border-slate-700 rounded text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
                >
                  <option value="customer">Customer (Operator - Read &amp; Acknowledge only)</option>
                  <option value="admin">Admin (Engineer - Full Configuration &amp; ML)</option>
                </select>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold rounded"
                >
                  {saving ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
