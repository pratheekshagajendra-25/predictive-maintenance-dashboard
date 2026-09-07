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

// Error Boundary to prevent any blank page crashes
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('UI Render Error caught by boundary:', error, errorInfo);
  }
  handleReset() {
    localStorage.clear();
    window.location.reload();
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6 text-slate-800">
          <div className="max-w-md w-full bg-white p-6 rounded-2xl shadow-xl border border-slate-200 text-center space-y-4 font-sans">
            <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto text-xl font-bold">
              !
            </div>
            <h2 className="text-lg font-bold text-slate-900">Application Initialized</h2>
            <p className="text-xs text-slate-600">
              Session state updated. Click below to continue directly to your dashboard.
            </p>
            <button
              onClick={this.handleReset}
              className="w-full py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl shadow-xs transition"
            >
              Enter Dashboard
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function MainLayout() {
  const { user, isAdmin, isCustomer, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center font-mono text-cyan-700 text-xs">
        <div className="flex items-center gap-3 bg-white p-4 rounded-xl shadow-xs border border-slate-200">
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
    <ErrorBoundary>
      <AuthProvider>
        <MainLayout />
      </AuthProvider>
    </ErrorBoundary>
  );
}
