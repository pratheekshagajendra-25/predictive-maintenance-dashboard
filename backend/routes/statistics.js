import express from 'express';
import { getDb } from '../services/db.js';
import { HealthScoreEngine } from '../services/healthScoreEngine.js';

const router = express.Router();

// GET /api/statistics
router.get('/', (req, res) => {
  const db = getDb();
  
  const total = db.prepare('SELECT count(*) as count FROM readings').get().count;
  const anomalies = db.prepare('SELECT count(*) as count FROM readings WHERE anomaly_flag = 1').get().count;
  const normal = Math.max(0, total - anomalies);
  const anomalyRate = total > 0 ? +((anomalies / total) * 100).toFixed(2) : 0;

  const latest = db.prepare('SELECT * FROM readings ORDER BY id DESC LIMIT 1').get();
  
  const healthStats = db.prepare(`
    SELECT AVG(health_score) as avg_health, MIN(health_score) as min_health
    FROM readings
  `).get() || {};

  const avgHealthScore = total > 0 && healthStats.avg_health != null 
    ? +(healthStats.avg_health).toFixed(1) 
    : 100.0;

  let machineStatus = 'AWAITING DATA';
  if (total > 0) {
    if (avgHealthScore >= 85) machineStatus = 'HEALTHY';
    else if (avgHealthScore >= 70) machineStatus = 'GOOD';
    else if (avgHealthScore >= 50) machineStatus = 'WARNING';
    else machineStatus = 'CRITICAL';
  }

  const totalAlerts = db.prepare("SELECT count(*) as count FROM alerts").get().count;
  const activeAlerts = db.prepare("SELECT count(*) as count FROM alerts WHERE status != 'RESOLVED'").get().count;
  const criticalAlerts = db.prepare("SELECT count(*) as count FROM alerts WHERE severity = 'CRITICAL'").get().count;

  const emailsSent = db.prepare("SELECT count(*) as count FROM alerts WHERE email_status = 'EMAIL SENT' OR email_sent = 1").get().count;
  const emailsFailed = db.prepare("SELECT count(*) as count FROM alerts WHERE email_status LIKE 'EMAIL FAILED%' OR email_status = 'FAILED'").get().count;

  const tempStats = db.prepare(`
    SELECT AVG(temperature) as avg_temp, MIN(temperature) as min_temp, MAX(temperature) as max_temp,
           AVG(vibration) as avg_vib, MAX(vibration) as max_vib,
           AVG(rpm) as avg_rpm, MAX(rpm) as max_rpm,
           AVG(pressure) as avg_press, MAX(pressure) as max_press
    FROM readings
  `).get() || {};

  // Latest uploaded dataset
  const latestDatasetRow = db.prepare('SELECT * FROM uploaded_datasets WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get();
  let latestDataset = null;
  if (latestDatasetRow) {
    let summary = {};
    try {
      summary = JSON.parse(latestDatasetRow.validation_summary || '{}');
    } catch {}
    latestDataset = {
      id: latestDatasetRow.id,
      filename: latestDatasetRow.filename,
      row_count: latestDatasetRow.row_count,
      quality_score: latestDatasetRow.quality_score,
      normal_count: latestDatasetRow.normal_count,
      anomaly_count: latestDatasetRow.anomaly_count,
      anomaly_rate: latestDatasetRow.row_count > 0 ? +((latestDatasetRow.anomaly_count / latestDatasetRow.row_count) * 100).toFixed(2) : 0,
      uploaded_at: latestDatasetRow.uploaded_at,
      avg_health_score: avgHealthScore,
      summary
    };
  }

  res.json({
    success: true,
    statistics: {
      total_observations: total,
      total_samples: total,
      normal_observations: normal,
      normal_count: normal,
      anomaly_observations: anomalies,
      anomaly_count: anomalies,
      anomaly_percentage: anomalyRate,
      anomaly_rate: anomalyRate,
      health_score: total > 0 ? avgHealthScore : 100.0,
      machine_status: machineStatus,
      total_alerts_count: totalAlerts,
      active_alerts_count: activeAlerts,
      critical_alerts_count: criticalAlerts,
      critical_alerts: criticalAlerts,
      emails_sent: emailsSent,
      emails_failed: emailsFailed,
      alert_status: criticalAlerts > 0 ? 'CRITICAL' : (activeAlerts > 0 ? 'WARNING' : 'NORMAL'),
      temperature: {
        current: latest?.temperature ?? null,
        average: total > 0 ? +(tempStats.avg_temp || 0).toFixed(2) : null,
        min: total > 0 ? +(tempStats.min_temp || 0).toFixed(2) : null,
        max: total > 0 ? +(tempStats.max_temp || 0).toFixed(2) : null
      },
      vibration: {
        current: latest?.vibration ?? null,
        average: total > 0 ? +(tempStats.avg_vib || 0).toFixed(2) : null,
        max: total > 0 ? +(tempStats.max_vib || 0).toFixed(2) : null
      },
      rpm: {
        current: latest?.rpm ?? null,
        average: total > 0 ? Math.round(tempStats.avg_rpm || 0) : null,
        max: total > 0 ? Math.round(tempStats.max_rpm || 0) : null
      },
      pressure: {
        current: latest?.pressure ?? null,
        average: total > 0 ? +(tempStats.avg_press || 0).toFixed(2) : null,
        max: total > 0 ? +(tempStats.max_press || 0).toFixed(2) : null
      },
      latest_reading: latest || null,
      latest_dataset: latestDataset
    }
  });
});

export default router;
