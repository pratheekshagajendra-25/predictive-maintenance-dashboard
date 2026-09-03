import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { Config } from '../config.js';

// Ensure uploads folder exists
if (!fs.existsSync(Config.UPLOADS_DIR)) {
  fs.mkdirSync(Config.UPLOADS_DIR, { recursive: true });
}

let dbInstance = null;

export function getDb() {
  if (!dbInstance) {
    dbInstance = new Database(Config.DATABASE_PATH, { timeout: 10000 });
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('synchronous = NORMAL');
    initDb(dbInstance);
  }
  return dbInstance;
}

function initDb(db) {
  // Users Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'customer',
      full_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_login TEXT
    );
  `);

  // Sensor Readings Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      machine_id TEXT DEFAULT 'Machine-01',
      entry_id INTEGER,
      created_at TEXT NOT NULL,
      thingspeak_created_at TEXT,
      fetch_timestamp TEXT,
      temperature REAL NOT NULL DEFAULT 0.0,
      ambient_temperature REAL NOT NULL DEFAULT 0.0,
      vibration REAL DEFAULT 0.0,
      rpm REAL DEFAULT 0.0,
      pressure REAL DEFAULT 0.0,
      current REAL DEFAULT 0.0,
      voltage REAL DEFAULT 0.0,
      power REAL DEFAULT 0.0,
      temperature_difference REAL DEFAULT 0.0,
      rolling_mean_10 REAL DEFAULT 0.0,
      rolling_median_10 REAL DEFAULT 0.0,
      rolling_std_10 REAL DEFAULT 0.0,
      rate_of_change REAL DEFAULT 0.0,
      temperature_trend TEXT DEFAULT 'STABLE',
      deviation_from_normal REAL DEFAULT 0.0,
      local_z_score REAL DEFAULT 0.0,
      condition TEXT DEFAULT 'Normal',
      anomaly_flag INTEGER DEFAULT 0,
      anomaly_score REAL DEFAULT 0.0,
      rf_prediction INTEGER DEFAULT 0,
      rf_probability REAL DEFAULT 0.0,
      xgb_prediction INTEGER DEFAULT 0,
      xgb_probability REAL DEFAULT 0.0,
      svc_prediction INTEGER DEFAULT 0,
      svc_probability REAL DEFAULT 0.0,
      isolation_forest_prediction INTEGER DEFAULT 1,
      isolation_forest_score REAL DEFAULT 0.0,
      final_prediction TEXT DEFAULT 'Normal',
      final_confidence REAL DEFAULT 100.0,
      health_score REAL DEFAULT 100.0,
      detection_method TEXT DEFAULT 'Rule Engine',
      is_live INTEGER DEFAULT 0,
      data_source TEXT DEFAULT 'HISTORICAL_DATASET',
      created_timestamp REAL NOT NULL DEFAULT 0
    );
  `);

  // Ensure new columns exist in readings
  const readingCols = new Set(db.prepare("PRAGMA table_info(readings)").all().map(c => c.name));
  const newReadingCols = [
    { name: 'machine_id', type: "TEXT DEFAULT 'Machine-01'" },
    { name: 'vibration', type: "REAL DEFAULT 0.0" },
    { name: 'rpm', type: "REAL DEFAULT 0.0" },
    { name: 'pressure', type: "REAL DEFAULT 0.0" },
    { name: 'current', type: "REAL DEFAULT 0.0" },
    { name: 'voltage', type: "REAL DEFAULT 0.0" },
    { name: 'power', type: "REAL DEFAULT 0.0" },
    { name: 'health_score', type: "REAL DEFAULT 100.0" },
    { name: 'detection_method', type: "TEXT DEFAULT 'Rule Engine'" }
  ];
  for (const col of newReadingCols) {
    if (!readingCols.has(col.name)) {
      db.exec(`ALTER TABLE readings ADD COLUMN ${col.name} ${col.type};`);
    }
  }

  // Alerts Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_id TEXT UNIQUE NOT NULL,
      machine_id TEXT DEFAULT 'Machine-01',
      timestamp TEXT NOT NULL,
      thingspeak_timestamp TEXT,
      severity TEXT NOT NULL, -- 'CRITICAL', 'WARNING', 'INFO'
      parameter TEXT DEFAULT 'Temperature',
      value REAL DEFAULT 0.0,
      machine_temperature REAL NOT NULL DEFAULT 0.0,
      ambient_temperature REAL NOT NULL DEFAULT 0.0,
      threshold_value REAL NOT NULL DEFAULT 0.0,
      consecutive_count INTEGER NOT NULL DEFAULT 1,
      health_score REAL NOT NULL DEFAULT 0.0,
      anomaly_score REAL DEFAULT 0.0,
      entry_id INTEGER,
      trigger_reason TEXT NOT NULL,
      recommended_action TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'CRITICAL', -- 'CRITICAL', 'WARNING', 'RESOLVED', 'ACTIVE', 'ACKNOWLEDGED'
      acknowledged_by TEXT,
      acknowledged_at TEXT,
      resolved_by TEXT,
      resolved_at TEXT,
      resolution_notes TEXT,
      email_sent INTEGER DEFAULT 0,
      email_status TEXT DEFAULT 'PENDING',
      email_recipient TEXT,
      detection_method TEXT DEFAULT 'Rule Engine',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Ensure new columns exist in alerts
  const alertCols = new Set(db.prepare("PRAGMA table_info(alerts)").all().map(c => c.name));
  const newAlertCols = [
    { name: 'machine_id', type: "TEXT DEFAULT 'Machine-01'" },
    { name: 'parameter', type: "TEXT DEFAULT 'Temperature'" },
    { name: 'value', type: "REAL DEFAULT 0.0" },
    { name: 'thingspeak_timestamp', type: "TEXT DEFAULT ''" },
    { name: 'consecutive_count', type: "INTEGER DEFAULT 1" },
    { name: 'anomaly_score', type: "REAL DEFAULT 0.0" },
    { name: 'entry_id', type: "INTEGER" },
    { name: 'email_recipient', type: "TEXT" },
    { name: 'email_dispatched_at', type: "TEXT DEFAULT ''" },
    { name: 'detection_method', type: "TEXT DEFAULT 'Rule Engine'" },
    { name: 'created_at', type: "TEXT DEFAULT ''" }
  ];
  for (const col of newAlertCols) {
    if (!alertCols.has(col.name)) {
      db.exec(`ALTER TABLE alerts ADD COLUMN ${col.name} ${col.type};`);
    }
  }

  // Threshold Configuration Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS threshold_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      machine_temp_min REAL NOT NULL DEFAULT 20.0,
      machine_temp_max REAL NOT NULL DEFAULT 55.0,
      machine_temp_warning REAL NOT NULL DEFAULT 52.0,
      machine_temp_critical REAL NOT NULL DEFAULT 55.0,
      ambient_temp_min REAL NOT NULL DEFAULT 15.0,
      ambient_temp_max REAL NOT NULL DEFAULT 42.0,
      ambient_temp_warning REAL NOT NULL DEFAULT 40.0,
      ambient_temp_critical REAL NOT NULL DEFAULT 42.0,
      normal_range_low REAL NOT NULL DEFAULT 34.0,
      normal_range_high REAL NOT NULL DEFAULT 49.0,
      vibration_min REAL NOT NULL DEFAULT 0.1,
      vibration_max REAL NOT NULL DEFAULT 4.5,
      vibration_warning REAL NOT NULL DEFAULT 3.5,
      vibration_critical REAL NOT NULL DEFAULT 4.5,
      rpm_min REAL NOT NULL DEFAULT 800.0,
      rpm_max REAL NOT NULL DEFAULT 3200.0,
      rpm_warning REAL NOT NULL DEFAULT 3000.0,
      rpm_critical REAL NOT NULL DEFAULT 3200.0,
      pressure_min REAL NOT NULL DEFAULT 1.0,
      pressure_max REAL NOT NULL DEFAULT 8.0,
      pressure_warning REAL NOT NULL DEFAULT 7.0,
      pressure_critical REAL NOT NULL DEFAULT 8.0,
      current_min REAL NOT NULL DEFAULT 2.0,
      current_max REAL NOT NULL DEFAULT 25.0,
      voltage_min REAL NOT NULL DEFAULT 200.0,
      voltage_max REAL NOT NULL DEFAULT 250.0,
      consecutive_anomaly_threshold INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      updated_by TEXT DEFAULT 'SYSTEM',
      updated_at TEXT NOT NULL
    );
  `);

  // Migrate threshold_config columns if missing
  const threshCols = new Set(db.prepare("PRAGMA table_info(threshold_config)").all().map(c => c.name));
  const newThreshCols = [
    { name: 'machine_temp_min', type: 'REAL NOT NULL DEFAULT 20.0' },
    { name: 'machine_temp_max', type: 'REAL NOT NULL DEFAULT 55.0' },
    { name: 'ambient_temp_min', type: 'REAL NOT NULL DEFAULT 15.0' },
    { name: 'ambient_temp_max', type: 'REAL NOT NULL DEFAULT 42.0' },
    { name: 'vibration_min', type: 'REAL NOT NULL DEFAULT 0.1' },
    { name: 'vibration_max', type: 'REAL NOT NULL DEFAULT 4.5' },
    { name: 'vibration_warning', type: 'REAL NOT NULL DEFAULT 3.5' },
    { name: 'vibration_critical', type: 'REAL NOT NULL DEFAULT 4.5' },
    { name: 'rpm_min', type: 'REAL NOT NULL DEFAULT 800.0' },
    { name: 'rpm_max', type: 'REAL NOT NULL DEFAULT 3200.0' },
    { name: 'rpm_warning', type: 'REAL NOT NULL DEFAULT 3000.0' },
    { name: 'rpm_critical', type: 'REAL NOT NULL DEFAULT 3200.0' },
    { name: 'pressure_min', type: 'REAL NOT NULL DEFAULT 1.0' },
    { name: 'pressure_max', type: 'REAL NOT NULL DEFAULT 8.0' },
    { name: 'pressure_warning', type: 'REAL NOT NULL DEFAULT 7.0' },
    { name: 'pressure_critical', type: 'REAL NOT NULL DEFAULT 8.0' },
    { name: 'current_min', type: 'REAL NOT NULL DEFAULT 2.0' },
    { name: 'current_max', type: 'REAL NOT NULL DEFAULT 25.0' },
    { name: 'voltage_min', type: 'REAL NOT NULL DEFAULT 200.0' },
    { name: 'voltage_max', type: 'REAL NOT NULL DEFAULT 250.0' }
  ];
  for (const col of newThreshCols) {
    if (!threshCols.has(col.name)) {
      db.exec(`ALTER TABLE threshold_config ADD COLUMN ${col.name} ${col.type};`);
    }
  }
  // Enforce consecutive_anomaly_threshold = 1 in database
  db.exec(`UPDATE threshold_config SET consecutive_anomaly_threshold = 1 WHERE consecutive_anomaly_threshold != 1;`);

  // Email Alert Configuration Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_recipient_email TEXT NOT NULL DEFAULT '',
      admin_email TEXT NOT NULL DEFAULT 'admin@maintenance.io',
      customer_email TEXT NOT NULL DEFAULT 'operator@client.com',
      smtp_host TEXT DEFAULT 'smtp.gmail.com',
      smtp_port INTEGER DEFAULT 587,
      smtp_user TEXT DEFAULT '',
      smtp_password TEXT DEFAULT '',
      smtp_from TEXT DEFAULT 'alerts@predictive-maintenance.io',
      is_verified INTEGER DEFAULT 0,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      updated_by TEXT DEFAULT 'ADMIN',
      updated_at TEXT NOT NULL
    );
  `);
  const emailCols = new Set(db.prepare("PRAGMA table_info(email_config)").all().map(c => c.name));
  if (!emailCols.has('is_verified')) {
    db.exec(`ALTER TABLE email_config ADD COLUMN is_verified INTEGER DEFAULT 0;`);
  }
  if (!emailCols.has('webhook_url')) {
    db.exec(`ALTER TABLE email_config ADD COLUMN webhook_url TEXT DEFAULT '';`);
  }

  // ThingSpeak Configuration Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS thingspeak_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id TEXT NOT NULL DEFAULT '',
      read_api_key TEXT NOT NULL DEFAULT '',
      write_api_key TEXT DEFAULT '',
      poll_interval_sec INTEGER NOT NULL DEFAULT 30,
      freshness_limit_sec INTEGER NOT NULL DEFAULT 120,
      data_source TEXT NOT NULL DEFAULT 'both', -- 'thingspeak', 'dataset', 'both'
      field_mapping TEXT DEFAULT '{"field1":"temperature","field2":"ambient_temperature","field3":"vibration","field4":"rpm","field5":"pressure"}',
      is_enabled INTEGER NOT NULL DEFAULT 1,
      updated_by TEXT DEFAULT 'ADMIN',
      updated_at TEXT NOT NULL
    );
  `);
  const tsCols = new Set(db.prepare("PRAGMA table_info(thingspeak_config)").all().map(c => c.name));
  if (!tsCols.has('field_mapping')) {
    db.exec(`ALTER TABLE thingspeak_config ADD COLUMN field_mapping TEXT DEFAULT '{"field1":"temperature","field2":"ambient_temperature","field3":"vibration","field4":"rpm","field5":"pressure"}';`);
  }

  // Uploaded Datasets Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS uploaded_datasets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      row_count INTEGER NOT NULL,
      column_count INTEGER NOT NULL,
      quality_score REAL DEFAULT 100.0,
      normal_count INTEGER DEFAULT 0,
      anomaly_count INTEGER DEFAULT 0,
      mapping_info TEXT,
      validation_summary TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      uploaded_by TEXT DEFAULT 'ADMIN',
      uploaded_at TEXT NOT NULL
    );
  `);
  const datasetCols = new Set(db.prepare("PRAGMA table_info(uploaded_datasets)").all().map(c => c.name));
  const newDatasetCols = [
    { name: 'normal_count', type: 'INTEGER DEFAULT 0' },
    { name: 'anomaly_count', type: 'INTEGER DEFAULT 0' },
    { name: 'quality_score', type: 'REAL DEFAULT 100.0' },
    { name: 'validation_summary', type: 'TEXT' },
    { name: 'mapping_info', type: 'TEXT' }
  ];
  for (const col of newDatasetCols) {
    if (!datasetCols.has(col.name)) {
      db.exec(`ALTER TABLE uploaded_datasets ADD COLUMN ${col.name} ${col.type};`);
    }
  }

  // System Logs Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      level TEXT NOT NULL, -- 'INFO', 'WARNING', 'ERROR'
      module TEXT NOT NULL,
      message TEXT NOT NULL,
      details TEXT
    );
  `);

  // Email Logs Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL, -- 'SENT', 'FAILED', 'VERIFIED'
      error_message TEXT,
      email_body TEXT
    );
  `);

  // Audit Trail Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_trail (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      username TEXT NOT NULL,
      role TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT
    );
  `);

  // Alert Idempotency Table (Duplicate Alert Suppression)
  db.exec(`
    CREATE TABLE IF NOT EXISTS alert_idempotency (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_hash TEXT UNIQUE NOT NULL,
      alert_id TEXT NOT NULL,
      machine_id TEXT NOT NULL,
      parameter TEXT NOT NULL,
      email_sent_at TEXT NOT NULL
    );
  `);

  // Indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_readings_entry_id ON readings(entry_id);
    CREATE INDEX IF NOT EXISTS idx_readings_created_at ON readings(created_at);
    CREATE INDEX IF NOT EXISTS idx_readings_is_live ON readings(is_live);
    CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
    CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp);
    CREATE INDEX IF NOT EXISTS idx_alert_idempotency_hash ON alert_idempotency(event_hash);
  `);

  // Seed Default Users or migrate legacy werkzeug scrypt hashes
  const existingUsers = db.prepare('SELECT id, username, password_hash FROM users').all();
  if (existingUsers.length === 0) {
    const nowIso = new Date().toISOString();
    const adminHash = bcrypt.hashSync('Admin@12345', 10);
    const custHash = bcrypt.hashSync('Customer@12345', 10);

    db.prepare(`
      INSERT INTO users (username, email, password_hash, role, full_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('admin', 'admin@predictive-maintenance.io', adminHash, 'admin', 'Lead Maintenance Engineer', nowIso);

    db.prepare(`
      INSERT INTO users (username, email, password_hash, role, full_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('customer', 'operator@client.com', custHash, 'customer', 'CNC Plant Operator', nowIso);

    logAudit(db, 'SYSTEM', 'SYSTEM', 'SEED_USERS', 'Created default admin and customer user credentials.');
  } else {
    // Migrate any legacy scrypt/werkzeug hashes that cannot be validated by bcrypt
    for (const u of existingUsers) {
      if (u.password_hash && u.password_hash.startsWith('scrypt:')) {
        const newHash = u.username === 'admin' ? bcrypt.hashSync('Admin@12345', 10) : bcrypt.hashSync('Customer@12345', 10);
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, u.id);
        console.log(`[DB MIGRATION] Migrated legacy hash for user '${u.username}' to bcrypt.`);
      }
    }
  }

  // Seed Default Thresholds
  const threshCount = db.prepare('SELECT count(*) as count FROM threshold_config').get().count;
  if (threshCount === 0) {
    const nowIso = new Date().toISOString();
    const dt = Config.DEFAULT_THRESHOLDS;
    db.prepare(`
      INSERT INTO threshold_config (
        machine_temp_min, machine_temp_max, machine_temp_warning, machine_temp_critical,
        ambient_temp_min, ambient_temp_max, ambient_temp_warning, ambient_temp_critical,
        normal_range_low, normal_range_high,
        vibration_min, vibration_max, vibration_warning, vibration_critical,
        rpm_min, rpm_max, rpm_warning, rpm_critical,
        pressure_min, pressure_max, pressure_warning, pressure_critical,
        current_min, current_max, voltage_min, voltage_max,
        consecutive_anomaly_threshold, is_active, updated_by, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      dt.machine_temp_min, dt.machine_temp_max, dt.machine_temp_warning, dt.machine_temp_critical,
      dt.ambient_temp_min, dt.ambient_temp_max, dt.ambient_temp_warning, dt.ambient_temp_critical,
      dt.normal_range_low, dt.normal_range_high,
      dt.vibration_min, dt.vibration_max, dt.vibration_warning, dt.vibration_critical,
      dt.rpm_min, dt.rpm_max, dt.rpm_warning, dt.rpm_critical,
      dt.pressure_min, dt.pressure_max, dt.pressure_warning, dt.pressure_critical,
      dt.current_min, dt.current_max, dt.voltage_min, dt.voltage_max,
      1, 1, 'SYSTEM', nowIso
    );
  }

  // Seed Default Email Config
  const emailCount = db.prepare('SELECT count(*) as count FROM email_config').get().count;
  if (emailCount === 0) {
    const nowIso = new Date().toISOString();
    const de = Config.DEFAULT_SMTP;
    db.prepare(`
      INSERT INTO email_config (
        alert_recipient_email, admin_email, customer_email,
        smtp_host, smtp_port, smtp_user, smtp_password, smtp_from,
        is_verified, is_enabled, updated_by, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      de.alert_recipient_email, de.admin_email, de.customer_email,
      de.smtp_host, de.smtp_port, de.smtp_user, de.smtp_password, de.smtp_from,
      0, 1, 'SYSTEM', nowIso
    );
  }

  // Seed Default ThingSpeak Config
  const tsCount = db.prepare('SELECT count(*) as count FROM thingspeak_config').get().count;
  if (tsCount === 0) {
    const nowIso = new Date().toISOString();
    db.prepare(`
      INSERT INTO thingspeak_config (
        channel_id, read_api_key, write_api_key, poll_interval_sec,
        freshness_limit_sec, data_source, field_mapping, is_enabled, updated_by, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      '2856402', 'L6S1O9G82Z83N3B7', '', 30,
      120, 'both',
      JSON.stringify({
        field1: 'temperature',
        field2: 'ambient_temperature',
        field3: 'vibration',
        field4: 'rpm',
        field5: 'pressure'
      }),
      0, 'SYSTEM', nowIso
    );
  }
}

export function logSystemEvent(level, module, message, details = '') {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO system_logs (timestamp, level, module, message, details)
      VALUES (?, ?, ?, ?, ?)
    `).run(new Date().toISOString(), level, module, message, typeof details === 'object' ? JSON.stringify(details) : String(details));
  } catch (err) {
    console.error(`[LOG ERROR] ${err.message}`);
  }
}

export function logAudit(dbOrNull, username, role, action, details = '') {
  try {
    const db = dbOrNull || getDb();
    db.prepare(`
      INSERT INTO audit_trail (timestamp, username, role, action, details)
      VALUES (?, ?, ?, ?, ?)
    `).run(new Date().toISOString(), username, role, action, typeof details === 'object' ? JSON.stringify(details) : String(details));
  } catch (err) {
    console.error(`[AUDIT ERROR] ${err.message}`);
  }
}
