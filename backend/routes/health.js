import express from 'express';
import { getDb } from '../services/db.js';
import { HealthScoreEngine } from '../services/healthScoreEngine.js';
import { Config } from '../config.js';

const router = express.Router();

// GET /api/health
router.get('/', (req, res) => {
  const db = getDb();
  const latest = db.prepare('SELECT * FROM readings ORDER BY id DESC LIMIT 1').get();
  const thresholds = db.prepare('SELECT * FROM threshold_config WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get() || {};
  const recentAnomalies = db.prepare("SELECT count(*) as count FROM readings WHERE anomaly_flag = 1 AND id > (SELECT COALESCE(MAX(id), 0) - 50 FROM readings)").get().count;

  const healthResult = latest ? HealthScoreEngine.calculate(latest, thresholds, recentAnomalies) : { healthScore: 100.0, status: 'HEALTHY' };

  res.json({
    status: 'online',
    service: 'Predictive Maintenance Full-Stack API',
    machine: Config.MACHINE_NAME,
    machine_id: Config.MACHINE_ID,
    timestamp: new Date().toISOString(),
    health_score: healthResult.healthScore,
    machine_status: healthResult.status,
    database: 'CONNECTED',
    latest_reading: latest ? {
      temperature: latest.temperature,
      ambient_temperature: latest.ambient_temperature,
      vibration: latest.vibration,
      rpm: latest.rpm,
      pressure: latest.pressure,
      condition: latest.condition,
      anomaly_flag: latest.anomaly_flag,
      timestamp: latest.created_at
    } : null
  });
});

export default router;
