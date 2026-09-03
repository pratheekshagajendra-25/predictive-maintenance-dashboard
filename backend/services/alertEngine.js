import crypto from 'crypto';
import { getDb } from './db.js';
import { EmailService } from './emailService.js';
import { Config } from '../config.js';

export class AlertEngine {
  /**
   * Generates a unique event hash for duplicate prevention across all data sources.
   * - THINGSPEAK: TS:${channelId}:${entryId}
   * - DATASET_UPLOAD: DATASET:${datasetRef}:${rowNumber}
   * - API_DIRECT: API_DIRECT:${machineId}:${timestamp}:${temp}:${vib}:${rpm}
   */
  static generateEventHash(reading) {
    const machineId = reading.machine_id || Config.MACHINE_ID;
    const dataSource = (reading.data_source || 'API_DIRECT').toUpperCase();
    
    if (dataSource === 'THINGSPEAK_LIVE' || dataSource === 'THINGSPEAK') {
      const channelId = reading.channel_id || 'main';
      const entryId = reading.entry_id !== undefined && reading.entry_id !== null ? String(reading.entry_id) : '';
      if (entryId) {
        return crypto.createHash('sha256').update(`TS:${channelId}:${entryId}`).digest('hex');
      }
    } else if (dataSource === 'DATASET_UPLOAD' || dataSource === 'DATASET') {
      const datasetName = reading.dataset_name || 'dataset.csv';
      const rowNumber = reading.row_number || reading.entry_id || '1';
      const temp = Number(reading.temperature || 0).toFixed(2);
      const vib = Number(reading.vibration || 0).toFixed(2);
      const rpm = Number(reading.rpm || 0).toFixed(0);
      const rawKey = `DATASET:${datasetName}:${rowNumber}:${temp}:${vib}:${rpm}`;
      return crypto.createHash('sha256').update(rawKey).digest('hex');
    }

    // API_DIRECT or raw telemetry event
    const ts = reading.created_at || reading.thingspeak_created_at || reading.timestamp || '';
    const temp = Number(reading.temperature || 0).toFixed(2);
    const vib = Number(reading.vibration || 0).toFixed(2);
    const rpm = Number(reading.rpm || 0).toFixed(0);
    const press = Number(reading.pressure || 0).toFixed(2);
    const rawKey = `API_DIRECT:${machineId}:${ts}:${temp}:${vib}:${rpm}:${press}`;
    return crypto.createHash('sha256').update(rawKey).digest('hex');
  }

  /**
   * COMMON ALERT SERVICE
   * Processes an anomalous reading across all data sources:
   * 1. THINGSPEAK
   * 2. API_DIRECT
   * 3. DATASET_UPLOAD
   * 
   * Rule: ALERT THRESHOLD = 1.
   * Every NEW anomaly creates a Critical Alert in Alert History and sends ONE email immediately.
   */
  static async processReading(reading, anomalyResult, thresholds = {}, healthResult = {}) {
    if (!anomalyResult.isAnomaly) {
      return {
        alertCreated: false,
        emailSent: false,
        reason: 'Reading is normal. No alert generated.'
      };
    }

    const db = getDb();
    const nowIso = new Date().toISOString();
    const eventHash = this.generateEventHash(reading);

    // 1. Duplicate check: has this specific entry/row already generated an alert?
    const existingIdempotency = db.prepare('SELECT * FROM alert_idempotency WHERE event_hash = ?').get(eventHash);
    if (existingIdempotency) {
      return {
        alertCreated: false,
        emailSent: false,
        duplicateSuppressed: true,
        alertId: existingIdempotency.alert_id,
        reason: 'Duplicate anomaly event detected. Repeat email suppressed.'
      };
    }

    const dataSource = reading.data_source || 'API_DIRECT';
    const isDataset = dataSource === 'DATASET_UPLOAD' || dataSource === 'DATASET';
    const rowNumber = reading.row_number || reading.entry_id || '—';
    const datasetName = reading.dataset_name || reading.filename || 'dataset.csv';

    // 2. Extract breach details
    const primaryBreach = anomalyResult.primaryBreach || {
      parameter: 'Machine Temperature',
      value: reading.temperature,
      normalRange: `${thresholds.normal_range_low || 34}°C - ${thresholds.normal_range_high || 49}°C`,
      threshold: thresholds.machine_temp_critical || 55.0,
      reason: 'Anomaly threshold violation detected.'
    };

    const alertId = `ALT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const machineId = reading.machine_id || Config.MACHINE_ID;
    const severity = anomalyResult.severity || 'CRITICAL';
    const triggerReason = primaryBreach.reason || `Parameter ${primaryBreach.parameter} exceeded safe threshold.`;
    const recommendedAction = isDataset 
      ? 'Please inspect the machine condition immediately.' 
      : 'Inspect the machine immediately and verify the cooling/lubrication system.';

    const entryLabel = isDataset ? `Row ${rowNumber}` : (reading.entry_id ? String(reading.entry_id) : 'Direct');

    // 3. Insert Alert Record into Database
    db.prepare(`
      INSERT INTO alerts (
        alert_id, machine_id, timestamp, thingspeak_timestamp,
        severity, parameter, value, machine_temperature, ambient_temperature,
        threshold_value, consecutive_count, health_score, anomaly_score,
        entry_id, trigger_reason, recommended_action, status,
        email_sent, email_status, detection_method, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      alertId, machineId, reading.created_at || nowIso, reading.thingspeak_created_at || null,
      severity, primaryBreach.parameter, primaryBreach.value || reading.temperature || 0,
      reading.temperature || 0, reading.ambient_temperature || 0,
      primaryBreach.threshold || 0,
      1, // Alert Threshold = 1
      healthResult.healthScore ?? reading.health_score ?? 40.0,
      anomalyResult.anomalyScore ?? reading.anomaly_score ?? 0.85,
      entryLabel,
      triggerReason, recommendedAction, 'CRITICAL',
      0, 'PENDING', anomalyResult.detectionMethod || 'Rule-Based Threshold Engine', nowIso
    );

    const alertData = {
      alert_id: alertId,
      machine_id: machineId,
      data_source: dataSource,
      dataset_name: datasetName,
      row_number: rowNumber,
      entry_id: reading.entry_id || null,
      timestamp: reading.created_at || nowIso,
      parameter: primaryBreach.parameter,
      value: primaryBreach.value,
      normal_range: primaryBreach.normalRange,
      anomaly_score: anomalyResult.anomalyScore,
      health_score: healthResult.healthScore,
      severity: severity,
      recommended_action: recommendedAction
    };

    // 4. Dispatch Instant Alert Email (ONE ANOMALY = ONE EMAIL)
    let emailResult = { success: false, status: 'SKIPPED' };
    try {
      emailResult = await EmailService.sendCriticalAlertEmail(alertData, reading, thresholds);
      
      const emailStatus = emailResult.success ? 'EMAIL SENT' : (emailResult.error ? `EMAIL FAILED: ${emailResult.error}` : 'EMAIL FAILED');
      const emailSentFlag = emailResult.success ? 1 : 0;

      db.prepare(`
        UPDATE alerts
        SET email_sent = ?, email_status = ?, email_recipient = ?
        WHERE alert_id = ?
      `).run(emailSentFlag, emailStatus, emailResult.recipient || null, alertId);

      // 5. Register in Idempotency table to prevent future duplicate emails
      db.prepare(`
        INSERT INTO alert_idempotency (event_hash, alert_id, machine_id, parameter, email_sent_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(eventHash, alertId, machineId, primaryBreach.parameter, nowIso);

    } catch (e) {
      console.error(`[ALERT ENGINE] Email dispatch error: ${e.message}`);
    }

    return {
      alertCreated: true,
      alertId,
      severity,
      emailSent: emailResult.success,
      emailStatus: emailResult.status,
      emailError: emailResult.error || null,
      alert: alertData
    };
  }
}
