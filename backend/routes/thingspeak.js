import express from 'express';
import { getDb, logAudit } from '../services/db.js';
import { thingspeakService } from '../services/thingspeakService.js';

const router = express.Router();

// GET /api/thingspeak/config
router.get('/config', (req, res) => {
  const config = thingspeakService.getConfig();
  res.json({
    success: true,
    config
  });
});

// PUT /api/thingspeak/config
router.put('/config', (req, res) => {
  const data = req.body || {};
  const db = getDb();
  const nowIso = new Date().toISOString();

  const channelId = String(data.channel_id || '').trim();
  const readApiKey = String(data.read_api_key || '').trim();
  const writeApiKey = String(data.write_api_key || '').trim();
  const pollInterval = parseInt(data.poll_interval_sec || 30, 10);
  const freshnessLimit = parseInt(data.freshness_limit_sec || 120, 10);
  const dataSource = data.data_source || 'both';
  const isEnabled = data.is_enabled !== undefined ? (data.is_enabled ? 1 : 0) : 1;
  const fieldMapping = typeof data.field_mapping === 'object' ? JSON.stringify(data.field_mapping) : (data.field_mapping || '{}');

  db.prepare(`
    INSERT INTO thingspeak_config (
      channel_id, read_api_key, write_api_key, poll_interval_sec,
      freshness_limit_sec, data_source, field_mapping, is_enabled, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ADMIN', ?)
  `).run(channelId, readApiKey, writeApiKey, pollInterval, freshnessLimit, dataSource, fieldMapping, isEnabled, nowIso);

  if (isEnabled) {
    thingspeakService.startPolling();
  } else {
    thingspeakService.stopPolling();
  }

  logAudit(db, 'ADMIN', 'ADMIN', 'UPDATE_THINGSPEAK_CONFIG', `Updated ThingSpeak channel ${channelId}`);

  res.json({
    success: true,
    message: 'ThingSpeak configuration saved successfully.',
    config: thingspeakService.getConfig()
  });
});

// POST /api/thingspeak/test-connection
router.post('/test-connection', async (req, res) => {
  const { channel_id, read_api_key } = req.body || {};
  const result = await thingspeakService.testConnection(channel_id, read_api_key);
  if (result.success) {
    res.json(result);
  } else {
    res.status(400).json(result);
  }
});

// POST /api/thingspeak/refresh-now
router.post('/refresh-now', async (req, res) => {
  const result = await thingspeakService.fetchLatestFeeds(10);
  if (result.success) {
    res.json({ success: true, result });
  } else {
    res.status(400).json({ success: false, error: result.error });
  }
});

// POST /api/thingspeak/disconnect
router.post('/disconnect', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE thingspeak_config SET is_enabled = 0').run();
  thingspeakService.stopPolling();
  res.json({ success: true, message: 'ThingSpeak poller disconnected. Status: OFFLINE.' });
});

// GET /api/thingspeak/status
router.get('/status', (req, res) => {
  const status = thingspeakService.getConnectionStatus();
  res.json({
    success: true,
    ...status
  });
});

export default router;
