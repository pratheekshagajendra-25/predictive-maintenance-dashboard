import sqlite3
import datetime
import json
from werkzeug.security import generate_password_hash
from config import Config

def get_db_connection():
    conn = sqlite3.connect(Config.DATABASE_PATH, timeout=20.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Users Table
    cursor.execute("""
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
    """)

    # Readings Table (Normalized sensor readings & ML features)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_id INTEGER,
        created_at TEXT NOT NULL,
        thingspeak_created_at TEXT,
        fetch_timestamp TEXT,
        temperature REAL NOT NULL,
        ambient_temperature REAL NOT NULL,
        temperature_difference REAL,
        rolling_mean_10 REAL,
        rolling_median_10 REAL,
        rolling_std_10 REAL,
        rate_of_change REAL,
        temperature_trend TEXT,
        deviation_from_normal REAL,
        local_z_score REAL,
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
        is_live INTEGER DEFAULT 0,
        data_source TEXT DEFAULT 'HISTORICAL_DATASET',
        created_timestamp REAL NOT NULL
    );
    """)

    # ── Schema migrations: add any columns that may be missing from older DBs ──
    existing_cols = {row[1] for row in cursor.execute("PRAGMA table_info(readings);")}
    migration_cols = {
        "thingspeak_created_at": "ALTER TABLE readings ADD COLUMN thingspeak_created_at TEXT;",
        "fetch_timestamp":        "ALTER TABLE readings ADD COLUMN fetch_timestamp TEXT;",
        "rolling_median_10":      "ALTER TABLE readings ADD COLUMN rolling_median_10 REAL;",
        "isolation_forest_prediction": "ALTER TABLE readings ADD COLUMN isolation_forest_prediction INTEGER DEFAULT 1;",
        "isolation_forest_score": "ALTER TABLE readings ADD COLUMN isolation_forest_score REAL DEFAULT 0.0;",
        "is_live":       "ALTER TABLE readings ADD COLUMN is_live INTEGER DEFAULT 0;",
        "data_source":   "ALTER TABLE readings ADD COLUMN data_source TEXT DEFAULT 'HISTORICAL_DATASET';",
        "created_timestamp": "ALTER TABLE readings ADD COLUMN created_timestamp REAL NOT NULL DEFAULT 0;",
        "detection_method": "ALTER TABLE readings ADD COLUMN detection_method TEXT DEFAULT '';",
        "health_score": "ALTER TABLE readings ADD COLUMN health_score REAL;",
    }
    for col, sql in migration_cols.items():
        if col not in existing_cols:
            cursor.execute(sql)
            print(f"  [DB MIGRATION] Added column 'readings.{col}'")

    # Migrate alerts table too
    alert_cols = {row[1] for row in cursor.execute("PRAGMA table_info(alerts);")}
    alert_migrations = {
        "thingspeak_timestamp": "ALTER TABLE alerts ADD COLUMN thingspeak_timestamp TEXT;",
        "anomaly_score":        "ALTER TABLE alerts ADD COLUMN anomaly_score REAL DEFAULT 0.0;",
        "entry_id":             "ALTER TABLE alerts ADD COLUMN entry_id INTEGER;",
        "email_recipient":      "ALTER TABLE alerts ADD COLUMN email_recipient TEXT;",
        "detection_method":     "ALTER TABLE alerts ADD COLUMN detection_method TEXT DEFAULT '';",
    }
    for col, sql in alert_migrations.items():
        if col not in alert_cols:
            cursor.execute(sql)
            print(f"  [DB MIGRATION] Added column 'alerts.{col}'")

    # Create Indexes for fast querying
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_readings_entry_id ON readings(entry_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_readings_created_at ON readings(created_at);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_readings_is_live ON readings(is_live);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_readings_data_source ON readings(data_source);")
    try:
        cursor.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_readings_live_entry_id
            ON readings(entry_id) WHERE is_live = 1 AND entry_id IS NOT NULL;
        """)
    except Exception as e:
        print(f"  [DB] Unique live entry_id index skipped: {e}")

    # Alerts Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        alert_id TEXT UNIQUE NOT NULL,
        timestamp TEXT NOT NULL,
        thingspeak_timestamp TEXT,
        severity TEXT NOT NULL, -- 'CRITICAL', 'WARNING', 'INFO'
        machine_temperature REAL NOT NULL,
        ambient_temperature REAL NOT NULL,
        threshold_value REAL NOT NULL,
        consecutive_count INTEGER NOT NULL,
        health_score REAL NOT NULL,
        anomaly_score REAL DEFAULT 0.0,
        entry_id INTEGER,
        trigger_reason TEXT NOT NULL,
        recommended_action TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'
        acknowledged_by TEXT,
        acknowledged_at TEXT,
        resolved_by TEXT,
        resolved_at TEXT,
        resolution_notes TEXT,
        email_sent INTEGER DEFAULT 0,
        email_status TEXT DEFAULT 'PENDING',
        email_recipient TEXT
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp);")

    # Threshold Configuration Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS threshold_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        machine_temp_warning REAL NOT NULL,
        machine_temp_critical REAL NOT NULL,
        ambient_temp_warning REAL NOT NULL,
        ambient_temp_critical REAL NOT NULL,
        normal_range_low REAL NOT NULL,
        normal_range_high REAL NOT NULL,
        consecutive_anomaly_threshold INTEGER NOT NULL DEFAULT 3,
        is_active INTEGER NOT NULL DEFAULT 1,
        updated_by TEXT DEFAULT 'SYSTEM',
        updated_at TEXT NOT NULL
    );
    """)

    # ThingSpeak Configuration Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS thingspeak_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id TEXT NOT NULL,
        read_api_key TEXT NOT NULL,
        write_api_key TEXT DEFAULT '',
        poll_interval_sec INTEGER NOT NULL DEFAULT 30,
        freshness_limit_sec INTEGER NOT NULL DEFAULT 120,
        data_source TEXT NOT NULL DEFAULT 'both', -- 'thingspeak', 'dataset', 'both'
        is_enabled INTEGER NOT NULL DEFAULT 1,
        updated_by TEXT DEFAULT 'ADMIN',
        updated_at TEXT NOT NULL
    );
    """)

    # Email Alert Configuration Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS email_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        alert_recipient_email TEXT NOT NULL,
        admin_email TEXT NOT NULL,
        customer_email TEXT NOT NULL,
        smtp_host TEXT DEFAULT '',
        smtp_port INTEGER DEFAULT 587,
        smtp_user TEXT DEFAULT '',
        smtp_password TEXT DEFAULT '',
        smtp_from TEXT DEFAULT 'alerts@predictive-maintenance.io',
        is_enabled INTEGER NOT NULL DEFAULT 1,
        updated_by TEXT DEFAULT 'ADMIN',
        updated_at TEXT NOT NULL
    );
    """)

    # Uploaded Datasets Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS uploaded_datasets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        file_path TEXT NOT NULL,
        row_count INTEGER NOT NULL,
        column_count INTEGER NOT NULL,
        quality_score REAL DEFAULT 100.0,
        mapping_info TEXT,
        validation_summary TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        uploaded_by TEXT DEFAULT 'ADMIN',
        uploaded_at TEXT NOT NULL
    );
    """)

    # System Logs Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS system_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        level TEXT NOT NULL, -- 'INFO', 'WARNING', 'ERROR'
        module TEXT NOT NULL,
        message TEXT NOT NULL,
        details TEXT
    );
    """)

    # Email Logs Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS email_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        recipient TEXT NOT NULL,
        subject TEXT NOT NULL,
        severity TEXT NOT NULL,
        status TEXT NOT NULL, -- 'SENT', 'FAILED', 'SIMULATED'
        error_message TEXT,
        email_body TEXT
    );
    """)

    # Audit Trail Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS audit_trail (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        username TEXT NOT NULL,
        role TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT
    );
    """)

    # Seed Default Users if empty
    cursor.execute("SELECT COUNT(*) FROM users;")
    if cursor.fetchone()[0] == 0:
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        admin_pass = generate_password_hash("Admin@12345")
        customer_pass = generate_password_hash("Customer@12345")
        
        cursor.execute("""
        INSERT INTO users (username, email, password_hash, role, full_name, created_at)
        VALUES 
        ('admin', 'admin@maintenance.io', ?, 'admin', 'Lead Maintenance Engineer (Admin)', ?),
        ('customer', 'operator@client.com', ?, 'customer', 'Facility Plant Operator (Customer)', ?);
        """, (admin_pass, now, customer_pass, now))

    # Seed Default ThingSpeak Config if empty
    cursor.execute("SELECT COUNT(*) FROM thingspeak_config;")
    if cursor.fetchone()[0] == 0:
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        # Only enable if a real channel_id was provided in .env
        ts_enabled = 1 if Config.THING_SPEAK_CHANNEL_ID else 0
        cursor.execute("""
        INSERT INTO thingspeak_config (
            channel_id, read_api_key, write_api_key, poll_interval_sec, freshness_limit_sec, data_source, is_enabled, updated_by, updated_at
        ) VALUES (?, ?, ?, 30, 120, 'both', ?, 'SYSTEM', ?);
        """, (Config.THING_SPEAK_CHANNEL_ID or '', Config.THING_SPEAK_READ_API_KEY or '', Config.THING_SPEAK_WRITE_API_KEY or '', ts_enabled, now))

    # Seed Default Email Config if empty
    cursor.execute("SELECT COUNT(*) FROM email_config;")
    if cursor.fetchone()[0] == 0:
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        cursor.execute("""
        INSERT INTO email_config (
            alert_recipient_email, admin_email, customer_email, smtp_host, smtp_port, smtp_user, smtp_password, smtp_from, is_enabled, updated_by, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'SYSTEM', ?);
        """, (
            Config.ADMIN_EMAIL, Config.ADMIN_EMAIL, Config.CUSTOMER_EMAIL,
            Config.SMTP_HOST, Config.SMTP_PORT, Config.SMTP_USER, Config.SMTP_PASSWORD, Config.SMTP_FROM, now
        ))

    conn.commit()
    conn.close()

def log_system_event(level, module, message, details=None):
    try:
        conn = get_db_connection()
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        details_str = json.dumps(details) if isinstance(details, (dict, list)) else (details or "")
        conn.execute(
            "INSERT INTO system_logs (timestamp, level, module, message, details) VALUES (?, ?, ?, ?, ?)",
            (now, level, module, message, details_str)
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error logging system event: {e}")

def log_audit(username, role, action, details=""):
    try:
        conn = get_db_connection()
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        conn.execute(
            "INSERT INTO audit_trail (timestamp, username, role, action, details) VALUES (?, ?, ?, ?, ?)",
            (now, username, role, action, details)
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error logging audit trail: {e}")
