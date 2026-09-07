import React, { useState } from 'react';
import {
  Activity,
  LayoutDashboard,
  Radio,
  BarChart3,
  AlertTriangle,
  HeartPulse,
  Cpu,
  Brain,
  Sliders,
  Users,
  Server,
  LogOut,
  User,
  Shield,
  Menu,
  X,
  Mail,
  Database,
  History,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLiveData } from '../context/LiveDataContext';
import { ThingSpeakStatus } from './ThingSpeakStatus';

export function Navbar({ activeTab, setActiveTab }) {
  const { user, isAdmin, isCustomer, logout, login } = useAuth();
  const { alertCounts } = useLiveData();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [switchingRole, setSwitchingRole] = useState(false);

  // Consolidated & prioritized navigation items
  const mainNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'email', label: 'Email Alerts (SMTP)', icon: Mail, highlight: true },
    { id: 'alerts', label: 'Alert History', icon: AlertTriangle, badge: alertCounts?.active || 0 },
    { id: 'dataset', label: 'Dataset Upload', icon: Database },
    { id: 'thresholds', label: 'Threshold Limits', icon: Sliders },
    { id: 'thingspeak', label: 'ThingSpeak IoT', icon: Radio },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'health', label: 'Machine Health', icon: HeartPulse },
    { id: 'models', label: 'ML Models', icon: Cpu, adminOnly: true },
    { id: 'shap', label: 'SHAP Explain', icon: Brain, adminOnly: true },
    { id: 'system', label: 'System Health', icon: Server, adminOnly: true },
    { id: 'users', label: 'Users', icon: Users, adminOnly: true }
  ];

  const visibleNav = isAdmin ? mainNavItems : mainNavItems.filter(i => !i.adminOnly);

  const handleQuickRoleSwitch = async (targetRole) => {
    try {
      setSwitchingRole(true);
      if (targetRole === 'admin') {
        await login('admin', 'Admin@12345');
      } else {
        await login('customer', 'Customer@12345');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSwitchingRole(false);
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm text-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 gap-3">
          
          {/* Brand Logo */}
          <div
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-3 cursor-pointer shrink-0"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base sm:text-lg tracking-tight text-slate-900 font-sans">
                  PREDICTIVE<span className="text-cyan-600">IQ</span>
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-700 font-mono border border-cyan-200 font-bold uppercase">
                  Industry 4.0
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-mono leading-none">Machine Predictive Maintenance</p>
            </div>
          </div>

          {/* Quick-Access Top Buttons (Always Visible) */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Direct Email Alerts Button */}
            <button
              onClick={() => setActiveTab('email')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm ${
                activeTab === 'email'
                  ? 'bg-cyan-600 text-white border border-cyan-700'
                  : 'bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border border-cyan-200'
              }`}
              title="Configure SMTP & 1-Anomaly Immediate Email Alerts"
            >
              <Mail className="w-3.5 h-3.5 text-cyan-700" />
              <span className="hidden sm:inline">EMAIL ALERTS &amp; SMTP</span>
              <span className="sm:hidden">EMAIL</span>
            </button>

            {/* Direct Dataset Upload Button */}
            <button
              onClick={() => setActiveTab('dataset')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeTab === 'dataset'
                  ? 'bg-emerald-600 text-white border border-emerald-700'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
              }`}
              title="Upload CSV / Excel Telemetry Dataset"
            >
              <Database className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">DATASET</span>
            </button>
          </div>

          {/* Right Header Controls (Role Switcher, Status Pill, User Menu) */}
          <div className="hidden md:flex items-center gap-2.5 shrink-0">
            {/* Role Demo Switcher */}
            <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
              <button
                disabled={switchingRole}
                onClick={() => handleQuickRoleSwitch('admin')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded font-bold transition ${
                  isAdmin ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Switch to Administrator Portal"
              >
                <Shield className="w-3 h-3" />
                <span>Admin</span>
              </button>
              <button
                disabled={switchingRole}
                onClick={() => handleQuickRoleSwitch('customer')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded font-bold transition ${
                  isCustomer ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Switch to Customer Dashboard"
              >
                <User className="w-3 h-3" />
                <span>Customer</span>
              </button>
            </div>

            {/* Genuine ThingSpeak status */}
            <ThingSpeakStatus compact />

            {/* User Profile & Logout */}
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200 text-xs">
              <div className="text-right">
                <div className="font-bold text-slate-800 leading-tight">{user.username}</div>
                <div className="text-[10px] text-slate-500 font-mono uppercase">{user.role}</div>
              </div>
              <button
                onClick={logout}
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mobile menu trigger */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
            >
              {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

        </div>

        {/* Horizontal Navigation Scroll Bar for all Tabs */}
        <div className="flex items-center space-x-1 py-1.5 overflow-x-auto no-scrollbar border-t border-slate-100">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition shrink-0 ${
                  isActive
                    ? 'bg-cyan-50 text-cyan-700 border border-cyan-300 font-bold shadow-xs'
                    : item.highlight
                      ? 'bg-cyan-50/60 text-cyan-800 hover:bg-cyan-100/80 border border-cyan-200'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-cyan-600' : 'text-slate-400'}`} />
                <span>{item.label}</span>
                {item.badge > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="md:hidden bg-white border-b border-slate-200 px-4 py-3 space-y-2 shadow-lg">
          <div className="grid grid-cols-2 gap-1.5">
            {visibleNav.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileOpen(false);
                  }}
                  className={`flex items-center gap-2 p-2 rounded-lg text-xs font-semibold text-left ${
                    isActive ? 'bg-cyan-50 text-cyan-700 border border-cyan-300 font-bold' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0 text-cyan-600" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
            <span className="font-mono text-slate-500">Logged as {user.username}</span>
            <button
              onClick={logout}
              className="text-rose-600 font-bold hover:underline"
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
