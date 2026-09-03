import express from 'express';
import { getDb, logSystemEvent } from '../services/db.js';
import { AnomalyEngine } from '../services/anomalyEngine.js';
import { HealthScoreEngine } from '../services/healthScoreEngine.js';
import { AlertEngine } from '../services/alertEngine.js';
import { EmailService } from '../services/emailService.js';
import { thingspeakService } from '../services/thingspeakService.js';
import { Config } from '../config.js';

const router = express.Router();

// GET /api/system/health
router.get('/health', (req, res) => {
  const db = getDb();
  const readingsCount = db.prepare('SELECT count(*) as count FROM readings').get().count;
  const alertsCount = db.prepare('SELECT count(*) as count FROM alerts').get().count;
  const emailConfig = db.prepare('SELECT is_verified, smtp_host, alert_recipient_email FROM email_config WHERE is_enabled = 1 ORDER BY id DESC LIMIT 1').get();

  res.json({
    success: true,
    status: 'ONLINE',
    port: Config.PORT,
    machine_id: Config.MACHINE_ID,
    uptime_seconds: Math.floor(process.uptime()),
    database: {
      status: 'HEALTHY',
      total_readings: readingsCount,
      total_alerts: alertsCount
    },
    thingspeak: thingspeakService.getConnectionStatus(),
    email: {
      configured: Boolean(emailConfig && emailConfig.is_verified),
      recipient: emailConfig?.alert_recipient_email || 'Not configured',
      smtp_host: emailConfig?.smtp_host || 'smtp.gmail.com'
    },
    memory_usage_mb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
    timestamp: new Date().toISOString()
  });
});

// GET /api/system/logs
router.get('/logs', (req, res) => {
  const db = getDb();
  const limit = Math.min(200, parseInt(req.query.limit || '50', 10));

  const systemLogs = db.prepare('SELECT * FROM system_logs ORDER BY id DESC LIMIT ?').all(limit);
  const emailLogs = db.prepare('SELECT * FROM email_logs ORDER BY id DESC LIMIT ?').all(limit);
  const auditLogs = db.prepare('SELECT * FROM audit_trail ORDER BY id DESC LIMIT ?').all(limit);

  res.json({
    success: true,
    system_logs: systemLogs,
    email_logs: emailLogs,
    audit_logs: auditLogs
  });
});

// POST /api/system/test-email (alias)
router.post('/test-email', async (req, res) => {
  const result = await EmailService.sendTestEmail();
  if (result.success) {
    res.json(result);
  } else {
    res.status(400).json(result);
  }
});

// POST /api/simulate-alert-demo: Test Anomaly Simulation
router.post('/simulate-alert-demo', async (req, res) => {
  const db = getDb();
  const thresholds = db.prepare('SELECT * FROM threshold_config WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get() || {};
  const nowIso = new Date().toISOString();

  // Create an anomalous reading (Temp: 68.5°C >> 55.0°C Critical, Vibration: 4.8 mm/s >> 4.5 mm/s)
  const testReading = {
    machine_id: Config.MACHINE_ID,
    entry_id: Math.floor(Date.now() / 1000) % 100000,
    created_at: nowIso,
    temperature: 68.50,
    ambient_temperature: 38.20,
    vibration: 4.85,
    rpm: 3450.0,
    pressure: 8.40,
    current: 24.5,
    voltage: 235.0,
    power: 5.75,
    is_live: 1,
    data_source: 'SIMULATED_TEST'
  };

  const anomalyResult = AnomalyEngine.analyze(testReading, thresholds);
  const healthResult = HealthScoreEngine.calculate(testReading, thresholds);

  testReading.condition = anomalyResult.condition;
  testReading.anomaly_flag = 1;
  testReading.anomaly_score = anomalyResult.anomalyScore;
  testReading.health_score = healthResult.healthScore;
  testReading.detection_method = 'Simulated Anomaly Injection';

  // Save reading
  db.prepare(`
    INSERT INTO readings (
      machine_id, entry_id, created_at, fetch_timestamp,
      temperature, ambient_temperature, vibration, rpm, pressure,
      current, voltage, power,
      condition, anomaly_flag, anomaly_score, health_score,
      detection_method, is_live, data_source, created_timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    testReading.machine_id, testReading.entry_id, testReading.created_at, nowIso,
    testReading.temperature, testReading.ambient_temperature, testReading.vibration,
    testReading.rpm, testReading.pressure, testReading.current, testReading.voltage, testReading.power,
    testReading.condition, testReading.anomaly_flag, testReading.anomaly_score, testReading.health_score,
    testReading.detection_method, 1, 'SIMULATED_TEST', Date.now() / 1000
  );

  // Immediately process 1 Anomaly -> Alert + Email
  const alertResult = await AlertEngine.processReading(testReading, anomalyResult, thresholds, healthResult);

  res.json({
    success: true,
    message: 'Simulated 1-anomaly test event injected. Critical alert created and email dispatch initiated.',
    reading: testReading,
    anomaly: anomalyResult,
    health: healthResult,
    alert: alertResult
  });
});

export default router;
