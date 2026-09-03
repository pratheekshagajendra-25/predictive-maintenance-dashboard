import express from 'express';
import crypto from 'crypto';
import { getDb, logAudit } from '../services/db.js';
import { EmailService } from '../services/emailService.js';
import { Config } from '../config.js';

const router = express.Router();

// GET /api/alerts
router.get('/', (req, res) => {
  const db = getDb();
  const limit = Math.min(500, parseInt(req.query.limit || '50', 10));
  const offset = parseInt(req.query.offset || '0', 10);
  const status = req.query.status;

  let query = 'SELECT * FROM alerts';
  const params = [];

  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }

  query += ' ORDER BY id DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const alerts = db.prepare(query).all(...params);
  const total = db.prepare('SELECT count(*) as count FROM alerts').get().count;
  const activeCount = db.prepare("SELECT count(*) as count FROM alerts WHERE status != 'RESOLVED'").get().count;
  const criticalCount = db.prepare("SELECT count(*) as count FROM alerts WHERE severity = 'CRITICAL' AND status != 'RESOLVED'").get().count;

  res.json({
    success: true,
    alerts,
    total,
    activeCount,
    criticalCount,
    limit,
    offset
  });
});

// POST /api/alerts: Manually create/trigger an alert
router.post('/', async (req, res) => {
  const data = req.body || {};
  const db = getDb();
  const nowIso = new Date().toISOString();

  const alertId = data.alert_id || `ALT-${nowIso.slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const machineId = data.machine_id || Config.MACHINE_ID;
  const severity = data.severity || 'CRITICAL';
  const parameter = data.parameter || 'Machine Temperature';
  const value = parseFloat(data.value ?? data.machine_temperature ?? 0) || 0;
  const triggerReason = data.trigger_reason || 'Manual anomaly alert triggered.';
  const recommendedAction = data.recommended_action || 'Inspect machine parameters and cooling subsystems.';

  const insertResult = db.prepare(`
    INSERT INTO alerts (
      alert_id, machine_id, timestamp, severity, parameter, value,
      machine_temperature, ambient_temperature, threshold_value,
      consecutive_count, health_score, anomaly_score, trigger_reason,
      recommended_action, status, email_sent, email_status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 'CRITICAL', 0, 'PENDING', ?)
  `).run(
    alertId, machineId, nowIso, severity, parameter, value,
    value, 30.0, 55.0,
    data.health_score || 35.0, data.anomaly_score || 0.9, triggerReason,
    recommendedAction, nowIso
  );

  let emailResult = { success: false, status: 'SKIPPED' };
  if (data.send_email !== false) {
    emailResult = await EmailService.sendCriticalAlertEmail({
      alert_id: alertId,
      machine_id: machineId,
      timestamp: nowIso,
      parameter,
      value,
      normal_range: data.normal_range || '34°C - 49°C',
      anomaly_score: data.anomaly_score || 0.9,
      health_score: data.health_score || 35.0,
      recommended_action: recommendedAction
    });

    db.prepare(`
      UPDATE alerts
      SET email_sent = ?, email_status = ?, email_recipient = ?
      WHERE alert_id = ?
    `).run(emailResult.success ? 1 : 0, emailResult.status || 'FAILED', emailResult.recipient || null, alertId);
  }

  logAudit(db, 'SYSTEM', 'SYSTEM', 'MANUAL_ALERT_CREATE', `Created alert ${alertId} (${severity})`);

  res.status(201).json({
    success: true,
    alert_id: alertId,
    emailResult
  });
});

// POST /api/alerts/:id/resend-email
router.post('/:id/resend-email', async (req, res) => {
  const { id } = req.params;
  const db = getDb();
  const alert = db.prepare('SELECT * FROM alerts WHERE alert_id = ? OR id = ?').get(id, id);
  if (!alert) {
    return res.status(404).json({ success: false, error: 'Alert not found.' });
  }

  const emailResult = await EmailService.sendCriticalAlertEmail(alert, {
    temperature: alert.machine_temperature || alert.value,
    ambient_temperature: alert.ambient_temperature || 30.0,
    anomaly_score: alert.anomaly_score || 0.95,
    health_score: alert.health_score || 25.0,
    data_source: alert.data_source || 'ALERT_RESEND'
  });

  const statusText = emailResult.success ? 'EMAIL SENT' : `EMAIL FAILED: ${emailResult.error?.slice(0, 80) || 'Error'}`;
  db.prepare(`
    UPDATE alerts
    SET email_sent = ?, email_status = ?, email_recipient = ?
    WHERE id = ?
  `).run(emailResult.success ? 1 : 0, statusText, emailResult.recipient || null, alert.id);

  res.json({
    success: emailResult.success,
    statusText,
    emailResult
  });
});

// POST /api/alerts/resend-all-failed
router.post('/resend-all-failed', async (req, res) => {
  const db = getDb();
  const failedAlerts = db.prepare("SELECT * FROM alerts WHERE email_sent = 0 OR email_status LIKE '%FAILED%' ORDER BY id DESC LIMIT 20").all();

  let sentCount = 0;
  let failCount = 0;

  for (const alert of failedAlerts) {
    const emailResult = await EmailService.sendCriticalAlertEmail(alert, {
      temperature: alert.machine_temperature || alert.value,
      ambient_temperature: alert.ambient_temperature || 30.0,
      anomaly_score: alert.anomaly_score || 0.95,
      health_score: alert.health_score || 25.0,
      data_source: alert.data_source || 'ALERT_RESEND'
    });

    const statusText = emailResult.success ? 'EMAIL SENT' : `EMAIL FAILED: ${emailResult.error?.slice(0, 80) || 'Error'}`;
    db.prepare(`
      UPDATE alerts
      SET email_sent = ?, email_status = ?, email_recipient = ?
      WHERE id = ?
    `).run(emailResult.success ? 1 : 0, statusText, emailResult.recipient || null, alert.id);

    if (emailResult.success) sentCount++;
    else failCount++;
  }

  res.json({
    success: sentCount > 0,
    totalAttempted: failedAlerts.length,
    sentCount,
    failCount,
    message: `Attempted to resend ${failedAlerts.length} alerts. ${sentCount} sent successfully.`
  });
});

// POST /api/alerts/:id/acknowledge
router.post('/:id/acknowledge', (req, res) => {
  const { id } = req.params;
  const db = getDb();
  const nowIso = new Date().toISOString();
  const username = req.body?.username || 'Operator';

  const result = db.prepare(`
    UPDATE alerts
    SET status = 'ACKNOWLEDGED', acknowledged_by = ?, acknowledged_at = ?
    WHERE alert_id = ? OR id = ?
  `).run(username, nowIso, id, id);

  if (result.changes > 0) {
    logAudit(db, username, 'OPERATOR', 'ACKNOWLEDGE_ALERT', `Acknowledged alert ${id}`);
    res.json({ success: true, message: `Alert ${id} acknowledged.` });
  } else {
    res.status(404).json({ success: false, error: 'Alert not found.' });
  }
});

// POST /api/alerts/:id/resolve
router.post('/:id/resolve', (req, res) => {
  const { id } = req.params;
  const db = getDb();
  const nowIso = new Date().toISOString();
  const username = req.body?.username || 'Engineer';
  const notes = req.body?.notes || 'Resolved and verified normal operating state.';

  const result = db.prepare(`
    UPDATE alerts
    SET status = 'RESOLVED', resolved_by = ?, resolved_at = ?, resolution_notes = ?
    WHERE alert_id = ? OR id = ?
  `).run(username, nowIso, notes, id, id);

  if (result.changes > 0) {
    logAudit(db, username, 'ENGINEER', 'RESOLVE_ALERT', `Resolved alert ${id}: ${notes}`);
    res.json({ success: true, message: `Alert ${id} resolved successfully.` });
  } else {
    res.status(404).json({ success: false, error: 'Alert not found.' });
  }
});

export default router;
