import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LiveDataProvider } from './context/LiveDataContext';
import { Navbar } from './components/Navbar';
import { AlertNotificationBanner } from './components/AlertNotificationBanner';
import { Login } from './pages/Login';
import { CustomerDashboard } from './pages/CustomerDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { Analytics } from './pages/Analytics';
import { AnomalyAnalysis } from './pages/AnomalyAnalysis';
import { ModelPerformance } from './pages/ModelPerformance';
import { ShapExplainability } from './pages/ShapExplainability';
import { ThresholdConfig } from './pages/ThresholdConfig';
import { AlertManagement } from './pages/AlertManagement';
import { UserManagement } from './pages/UserManagement';
import { SystemHealth } from './pages/SystemHealth';
import { ThingSpeakConfig } from './pages/ThingSpeakConfig';
import { EmailConfig } from './pages/EmailConfig';
import { DataManagement } from './pages/DataManagement';

function MainLayout() {
  const { user, isAdmin, isCustomer, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-mono text-cyan-600 text-sm">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-cyan-600 border-t-transparent rounded-full animate-spin" />
          <span>INITIALIZING MACHINE TELEMETRY ENGINE...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return isAdmin ? (
          <AdminDashboard onNavigate={setActiveTab} />
        ) : (
          <CustomerDashboard onNavigate={setActiveTab} />
        );
      case 'analytics':
        return isAdmin ? <Analytics /> : <CustomerDashboard onNavigate={setActiveTab} />;
      case 'anomalies':
        return isAdmin ? <AnomalyAnalysis /> : <CustomerDashboard onNavigate={setActiveTab} />;
      case 'alerts':
        return <AlertManagement />;
      case 'health':
        return <CustomerDashboard onNavigate={setActiveTab} />;
      case 'models':
        return isAdmin ? <ModelPerformance /> : <CustomerDashboard onNavigate={setActiveTab} />;
      case 'shap':
        return isAdmin ? <ShapExplainability /> : <CustomerDashboard onNavigate={setActiveTab} />;
      case 'thresholds':
        return <ThresholdConfig />;
      case 'thingspeak':
        return <ThingSpeakConfig />;
      case 'email':
        return <EmailConfig />;
      case 'dataset':
        return <DataManagement />;
      case 'users':
        return isAdmin ? <UserManagement /> : <CustomerDashboard onNavigate={setActiveTab} />;
      case 'system':
        return isAdmin ? <SystemHealth /> : <CustomerDashboard onNavigate={setActiveTab} />;
      default:
        return isAdmin ? (
          <AdminDashboard onNavigate={setActiveTab} />
        ) : (
          <CustomerDashboard onNavigate={setActiveTab} />
        );
    }
  };

  return (
    <LiveDataProvider>
      <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col">
        {/* Real-time Top Alert Notification Banner */}
        <AlertNotificationBanner />

        {/* Navigation Bar */}
        <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* Main Content Area */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
          {renderContent()}
        </main>

        {/* Light Industrial Footer */}
        <footer className="bg-white border-t border-slate-200 py-4 px-4 sm:px-6 text-xs text-slate-500 font-mono shadow-sm">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-600" />
              <span>PredictiveIQ System &bull; Machine Predictive Maintenance Platform</span>
            </div>
            <div>Strict 1-Anomaly Trigger &bull; STARTTLS Port 587 SMTP Active</div>
          </div>
        </footer>
      </div>
    </LiveDataProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainLayout />
    </AuthProvider>
  );
}
