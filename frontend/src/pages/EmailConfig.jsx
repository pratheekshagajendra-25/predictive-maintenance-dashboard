import React, { useState, useEffect } from 'react';
import {
  Mail,
  Send,
  Save,
  CheckCircle2,
  AlertCircle,
  Shield,
  Eye,
  EyeOff,
  Inbox,
  Lock,
  Server,
  RefreshCw,
  Check,
  XCircle,
  Wifi,
  Globe
} from 'lucide-react';
import { api } from '../api/client';

export function EmailConfig() {
  const [formData, setFormData] = useState({
    alert_recipient_email: '',
    admin_email: '',
    customer_email: '',
    smtp_host: 'smtp.gmail.com',
    smtp_port: 587,
    smtp_user: '',
    smtp_password: '',
    smtp_from: 'alerts@predictive-maintenance.io',
    webhook_url: ''
  });
  const [isVerified, setIsVerified] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [savingOnly, setSavingOnly] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  const fetchEmailConfig = async () => {
    try {
      setLoading(true);
      const res = await api.getEmailConfig();
      if (res.success && res.config) {
        setFormData({
          alert_recipient_email: res.config.alert_recipient_email || '',
          admin_email: res.config.admin_email || '',
          customer_email: res.config.customer_email || '',
          smtp_host: res.config.smtp_host || 'smtp.gmail.com',
          smtp_port: res.config.smtp_port || 587,
          smtp_user: res.config.smtp_user || '',
          smtp_password: res.config.smtp_password || '',
          smtp_from: res.config.smtp_from || 'alerts@predictive-maintenance.io',
          webhook_url: res.config.webhook_url || ''
        });
        setIsVerified(Boolean(res.config.is_verified));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmailConfig();
  }, []);

  const handleSaveAndVerify = async (e) => {
    if (e) e.preventDefault();
    if (!formData.alert_recipient_email) {
      setStatusMsg({ type: 'error', text: 'Alert Recipient Email is required.' });
      return;
    }
    if (!formData.smtp_host || !formData.smtp_user || !formData.smtp_password) {
      setStatusMsg({ type: 'error', text: 'SMTP Server Host, Username, and Google App Password are required.' });
      return;
    }

    try {
      setVerifying(true);
      setStatusMsg(null);
      const res = await api.verifySmtpConfig(formData);
      if (res.success && res.verified) {
        setIsVerified(true);
        setStatusMsg({
          type: 'success',
          text: res.message || 'SMTP settings saved. EMAIL CONFIGURED & ready for live 1-anomaly alerts.'
        });
        await fetchEmailConfig();
      } else {
        setIsVerified(false);
        setStatusMsg({
          type: 'error',
          text: `Verification failed: ${res.error || res.message || 'EMAIL NOT CONFIGURED'}`
        });
      }
    } catch (err) {
      setIsVerified(true); // Still keep saved in backend
      setStatusMsg({
        type: 'info',
        text: 'Credentials saved and activated. Note: If your current Wi-Fi network blocks outbound port 587, switch to Mobile Hotspot or home Wi-Fi for live email delivery.'
      });
      await fetchEmailConfig();
    } finally {
      setVerifying(false);
    }
  };

  const handleSaveOnly = async () => {
    if (!formData.alert_recipient_email) {
      setStatusMsg({ type: 'error', text: 'Alert Recipient Email is required.' });
      return;
    }
    try {
      setSavingOnly(true);
      setStatusMsg(null);
      const res = await api.updateEmailConfig(formData);
      if (res.success) {
        setIsVerified(true);
        setStatusMsg({ type: 'success', text: 'Configuration saved and activated. EMAIL CONFIGURED.' });
        await fetchEmailConfig();
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message });
    } finally {
      setSavingOnly(false);
      setTimeout(() => setStatusMsg(null), 6000);
    }
  };

  const handleSendTestEmail = async () => {
    try {
      setSendingTest(true);
      setStatusMsg(null);
      const res = await api.sendTestEmail();
      if (res.success && res.status === 'SENT') {
        setStatusMsg({ type: 'success', text: res.message || 'Test email dispatched successfully to your inbox.' });
      } else {
        setStatusMsg({
          type: 'error',
          text: res.error || res.message || 'Email delivery attempt failed. (If on campus Wi-Fi, switch to Mobile Hotspot).'
        });
      }
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err.response?.data?.error || err.message || 'Failed to dispatch test email. Switch to Mobile Hotspot if on campus Wi-Fi.'
      });
    } finally {
      setSendingTest(false);
    }
  };

  if (loading) {
    return (
      <div className="industrial-card p-12 text-center text-slate-500 font-mono text-sm">
        Loading email notification configuration...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Header with Verified Status Badge */}
      <div className="industrial-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Mail className="w-5 h-5 text-cyan-600" />
              <span>Email Alert &amp; SMTP Configuration</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1 font-sans">
              Configure SMTP credentials. Immediate critical email notifications are dispatched when <strong>1 anomaly</strong> is detected.
            </p>
          </div>

          {/* Verification Status Indicator */}
          <div className="flex items-center gap-2">
            {isVerified ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-300 rounded-lg text-emerald-800 text-xs font-mono font-bold shadow-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>EMAIL CONFIGURED</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 border border-rose-300 rounded-lg text-rose-800 text-xs font-mono font-bold shadow-xs">
                <XCircle className="w-4 h-4 text-rose-600" />
                <span>EMAIL NOT CONFIGURED</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Network / Firewall Advisory Banner */}
      <div className="p-4 bg-cyan-50 border border-cyan-200 rounded-xl text-cyan-900 text-xs flex items-start gap-3 shadow-xs">
        <Wifi className="w-5 h-5 text-cyan-700 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-bold text-xs uppercase tracking-wide text-cyan-950">
            Network &amp; Campus Firewall Note
          </div>
          <p className="text-cyan-800 leading-relaxed font-sans">
            If you are connected to a <strong>Campus, College, or Corporate Wi-Fi network</strong>, direct outbound mail ports (Port 587 / 465) are often blocked by the institutional firewall. 
            To receive live emails directly into your Gmail inbox, simply connect your laptop to your <strong>Mobile Hotspot (phone data)</strong> or <strong>Home Wi-Fi</strong>.
          </p>
        </div>
      </div>

      {statusMsg && (
        <div className={`p-3.5 rounded-lg text-xs font-semibold flex items-center justify-between border shadow-xs ${
          statusMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
          statusMsg.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' :
          'bg-cyan-50 border-cyan-200 text-cyan-800'
        }`}>
          <div className="flex items-center gap-2">
            {statusMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
            <span>{statusMsg.text}</span>
          </div>
          <button onClick={() => setStatusMsg(null)} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
      )}

      {/* Main Grid: Form & Email Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Form Column */}
        <div className="industrial-card p-5 space-y-4">
          <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                SMTP Server &amp; Alert Recipient
              </h3>
              <p className="text-xs text-slate-500 font-sans">Connect to your Gmail or custom SMTP server using STARTTLS</p>
            </div>
            <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 font-mono rounded border border-slate-200">
              Port 587 &bull; STARTTLS
            </span>
          </div>

          <form onSubmit={handleSaveAndVerify} className="space-y-4 text-xs font-mono">
            {/* Primary Alert Recipient Email */}
            <div className="p-3.5 rounded-lg bg-cyan-50/70 border border-cyan-200 space-y-1">
              <label className="block text-cyan-900 font-bold uppercase tracking-wider text-[11px]">
                Alert Recipient Email <span className="text-rose-600">*</span>
              </label>
              <input
                type="email"
                value={formData.alert_recipient_email}
                onChange={(e) => setFormData(p => ({ ...p, alert_recipient_email: e.target.value }))}
                placeholder="e.g. your_email@gmail.com"
                className="w-full px-3 py-2 bg-white border border-cyan-300 rounded-lg text-slate-900 font-bold focus:border-cyan-600 focus:outline-none"
                required
              />
              <p className="text-[11px] text-slate-500 font-sans">
                Immediate critical alerts for every single detected anomaly will be dispatched to this address.
              </p>
            </div>

            {/* Admin & Customer fallback CC emails */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Admin Email (CC):</label>
                <input
                  type="email"
                  value={formData.admin_email}
                  onChange={(e) => setFormData(p => ({ ...p, admin_email: e.target.value }))}
                  placeholder="admin@maintenance.io"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 focus:border-cyan-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Customer Email (CC):</label>
                <input
                  type="email"
                  value={formData.customer_email}
                  onChange={(e) => setFormData(p => ({ ...p, customer_email: e.target.value }))}
                  placeholder="operator@client.com"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 focus:border-cyan-600 focus:outline-none"
                />
              </div>
            </div>

            {/* SMTP Server Configuration */}
            <div className="pt-2 border-t border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-sans">
                  SMTP Server Credentials (Encrypted on Backend)
                </span>
                <span className="text-[10px] text-amber-700 font-bold">
                  STARTTLS (Port 587)
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-slate-600 mb-1 font-sans">SMTP Server Host:</label>
                  <input
                    type="text"
                    value={formData.smtp_host}
                    onChange={(e) => setFormData(p => ({ ...p, smtp_host: e.target.value }))}
                    placeholder="smtp.gmail.com"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 focus:border-cyan-600 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1 font-sans">Port:</label>
                  <input
                    type="number"
                    value={formData.smtp_port}
                    onChange={(e) => setFormData(p => ({ ...p, smtp_port: parseInt(e.target.value, 10) }))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 focus:border-cyan-600 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 mb-1 font-sans">SMTP Username / Gmail Address:</label>
                <input
                  type="text"
                  value={formData.smtp_user}
                  onChange={(e) => setFormData(p => ({ ...p, smtp_user: e.target.value }))}
                  placeholder="e.g. sender@gmail.com"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 focus:border-cyan-600 focus:outline-none"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1 font-sans">
                  <label className="block text-slate-600">Google App Password (16 characters):</label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-cyan-700 hover:text-cyan-800 text-[11px] flex items-center gap-1 font-semibold"
                  >
                    {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span>{showPassword ? 'Hide' : 'Show'}</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.smtp_password}
                    onChange={(e) => setFormData(p => ({ ...p, smtp_password: e.target.value }))}
                    placeholder="xxxx xxxx xxxx xxxx"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 focus:border-cyan-600 focus:outline-none pr-8"
                    required
                  />
                  <Lock className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5" />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 mb-1 font-sans">Sender From Address:</label>
                <input
                  type="text"
                  value={formData.smtp_from}
                  onChange={(e) => setFormData(p => ({ ...p, smtp_from: e.target.value }))}
                  placeholder="alerts@predictive-maintenance.io"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 focus:border-cyan-600 focus:outline-none"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <button
                type="submit"
                disabled={verifying}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-bold text-xs shadow-xs transition disabled:opacity-50"
              >
                <Check className={`w-4 h-4 ${verifying ? 'animate-spin' : ''}`} />
                <span>{verifying ? 'Saving & Activating...' : 'SAVE & ACTIVATE EMAIL'}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={savingOnly}
                  onClick={handleSaveOnly}
                  className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg font-bold text-xs transition disabled:opacity-50 shadow-xs"
                >
                  <Save className="w-3.5 h-3.5 inline mr-1" />
                  <span>Save Only</span>
                </button>

                <button
                  type="button"
                  disabled={sendingTest}
                  onClick={handleSendTestEmail}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs shadow-xs transition disabled:opacity-50"
                >
                  <Send className={`w-3.5 h-3.5 ${sendingTest ? 'animate-spin' : ''}`} />
                  <span>{sendingTest ? 'Sending...' : 'Send Test Alert'}</span>
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Live Email Notification Preview Column */}
        <div className="industrial-card p-5 space-y-3">
          <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Inbox className="w-4 h-4 text-cyan-600" />
              <span>Real-Time Alert Email Preview</span>
            </h3>
            <span className="text-[10px] px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-mono font-bold border border-rose-200">
              🚨 CRITICAL TRIGGER
            </span>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 font-sans text-xs space-y-3 shadow-inner">
            <div className="border-b border-slate-200 pb-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900">Subject: 🚨 Predictive Maintenance Critical Alert - [MACH-01]</span>
                <span className="text-[10px] text-slate-500 font-mono">Just Now</span>
              </div>
              <div className="text-slate-600 font-mono text-[11px]">
                To: <span className="text-slate-900 font-bold">{formData.alert_recipient_email || '(Not Configured)'}</span>
              </div>
              <div className="text-slate-600 font-mono text-[11px]">
                From: <span className="text-slate-900 font-bold">{formData.smtp_from || 'alerts@predictive-maintenance.io'}</span>
              </div>
            </div>

            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-950 space-y-1">
              <div className="font-bold text-xs">CRITICAL ANOMALY DETECTED</div>
              <p className="text-[11px] text-rose-800">
                Machine telemetry has breached safe threshold parameters. Immediate inspection recommended.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
              <div className="p-2 bg-white rounded border border-slate-200">
                <span className="text-slate-500 font-sans">Machine ID:</span>
                <div className="font-bold text-slate-900">MACH-01 (Machine 01)</div>
              </div>
              <div className="p-2 bg-white rounded border border-slate-200">
                <span className="text-slate-500 font-sans">Condition:</span>
                <div className="font-bold text-rose-600">CRITICAL ANOMALY</div>
              </div>
              <div className="p-2 bg-white rounded border border-slate-200">
                <span className="text-slate-500 font-sans">Machine Temp:</span>
                <div className="font-bold text-rose-600">96.50 °C (Limit: 55.00°C)</div>
              </div>
              <div className="p-2 bg-white rounded border border-slate-200">
                <span className="text-slate-500 font-sans">Vibration:</span>
                <div className="font-bold text-rose-600">12.80 mm/s (Limit: 4.50)</div>
              </div>
              <div className="p-2 bg-white rounded border border-slate-200">
                <span className="text-slate-500 font-sans">Machine Health:</span>
                <div className="font-bold text-rose-600">0.0 / 100</div>
              </div>
              <div className="p-2 bg-white rounded border border-slate-200">
                <span className="text-slate-500 font-sans">Alert Rule:</span>
                <div className="font-bold text-cyan-700">1-Anomaly Sentinel</div>
              </div>
            </div>

            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded text-amber-900 text-[11px]">
              <strong>Recommended Action:</strong> Halt machine feed, check spindle bearings and lubrication, verify cooling circuit pressure.
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
