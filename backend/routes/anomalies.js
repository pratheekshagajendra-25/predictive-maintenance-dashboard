import express from 'express';
import { getDb } from '../services/db.js';
import { AnomalyEngine } from '../services/anomalyEngine.js';

const router = express.Router();

// GET /api/anomalies
router.get('/', (req, res) => {
  const db = getDb();
  const limit = Math.min(500, parseInt(req.query.limit || '50', 10));
  const offset = parseInt(req.query.offset || '0', 10);

  const anomalies = db.prepare(`
    SELECT * FROM readings
    WHERE anomaly_flag = 1
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);

  const total = db.prepare('SELECT count(*) as count FROM readings WHERE anomaly_flag = 1').get().count;

  res.json({
    success: true,
    anomalies,
    total,
    limit,
    offset
  });
});

// POST /api/anomalies: Analyze on demand
router.post('/', (req, res) => {
  const reading = req.body || {};
  const db = getDb();
  const thresholds = db.prepare('SELECT * FROM threshold_config WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get() || {};

  const analysis = AnomalyEngine.analyze(reading, thresholds);
  res.json({
    success: true,
    analysis
  });
});

export default router;
