import express from 'express';
import { getDb } from '../services/db.js';
import { AnomalyEngine } from '../services/anomalyEngine.js';
import { HealthScoreEngine } from '../services/healthScoreEngine.js';
import { AlertEngine } from '../services/alertEngine.js';
import { thingspeakService } from '../services/thingspeakService.js';
import { Config } from '../config.js';

const router = express.Router();

// GET /api/readings/latest
router.get('/latest', (req, res) => {
  const db = getDb();
  
  // Prefer live reading if present, otherwise latest dataset reading
  let row = db.prepare('SELECT * FROM readings WHERE is_live = 1 ORDER BY id DESC LIMIT 1').get();
  if (!row) {
    row = db.prepare('SELECT * FROM readings ORDER BY id DESC LIMIT 1').get();
  }

  const threshRow = db.prepare('SELECT * FROM threshold_config WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get() || {};
  const recentAnomalies = db.prepare("SELECT count(*) as count FROM readings WHERE anomaly_flag = 1 AND id > (SELECT COALESCE(MAX(id), 0) - 50 FROM readings)").get().count;

  const connInfo = thingspeakService.getConnectionStatus();

  if (!row) {
    return res.json({
      success: true,
      reading: null,
      thresholds: threshRow,
      connection: connInfo,
      dataSource: 'both'
    });
  }

  const healthResult = HealthScoreEngine.calculate(row, threshRow, recentAnomalies);

  return res.json({
    success: true,
    reading: {
      ...row,
      healthScore: healthResult.healthScore,
      machineStatus: healthResult.status
    },
    thresholds: threshRow,
    connection: connInfo,
    dataSource: 'both'
  });
});

// GET /api/readings
router.get('/', (req, res) => {
  const db = getDb();
  const limit = Math.min(1000, parseInt(req.query.limit || '100', 10));
  const offset = parseInt(req.query.offset || '0', 10);
  const condition = req.query.condition;
  const isLive = req.query.is_live;

  let query = 'SELECT * FROM readings';
  const conditions = [];
  const params = [];

  if (condition) {
    conditions.push('condition = ?');
    params.push(condition);
  }
  if (isLive !== undefined) {
    conditions.push('is_live = ?');
    params.push(parseInt(isLive, 10));
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY id DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const readings = db.prepare(query).all(...params);
  const total = db.prepare('SELECT count(*) as count FROM readings').get().count;

  res.json({
    success: true,
    readings,
    total,
    limit,
    offset
  });
});

// GET /api/readings/chart
router.get('/chart', (req, res) => {
  const db = getDb();
  const range = Math.min(500, parseInt(req.query.range || '100', 10));

  const rows = db.prepare(`
    SELECT id, created_at, thingspeak_created_at, temperature, ambient_temperature,
           vibration, rpm, pressure, current, voltage, power,
           condition, anomaly_flag, anomaly_score, health_score
    FROM readings
    ORDER BY id DESC
    LIMIT ?
  `).all(range);

  // Return chronologically for charts (oldest to newest)
  const chartData = rows.reverse().map(r => ({
    id: r.id,
    timestamp: r.thingspeak_created_at || r.created_at,
    time: (r.thingspeak_created_at || r.created_at || '').slice(11, 19),
    temperature: r.temperature,
    ambient_temperature: r.ambient_temperature,
    vibration: r.vibration,
    rpm: r.rpm,
    pressure: r.pressure,
    current: r.current,
    voltage: r.voltage,
    power: r.power,
    condition: r.condition,
    isAnomaly: r.anomaly_flag === 1,
    anomaly_flag: r.anomaly_flag,
    anomaly_score: r.anomaly_score,
    health_score: r.health_score
  }));

  res.json({
    success: true,
    range,
    data: chartData
  });
});

// POST /api/readings: Ingest new reading
router.post('/', async (req, res) => {
  const data = req.body || {};
  const db = getDb();
  const thresholds = db.prepare('SELECT * FROM threshold_config WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get() || {};

  const reading = {
    machine_id: data.machine_id || Config.MACHINE_ID,
    entry_id: data.entry_id || null,
    created_at: data.created_at || data.timestamp || new Date().toISOString(),
    thingspeak_created_at: data.thingspeak_created_at || null,
    temperature: parseFloat(data.temperature ?? data.machine_temperature ?? 0) || 0,
    ambient_temperature: parseFloat(data.ambient_temperature ?? 0) || 0,
    vibration: parseFloat(data.vibration ?? 0) || 0,
    rpm: parseFloat(data.rpm ?? 0) || 0,
    pressure: parseFloat(data.pressure ?? 0) || 0,
    current: parseFloat(data.current ?? 0) || 0,
    voltage: parseFloat(data.voltage ?? 0) || 0,
    power: parseFloat(data.power ?? 0) || 0,
    is_live: data.is_live !== undefined ? (data.is_live ? 1 : 0) : 0,
    data_source: data.data_source || 'API_DIRECT'
  };

  // 1. Anomaly detection
  const anomalyResult = AnomalyEngine.analyze(reading, thresholds);
  
  // 2. Health scoring
  const healthResult = HealthScoreEngine.calculate(reading, thresholds);

  reading.condition = anomalyResult.condition;
  reading.anomaly_flag = anomalyResult.isAnomaly ? 1 : 0;
  reading.anomaly_score = anomalyResult.anomalyScore;
  reading.health_score = healthResult.healthScore;
  reading.detection_method = anomalyResult.detectionMethod;

  // 3. Save to database
  const insertResult = db.prepare(`
    INSERT INTO readings (
      machine_id, entry_id, created_at, thingspeak_created_at, fetch_timestamp,
      temperature, ambient_temperature, vibration, rpm, pressure,
      current, voltage, power,
      condition, anomaly_flag, anomaly_score, health_score,
      detection_method, is_live, data_source, created_timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    reading.machine_id, reading.entry_id, reading.created_at, reading.thingspeak_created_at,
    new Date().toISOString(), reading.temperature, reading.ambient_temperature,
    reading.vibration, reading.rpm, reading.pressure,
    reading.current, reading.voltage, reading.power,
    reading.condition, reading.anomaly_flag, reading.anomaly_score, reading.health_score,
    reading.detection_method, reading.is_live, reading.data_source, Date.now() / 1000
  );

  reading.id = insertResult.lastInsertRowid;

  // 4. CRITICAL ALERT FLOW: If ONE anomaly is detected -> Trigger immediate alert & email
  let alertResult = null;
  if (anomalyResult.isAnomaly) {
    alertResult = await AlertEngine.processReading(reading, anomalyResult, thresholds, healthResult);
  }

  res.status(201).json({
    success: true,
    reading,
    anomaly: anomalyResult,
    health: healthResult,
    alert: alertResult
  });
});

export default router;
