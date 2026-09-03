import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

const LiveDataContext = createContext(null);

export function LiveDataProvider({ children }) {
  const [latestReading, setLatestReading] = useState(null);
  const [thresholds, setThresholds] = useState(null);
  const [connection, setConnection] = useState({
    connected: false,
    status: 'OFFLINE',
    reason: 'ThingSpeak not connected',
    channelId: null,
    lastReading: null,
    lastSuccessfulFetch: null,
    lastReadingTimestamp: null,
    lastReadingAge: 'No data',
    lastReadingAgeSec: null,
    dataSource: 'dataset',
    totalProcessedReadings: 0,
    failedRequests: 0,
    lastEntryId: null,
    pollInterval: 30,
    freshnessLimit: 120,
    lastError: null,
  });
  const [alerts, setAlerts] = useState([]);
  const [alertCounts, setAlertCounts] = useState({ active: 0, acknowledged: 0, resolved: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [lastFetched, setLastFetched] = useState(null);
  const [refreshFeedback, setRefreshFeedback] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pollIntervalMs, setPollIntervalMs] = useState(15000);

  // Core telemetry fetch
  const fetchLiveTelemetry = useCallback(async () => {
    try {
      const [readingRes, alertsRes, tsStatusRes] = await Promise.all([
        api.getLatestReading().catch(() => ({ success: false })),
        api.getAlerts({ status: 'ACTIVE', limit: 10 }).catch(() => ({ alerts: [], counts: {} })),
        api.getThingspeakStatus().catch(() => ({ connected: false, status: 'OFFLINE', reason: 'Backend unreachable' }))
      ]);

      if (readingRes.success) {
        setLatestReading(readingRes.reading || null);
        if (readingRes.thresholds) setThresholds(readingRes.thresholds);
      }

      // Genuine ThingSpeak status from GET /api/thingspeak/status
      if (tsStatusRes) {
        const isConn = Boolean(tsStatusRes.connected && tsStatusRes.status === 'LIVE');
        setConnection(prev => ({
          ...prev,
          connected: isConn,
          status: isConn ? 'LIVE' : 'OFFLINE',
          reason: tsStatusRes.reason || (isConn ? 'Live Stream Active' : 'ThingSpeak not connected'),
          channelId: tsStatusRes.channelId || null,
          lastReading: tsStatusRes.lastReading || null,
          lastSuccessfulFetch: tsStatusRes.lastSuccessfulFetch || null,
          lastEntryId: tsStatusRes.lastEntryId || null,
          lastError: isConn ? null : (tsStatusRes.reason || tsStatusRes.lastError || 'ThingSpeak not connected')
        }));
      }

      if (alertsRes.alerts) {
        setAlerts(alertsRes.alerts);
        setAlertCounts(
          alertsRes.counts || {
            active: alertsRes.alerts.length,
            acknowledged: 0,
            resolved: 0,
            total: alertsRes.alerts.length,
          }
        );
      }

      setLastFetched(new Date());
    } catch (e) {
      console.warn('Live polling error:', e);
      setConnection(prev => ({ ...prev, connected: false, status: 'OFFLINE', reason: e.message, lastError: e.message }));
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll on mount and every 10 s
  useEffect(() => {
    fetchLiveTelemetry();
    const id = setInterval(fetchLiveTelemetry, 10000);
    return () => clearInterval(id);
  }, [fetchLiveTelemetry]);

  // Manual Refresh
  const manualRefresh = async () => {
    try {
      setIsRefreshing(true);
      const res = await api.refreshNow();
      await fetchLiveTelemetry();

      const msg = res.result?.message || 'Dashboard refreshed.';
      setRefreshFeedback({ type: 'success', text: msg });
    } catch (e) {
      setRefreshFeedback({ type: 'error', text: `Refresh failed: ${e.message}` });
    } finally {
      setIsRefreshing(false);
      setTimeout(() => setRefreshFeedback(null), 4000);
    }
  };

  // Derived machine status: 1 Anomaly = CRITICAL Alert Trigger
  let machineStatus = 'UNKNOWN';
  if (latestReading) {
    const cond = latestReading.machineStatus || latestReading.condition || latestReading.healthCondition;
    const isAnomaly = latestReading.anomaly_flag === 1;
    const active = alertCounts.active ?? 0;

    if (cond === 'CRITICAL' || cond === 'Critical' || isAnomaly || active > 0) {
      machineStatus = 'CRITICAL';
    } else if (cond === 'WARNING' || cond === 'Warning') {
      machineStatus = 'WARNING';
    } else {
      machineStatus = 'HEALTHY';
    }
  }

  // Connection status is strictly LIVE or OFFLINE
  const connStatus = connection.connected && connection.status === 'LIVE' ? 'LIVE' : 'OFFLINE';

  const acknowledgeAlert = async (alertId) => {
    try {
      await api.acknowledgeAlert(alertId);
      await fetchLiveTelemetry();
      return true;
    } catch (e) {
      console.error('Acknowledge failed:', e);
      throw e;
    }
  };

  return (
    <LiveDataContext.Provider
      value={{
        latestReading,
        thresholds,
        connection: { ...connection, status: connStatus },
        alerts,
        alertCounts,
        loading,
        lastFetched,
        machineStatus,
        refreshFeedback,
        isRefreshing,
        pollIntervalMs,
        setPollIntervalMs,
        manualRefresh,
        refreshTelemetry: fetchLiveTelemetry,
        acknowledgeAlert,
      }}
    >
      {children}
    </LiveDataContext.Provider>
  );
}

export function useLiveData() {
  const ctx = useContext(LiveDataContext);
  if (!ctx) throw new Error('useLiveData must be used inside <LiveDataProvider>');
  return ctx;
}
