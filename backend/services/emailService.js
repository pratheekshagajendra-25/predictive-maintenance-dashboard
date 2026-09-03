import nodemailer from 'nodemailer';
import axios from 'axios';
import { getDb, logAudit } from './db.js';
import { Config } from '../config.js';

export class EmailService {
  /**
   * Creates a Nodemailer transporter with robust network timeout & TLS parameters.
   */
  static createTransporter(config) {
    const port = parseInt(config.smtp_port || 587, 10);
    const host = (config.smtp_host || 'smtp.gmail.com').trim();
    const user = (config.smtp_user || '').trim();
    const pass = (config.smtp_password || '').trim();
    const isPort465 = port === 465;

    return nodemailer.createTransport({
      host: host,
      port: port,
      secure: isPort465,
      auth: {
        user: user,
        pass: pass
      },
      tls: {
        rejectUnauthorized: false
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000
    });
  }

  /**
   * Sanitizes and explains sensitive error messages with actionable network diagnostics.
   */
  static sanitizeError(err) {
    if (!err) return 'Unknown email delivery error occurred.';
    const msg = err.message || String(err);
    if (msg.includes('535') || msg.includes('Authentication') || msg.includes('BadCredentials') || msg.includes('Invalid login')) {
      return 'SMTP authentication failed. Please verify your SMTP Username and 16-character Google App Password.';
    }
    if (msg.includes('Greeting never received') || msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT')) {
      return 'Campus/Network Firewall Block: Outbound mail port 587 is blocked by this local Wi-Fi router. Connect to Mobile Hotspot or use the HTTPS Webhook relay.';
    }
    if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND')) {
      return `SMTP connection failed: Unable to reach mail host on specified port.`;
    }
    if (msg.includes('STARTTLS') || msg.includes('TLS')) {
      return 'STARTTLS negotiation failed. Verify port security settings.';
    }
    return `Delivery Error: ${msg.replace(/(pass|password|auth|key)=([^\s&]+)/gi, '$1=******')}`;
  }

  /**
   * Records an email dispatch attempt in the database.
   */
  static logEmail(recipient, subject, severity, status, body, errorMessage = null) {
    try {
      const db = getDb();
      const nowIso = new Date().toISOString();
      db.prepare(`
        INSERT INTO email_logs (timestamp, recipient, subject, severity, status, email_body, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(nowIso, recipient, subject, severity, status, body ? body.slice(0, 500) : '', errorMessage);
    } catch (e) {
      console.error('[EMAIL SERVICE] Failed to write email log:', e.message);
    }
  }

  /**
   * Verifies SMTP connection or HTTPS Webhook handshake.
   */
  static async verifySmtp(config) {
    // 1. If HTTPS Webhook URL provided, verify via HTTP POST
    if (config.webhook_url && config.webhook_url.trim().startsWith('https://')) {
      try {
        const testPayload = {
          to: config.alert_recipient_email || 'test@maintenance.io',
          subject: 'Predictive Maintenance - Webhook Verification',
          html: '<p>Webhook Verification Ping</p>',
          text: 'Webhook Verification Ping',
          is_test: true
        };
        const resp = await axios.post(config.webhook_url.trim(), testPayload, { timeout: 10000 });
        if (resp.status >= 200 && resp.status < 300) {
          return { success: true, message: 'HTTPS Webhook relay verified successfully. Works across all firewalls.' };
        }
      } catch (err) {
        return { success: false, error: `Webhook error: ${err.message}` };
      }
    }

    // 2. Direct SMTP verification
    if (!config.smtp_host || !config.smtp_port) {
      return { success: false, error: 'SMTP configuration is incomplete. Host and port are required.' };
    }
    if (!config.smtp_user || !config.smtp_password) {
      return { success: false, error: 'SMTP configuration is incomplete. Username and App Password are required.' };
    }

    const transporter = this.createTransporter(config);
    try {
      await transporter.verify();
      return { success: true, message: 'SMTP connection and authentication verified successfully.' };
    } catch (err) {
      const safeError = this.sanitizeError(err);
      return { success: false, error: safeError };
    }
  }

  /**
   * Sends a standard test email.
   */
  static async sendTestEmail(configOverride = null) {
    const db = getDb();
    const savedConfig = db.prepare('SELECT * FROM email_config WHERE is_enabled = 1 ORDER BY id DESC LIMIT 1').get();
    const config = configOverride || savedConfig;

    if (!config) {
      return { success: false, error: 'Email configuration is missing in database.' };
    }

    const recipient = (config.alert_recipient_email || config.admin_email || '').trim();
    if (!recipient) {
      return { success: false, error: 'Recipient email is missing. Please configure Alert Recipient Email.' };
    }

    const fromAddress = config.smtp_from || config.smtp_user || 'alerts@predictive-maintenance.io';
    const mailOptions = {
      from: `"Predictive Maintenance System" <${fromAddress}>`,
      to: recipient,
      subject: 'Predictive Maintenance - Test Email',
      text: `This is a test email from the Predictive Maintenance Monitoring System.\nConfiguration is working correctly.\n\nTimestamp: ${new Date().toISOString()}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #0891b2; border-radius: 8px; overflow: hidden; background: #0f172a; color: #e2e8f0;">
          <div style="background: linear-gradient(135deg, #0891b2, #2563eb); padding: 20px; color: #ffffff; text-align: center;">
            <h2 style="margin: 0; font-size: 20px; text-transform: uppercase; letter-spacing: 1px;">Predictive Maintenance System</h2>
            <p style="margin: 5px 0 0 0; font-size: 13px; opacity: 0.9;">Email Verification Test</p>
          </div>
          <div style="padding: 24px;">
            <div style="background: #1e293b; padding: 16px; border-radius: 6px; border-left: 4px solid #10b981; margin-bottom: 20px;">
              <h3 style="margin: 0 0 8px 0; color: #10b981; font-size: 16px;">✓ Connection Successful</h3>
              <p style="margin: 0; font-size: 14px; color: #cbd5e1;">
                This is a test email from the Predictive Maintenance Monitoring System.<br/>
                Email alert dispatch engine is working correctly.
              </p>
            </div>
            <table style="width: 100%; font-size: 13px; color: #94a3b8; border-collapse: collapse;">
              <tr><td style="padding: 6px 0; width: 40%;"><strong>Delivery Mode:</strong></td><td style="color: #f1f5f9;">${config.webhook_url ? 'HTTPS Webhook Relay' : config.smtp_host}</td></tr>
              <tr><td style="padding: 6px 0;"><strong>Recipient:</strong></td><td style="color: #38bdf8;">${recipient}</td></tr>
              <tr><td style="padding: 6px 0;"><strong>Dispatched At:</strong></td><td style="color: #f1f5f9;">${new Date().toISOString()}</td></tr>
            </table>
          </div>
          <div style="background: #020617; padding: 12px 24px; text-align: center; font-size: 11px; color: #64748b;">
            Industry 4.0 Predictive Maintenance Engine &bull; Automated System Test
          </div>
        </div>
      `
    };

    // 1. Try HTTPS Webhook if configured
    if (config.webhook_url && config.webhook_url.trim().startsWith('https://')) {
      try {
        await axios.post(config.webhook_url.trim(), {
          to: recipient,
          subject: mailOptions.subject,
          text: mailOptions.text,
          html: mailOptions.html
        }, { timeout: 15000 });

        this.logEmail(recipient, mailOptions.subject, 'INFO', 'SENT', mailOptions.text, null);
        return {
          success: true,
          status: 'SENT',
          message: `Test email successfully dispatched via HTTPS Webhook to ${recipient}.`
        };
      } catch (err) {
        console.warn('[EMAIL SERVICE] Webhook dispatch error:', err.message);
      }
    }

    // 2. Direct SMTP
    try {
      const transporter = this.createTransporter(config);
      const info = await transporter.sendMail(mailOptions);
      this.logEmail(recipient, mailOptions.subject, 'INFO', 'SENT', mailOptions.text, null);
      return {
        success: true,
        status: 'SENT',
        messageId: info.messageId,
        message: `Test email successfully dispatched to ${recipient}.`
      };
    } catch (err) {
      const safeError = this.sanitizeError(err);
      this.logEmail(recipient, mailOptions.subject, 'ERROR', 'FAILED', mailOptions.text, safeError);
      return {
        success: false,
        status: 'FAILED',
        error: safeError,
        message: safeError
      };
    }
  }

  /**
   * Sends critical alert email immediately upon 1 anomaly detection.
   * Supports all data sources: THINGSPEAK, API_DIRECT, DATASET_UPLOAD.
   */
  static async sendCriticalAlertEmail(alertData, readingData = {}, thresholds = {}) {
    const db = getDb();
    const config = db.prepare('SELECT * FROM email_config WHERE is_enabled = 1 ORDER BY id DESC LIMIT 1').get();

    if (!config || !config.alert_recipient_email) {
      console.warn('[EMAIL SERVICE] Alert email skipped: No configured recipient email in database.');
      return { success: false, error: 'Recipient email is not configured in Email Alerts settings.' };
    }

    const recipient = config.alert_recipient_email.trim();
    const ccList = [config.admin_email, config.customer_email].filter(e => e && e.trim() && e.trim() !== recipient).join(', ');

    const dataSource = alertData.data_source || readingData.data_source || 'API_DIRECT';
    const isDataset = dataSource === 'DATASET_UPLOAD' || dataSource === 'DATASET';
    const machineId = alertData.machine_id || Config.MACHINE_ID;
    const entryId = alertData.entry_id || readingData.entry_id || 'N/A';
    const rowNumber = alertData.row_number || readingData.row_number || readingData.entry_id || '1';
    const datasetName = alertData.dataset_name || readingData.dataset_name || readingData.filename || 'uploaded_dataset.csv';
    const timestamp = alertData.timestamp || new Date().toISOString();
    const parameter = alertData.parameter || 'Temperature';
    const actualValue = alertData.value ?? alertData.machine_temperature ?? readingData.temperature ?? 'N/A';
    const normalRange = alertData.normal_range || `${thresholds.normal_range_low || 34}°C - ${thresholds.normal_range_high || 49}°C`;
    const anomalyScore = alertData.anomaly_score ?? readingData.anomaly_score ?? 0.85;
    const healthScore = alertData.health_score ?? readingData.health_score ?? 40.0;
    const severity = alertData.severity || 'CRITICAL';
    const recommendedAction = isDataset
      ? 'Please inspect the machine condition immediately.'
      : 'Inspect the machine immediately and verify the cooling/lubrication system.';

    const fromAddress = config.smtp_from || config.smtp_user || 'alerts@predictive-maintenance.io';
    const subject = isDataset
      ? `🚨 Predictive Maintenance Critical Alert - Dataset Anomaly`
      : `🚨 Predictive Maintenance Critical Alert - Anomaly Detected`;

    let plainBody = '';
    let htmlBody = '';

    if (isDataset) {
      plainBody = `
CRITICAL MACHINE ALERT

Data Source:
DATASET_UPLOAD

Dataset Name:
${datasetName}

Row:
${rowNumber}

Machine ID:
${machineId}

Anomaly Detected:
YES

Parameter:
${parameter}

Value:
${actualValue}

Normal Range:
${normalRange}

Anomaly Score:
${anomalyScore}

Machine Health Score:
${healthScore}/100

Alert Rule:
1-Anomaly Immediate Trigger

Recommended Action:
${recommendedAction}

Timestamp:
${timestamp}
      `.trim();

      htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; border: 1px solid #e11d48; border-radius: 8px; overflow: hidden; background: #ffffff; color: #1e293b;">
          <div style="background: #e11d48; padding: 18px 24px; color: #ffffff;">
            <h2 style="margin: 0; font-size: 18px; text-transform: uppercase;">🚨 CRITICAL MACHINE ALERT</h2>
            <p style="margin: 4px 0 0 0; font-size: 12px; opacity: 0.95;">Source: DATASET_UPLOAD &bull; Row #${rowNumber}</p>
          </div>
          <div style="padding: 24px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr><td style="padding: 8px 0; color: #64748b; width: 40%;"><strong>Data Source:</strong></td><td style="font-weight: bold; color: #0284c7;">DATASET_UPLOAD</td></tr>
              <tr><td style="padding: 8px 0; color: #64748b;"><strong>Dataset Name:</strong></td><td>${datasetName}</td></tr>
              <tr><td style="padding: 8px 0; color: #64748b;"><strong>Row Number:</strong></td><td>${rowNumber}</td></tr>
              <tr><td style="padding: 8px 0; color: #64748b;"><strong>Machine ID:</strong></td><td>${machineId}</td></tr>
              <tr><td style="padding: 8px 0; color: #64748b;"><strong>Anomaly Detected:</strong></td><td style="color: #e11d48; font-weight: bold;">YES (Critical)</td></tr>
              <tr><td style="padding: 8px 0; color: #64748b;"><strong>Parameter:</strong></td><td>${parameter}</td></tr>
              <tr><td style="padding: 8px 0; color: #64748b;"><strong>Breached Value:</strong></td><td style="color: #e11d48; font-weight: bold;">${actualValue}</td></tr>
              <tr><td style="padding: 8px 0; color: #64748b;"><strong>Normal Range:</strong></td><td>${normalRange}</td></tr>
              <tr><td style="padding: 8px 0; color: #64748b;"><strong>Anomaly Score:</strong></td><td>${anomalyScore}</td></tr>
              <tr><td style="padding: 8px 0; color: #64748b;"><strong>Machine Health Score:</strong></td><td style="color: #e11d48; font-weight: bold;">${healthScore}/100</td></tr>
              <tr><td style="padding: 8px 0; color: #64748b;"><strong>Alert Rule:</strong></td><td>1-Anomaly Immediate Trigger</td></tr>
              <tr><td style="padding: 8px 0; color: #64748b;"><strong>Recommended Action:</strong></td><td style="color: #b45309; font-weight: bold;">${recommendedAction}</td></tr>
              <tr><td style="padding: 8px 0; color: #64748b;"><strong>Timestamp:</strong></td><td>${timestamp}</td></tr>
            </table>
          </div>
        </div>
      `;
    } else {
      plainBody = `
CRITICAL MACHINE ALERT

Data Source:
${dataSource}

Machine ID:
${machineId}

Anomaly Detected:
YES

Parameter:
${parameter}

Value:
${actualValue}

Normal Range:
${normalRange}

Anomaly Score:
${anomalyScore}

Machine Health Score:
${healthScore}/100

Alert Rule:
1-Anomaly Immediate Trigger

Recommended Action:
${recommendedAction}

Timestamp:
${timestamp}
      `.trim();

      htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; border: 1px solid #e11d48; border-radius: 8px; overflow: hidden; background: #ffffff; color: #1e293b;">
          <div style="background: #e11d48; padding: 18px 24px; color: #ffffff;">
            <h2 style="margin: 0; font-size: 18px; text-transform: uppercase;">🚨 CRITICAL MACHINE ALERT</h2>
            <p style="margin: 4px 0 0 0; font-size: 12px; opacity: 0.95;">Source: ${dataSource} &bull; Entry #${entryId}</p>
          </div>
          <div style="padding: 24px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr><td style="padding: 8px 0; color: #64748b; width: 40%;"><strong>Data Source:</strong></td><td style="font-weight: bold; color: #0284c7;">${dataSource}</td></tr>
              <tr><td style="padding: 8px 0; color: #64748b;"><strong>Machine ID:</strong></td><td>${machineId}</td></tr>
              <tr><td style="padding: 8px 0; color: #64748b;"><strong>Anomaly Detected:</strong></td><td style="color: #e11d48; font-weight: bold;">YES (Critical)</td></tr>
              <tr><td style="padding: 8px 0; color: #64748b;"><strong>Parameter:</strong></td><td>${parameter}</td></tr>
              <tr><td style="padding: 8px 0; color: #64748b;"><strong>Value:</strong></td><td style="color: #e11d48; font-weight: bold;">${actualValue}</td></tr>
              <tr><td style="padding: 8px 0; color: #64748b;"><strong>Normal Range:</strong></td><td>${normalRange}</td></tr>
              <tr><td style="padding: 8px 0; color: #64748b;"><strong>Anomaly Score:</strong></td><td>${anomalyScore}</td></tr>
              <tr><td style="padding: 8px 0; color: #64748b;"><strong>Machine Health Score:</strong></td><td style="color: #e11d48; font-weight: bold;">${healthScore}/100</td></tr>
              <tr><td style="padding: 8px 0; color: #64748b;"><strong>Alert Rule:</strong></td><td>1-Anomaly Immediate Trigger</td></tr>
              <tr><td style="padding: 8px 0; color: #64748b;"><strong>Recommended Action:</strong></td><td style="color: #b45309; font-weight: bold;">${recommendedAction}</td></tr>
              <tr><td style="padding: 8px 0; color: #64748b;"><strong>Timestamp:</strong></td><td>${timestamp}</td></tr>
            </table>
          </div>
        </div>
      `;
    }

    // 1. Try HTTPS Webhook Relay first if configured
    if (config.webhook_url && config.webhook_url.trim().startsWith('https://')) {
      try {
        await axios.post(config.webhook_url.trim(), {
          to: recipient,
          cc: ccList,
          subject: subject,
          text: plainBody,
          html: htmlBody
        }, { timeout: 15000 });

        this.logEmail(recipient, subject, severity, 'SENT', plainBody, null);
        if (alertData.id) {
          db.prepare("UPDATE alerts SET email_sent = 1, email_status = 'EMAIL SENT', email_recipient = ?, email_dispatched_at = ? WHERE id = ?")
            .run(recipient, new Date().toISOString(), alertData.id);
        }

        return {
          success: true,
          status: 'SENT',
          recipient: recipient,
          message: `Alert email dispatched via HTTPS Webhook to ${recipient}.`
        };
      } catch (err) {
        console.warn('[EMAIL SERVICE] Webhook dispatch failed, falling back to SMTP:', err.message);
      }
    }

    // 2. Fallback to Direct SMTP
    try {
      const transporter = this.createTransporter(config);
      const mailOptions = {
        from: `"Predictive Maintenance Sentinel" <${fromAddress}>`,
        to: recipient,
        cc: ccList || undefined,
        subject: subject,
        text: plainBody,
        html: htmlBody
      };

      const info = await transporter.sendMail(mailOptions);
      this.logEmail(recipient, subject, severity, 'SENT', plainBody, null);

      if (alertData.id) {
        db.prepare("UPDATE alerts SET email_sent = 1, email_status = 'EMAIL SENT', email_recipient = ?, email_dispatched_at = ? WHERE id = ?")
          .run(recipient, new Date().toISOString(), alertData.id);
      }

      return {
        success: true,
        status: 'SENT',
        messageId: info.messageId,
        recipient: recipient,
        message: `Alert email dispatched to ${recipient}.`
      };
    } catch (err) {
      const safeError = this.sanitizeError(err);
      this.logEmail(recipient, subject, severity, 'FAILED', plainBody, safeError);

      if (alertData.id) {
        db.prepare("UPDATE alerts SET email_sent = 0, email_status = ?, email_recipient = ? WHERE id = ?")
          .run(`EMAIL FAILED: ${safeError.slice(0, 80)}`, recipient, alertData.id);
      }

      return {
        success: false,
        status: 'FAILED',
        error: safeError,
        message: safeError
      };
    }
  }
}
