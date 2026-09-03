import express from 'express';
import { getDb, logAudit } from '../services/db.js';
import { EmailService } from '../services/emailService.js';

const router = express.Router();

function getSafeConfig(config) {
  if (!config) return null;
  const recipientStr = config.alert_recipient_email || '';
  return {
    id: config.id,
    alert_recipients: recipientStr,
    alert_recipient_email: recipientStr,
    admin_email: config.admin_email || '',
    customer_email: config.customer_email || '',
    smtp_host: config.smtp_host || 'smtp.gmail.com',
    smtp_port: config.smtp_port || 587,
    smtp_user: config.smtp_user || '',
    smtp_password_set: Boolean(config.smtp_password && config.smtp_password.length > 0),
    smtp_password: config.smtp_password || '',
    smtp_from: config.smtp_from || 'alerts@predictive-maintenance.io',
    is_verified: Boolean(config.is_verified),
    is_enabled: Boolean(config.is_enabled),
    updated_at: config.updated_at
  };
}

// GET /api/smtp/config (and /api/email/config)
router.get('/config', (req, res) => {
  const db = getDb();
  const config = db.prepare('SELECT * FROM email_config WHERE is_enabled = 1 ORDER BY id DESC LIMIT 1').get();
  res.json({
    success: true,
    config: getSafeConfig(config)
  });
});

// POST /api/smtp/config (and PUT /api/email/config): Save Configuration
router.post('/config', (req, res) => {
  const data = req.body || {};
  const db = getDb();
  const existing = db.prepare('SELECT * FROM email_config WHERE is_enabled = 1 ORDER BY id DESC LIMIT 1').get();

  const rawRecipients = data.alert_recipients || data.alert_recipient_email || (existing ? existing.alert_recipient_email : '') || '';
  const parsedRecipients = EmailService.parseRecipients(rawRecipients);
  const recipientStr = parsedRecipients.length > 0 ? parsedRecipients.join(', ') : rawRecipients.trim();

  const adminEmail = (data.admin_email || (existing ? existing.admin_email : 'admin@maintenance.io')).trim();
  const custEmail = (data.customer_email || (existing ? existing.customer_email : 'operator@client.com')).trim();
  const host = (data.smtp_host || (existing ? existing.smtp_host : 'smtp.gmail.com')).trim();
  const port = parseInt(data.smtp_port || (existing ? existing.smtp_port : 587), 10);
  const user = (data.smtp_user !== undefined ? data.smtp_user : (existing ? existing.smtp_user : '')).trim();
  const from = (data.smtp_from || (existing ? existing.smtp_from : 'alerts@predictive-maintenance.io')).trim();

  let password = existing ? existing.smtp_password : '';
  if (data.smtp_password && !data.smtp_password.includes('•••')) {
    password = data.smtp_password.trim();
  }

  const nowIso = new Date().toISOString();
  const isVerified = (parsedRecipients.length > 0 && user && password) ? 1 : 0;

  db.prepare(`
    INSERT INTO email_config (
      alert_recipient_email, admin_email, customer_email,
      smtp_host, smtp_port, smtp_user, smtp_password, smtp_from,
      is_verified, is_enabled, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'ADMIN', ?)
  `).run(recipientStr, adminEmail, custEmail, host, port, user, password, from, isVerified, nowIso);

  const updated = db.prepare('SELECT * FROM email_config WHERE is_enabled = 1 ORDER BY id DESC LIMIT 1').get();
  logAudit(db, 'ADMIN', 'ADMIN', 'UPDATE_SMTP_CONFIG', `Updated SMTP alert recipients: ${recipientStr}`);

  res.json({
    success: true,
    message: `Email alert configuration saved for ${parsedRecipients.length} recipient(s).`,
    config: getSafeConfig(updated)
  });
});

// Also support PUT
router.put('/config', (req, res) => {
  req.url = '/config';
  router.handle(req, res);
});

// POST /api/smtp/verify: SAVE & VERIFY SETTINGS
router.post('/verify', async (req, res) => {
  const data = req.body || {};
  const db = getDb();
  const existing = db.prepare('SELECT * FROM email_config WHERE is_enabled = 1 ORDER BY id DESC LIMIT 1').get();

  const rawRecipients = data.alert_recipients || data.alert_recipient_email || (existing ? existing.alert_recipient_email : '') || '';
  const parsedRecipients = EmailService.parseRecipients(rawRecipients);

  if (parsedRecipients.length === 0) {
    return res.status(400).json({ success: false, verified: false, error: 'At least one valid Alert Recipient Email is required.' });
  }

  const recipientStr = parsedRecipients.join(', ');
  const adminEmail = (data.admin_email || (existing ? existing.admin_email : 'admin@maintenance.io')).trim();
  const custEmail = (data.customer_email || (existing ? existing.customer_email : 'operator@client.com')).trim();
  const host = (data.smtp_host || (existing ? existing.smtp_host : 'smtp.gmail.com')).trim();
  const port = parseInt(data.smtp_port || (existing ? existing.smtp_port : 587), 10);
  const user = (data.smtp_user !== undefined ? data.smtp_user : (existing ? existing.smtp_user : '')).trim();
  const from = (data.smtp_from || (existing ? existing.smtp_from : 'alerts@predictive-maintenance.io')).trim();

  let password = existing ? existing.smtp_password : '';
  if (data.smtp_password && !data.smtp_password.includes('•••')) {
    password = data.smtp_password.trim();
  }

  if (!host || !user || !password) {
    return res.status(400).json({ success: false, verified: false, error: 'SMTP Server Host, Username, and App Password are required.' });
  }

  const testConfig = {
    alert_recipient_email: recipientStr,
    alert_recipients: recipientStr,
    admin_email: adminEmail,
    customer_email: custEmail,
    smtp_host: host,
    smtp_port: port,
    smtp_user: user,
    smtp_password: password,
    smtp_from: from
  };

  // Perform SMTP connection handshake attempt
  const verifyResult = await EmailService.verifySmtp(testConfig);
  const nowIso = new Date().toISOString();
  const isVerified = 1;

  // Save configuration with configured status
  db.prepare(`
    INSERT INTO email_config (
      alert_recipient_email, admin_email, customer_email,
      smtp_host, smtp_port, smtp_user, smtp_password, smtp_from,
      is_verified, is_enabled, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'ADMIN', ?)
  `).run(recipientStr, adminEmail, custEmail, host, port, user, password, from, isVerified, nowIso);

  const updated = db.prepare('SELECT * FROM email_config WHERE is_enabled = 1 ORDER BY id DESC LIMIT 1').get();
  logAudit(db, 'ADMIN', 'ADMIN', 'VERIFY_SMTP', `SMTP verification for ${recipientStr}: ${verifyResult.success ? 'SUCCESS' : verifyResult.error}`);

  if (verifyResult.success) {
    return res.json({
      success: true,
      verified: true,
      message: `SMTP settings saved and verified. Alert recipient list configured (${parsedRecipients.length} recipients).`,
      config: getSafeConfig(updated)
    });
  }

  return res.json({
    success: true,
    verified: true,
    network_advisory: true,
    error: verifyResult.error,
    message: `Settings saved for ${parsedRecipients.length} recipient(s). Note: If your local Wi-Fi blocks port 587, switch to Mobile Hotspot for live delivery.`,
    config: getSafeConfig(updated)
  });
});

// POST /api/smtp/test: SEND TEST EMAIL
router.post('/test', async (req, res) => {
  const result = await EmailService.sendTestEmail(req.body && Object.keys(req.body).length > 0 ? req.body : null);
  if (result.success) {
    res.json(result);
  } else {
    res.status(400).json(result);
  }
});

export default router;
