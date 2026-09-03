import os
import json
import time
import datetime
from flask import Flask, request, jsonify, make_response
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename
import pandas as pd

from config import Config, BASE_DIR
from database import init_db, get_db_connection, log_system_event, log_audit
from statistics_engine import StatisticsEngine
from ingestion import load_excel_dataset, METADATA_CACHE
from ml_engine import ml_engine
from health_score_engine import HealthScoreEngine
from alert_engine import alert_engine
from thingspeak_service import thingspeak_service
from email_service import EmailService
from dataset_service import DatasetService
from auth import create_jwt_token, require_auth, require_admin

app = Flask(__name__)

# Uploads directory
UPLOAD_FOLDER = BASE_DIR / "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config["UPLOAD_FOLDER"] = str(UPLOAD_FOLDER)

# Native Zero-Dependency CORS Middleware
@app.after_request
def apply_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With"
    return response

@app.route("/", methods=["OPTIONS"])
@app.route("/api/<path:subpath>", methods=["OPTIONS"])
def handle_options(subpath=None):
    response = make_response()
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With"
    return response, 200

# Root Health Check
@app.route("/", methods=["GET"])
def index():
    return jsonify({
        "status": "online",
        "service": "Predictive Maintenance Full-Stack API",
        "machine": Config.MACHINE_NAME,
        "machine_id": Config.MACHINE_ID,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
    })

# ==========================================
# 1. AUTHENTICATION & USERS
# ==========================================

@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    username_or_email = data.get("username", "").strip()
    password = data.get("password", "")

    if not username_or_email or not password:
        return jsonify({"success": False, "error": "Username/Email and Password are required."}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT * FROM users WHERE username = ? OR email = ?;
    """, (username_or_email, username_or_email))
    user = cursor.fetchone()

    if not user or not check_password_hash(user["password_hash"], password):
        conn.close()
        return jsonify({"success": False, "error": "Invalid username/email or password."}), 401

    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    cursor.execute("UPDATE users SET last_login = ? WHERE id = ?;", (now_iso, user["id"]))
    conn.commit()

    user_dict = dict(user)
    token = create_jwt_token(user_dict)
    conn.close()

    log_audit(user["username"], user["role"], "LOGIN", "Successful user authentication.")

    return jsonify({
        "success": True,
        "token": token,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "email": user["email"],
            "role": user["role"],
            "full_name": user["full_name"],
            "last_login": now_iso
        }
    })

@app.route("/api/auth/me", methods=["GET"])
@require_auth
def get_current_user():
    user = request.current_user
    return jsonify({"success": True, "user": user})

@app.route("/api/auth/users", methods=["GET"])
@require_admin
def list_users():
    conn = get_db_connection()
    users = conn.execute("SELECT id, username, email, role, full_name, created_at, last_login FROM users;").fetchall()
    conn.close()
    return jsonify({"success": True, "users": [dict(u) for u in users]})

@app.route("/api/auth/users", methods=["POST"])
@require_admin
def create_user():
    data = request.get_json() or {}
    username = data.get("username", "").strip()
    email = data.get("email", "").strip()
    password = data.get("password", "")
    role = data.get("role", "customer").lower()
    full_name = data.get("full_name", "").strip()

    if not username or not email or not password or not full_name:
        return jsonify({"success": False, "error": "All fields are required."}), 400
    if role not in ["admin", "customer"]:
        return jsonify({"success": False, "error": "Role must be 'admin' or 'customer'."}), 400

    conn = get_db_connection()
    try:
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        pass_hash = generate_password_hash(password)
        conn.execute("""
        INSERT INTO users (username, email, password_hash, role, full_name, created_at)
        VALUES (?, ?, ?, ?, ?, ?);
        """, (username, email, pass_hash, role, full_name, now_iso))
        conn.commit()
        conn.close()
        log_audit(request.current_user["username"], "ADMIN", "CREATE_USER", f"Created user {username} with role {role}")
        return jsonify({"success": True, "message": f"User '{username}' created successfully."}), 201
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "error": f"Failed to create user: {str(e)}"}), 400

# ==========================================
# 2. SENSOR READINGS & REAL-TIME DATA
# ==========================================

@app.route("/api/readings/latest", methods=["GET"])
def get_latest_reading():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check data source preference
    cursor.execute("SELECT data_source FROM thingspeak_config WHERE is_enabled = 1 ORDER BY id DESC LIMIT 1;")
    ds_row = cursor.fetchone()
    ds_pref = ds_row["data_source"] if ds_row else "both"

    # Current monitoring reading:
    # both / thingspeak → latest live ThingSpeak row only (never last historical row)
    # dataset → latest historical row
    if ds_pref == "dataset":
        cursor.execute("SELECT * FROM readings WHERE is_live = 0 ORDER BY id DESC LIMIT 1;")
    else:
        cursor.execute(
            "SELECT * FROM readings WHERE is_live = 1 AND data_source = 'THINGSPEAK_LIVE' "
            "ORDER BY id DESC LIMIT 1;"
        )
    row = cursor.fetchone()
    
    # Get active thresholds
    cursor.execute("SELECT * FROM threshold_config WHERE is_active = 1 ORDER BY id DESC LIMIT 1;")
    t_row = cursor.fetchone()
    conn.close()

    thresh = dict(t_row) if t_row else {
        "machine_temp_warning": 52.29,
        "machine_temp_critical": 55.27,
        "normal_range_low": 34.61,
        "normal_range_high": 49.05,
        "consecutive_anomaly_threshold": 3
    }

    conn_info = thingspeak_service.get_connection_info()

    if not row:
        return jsonify({
            "success": True,
            "reading": None,
            "thresholds": thresh,
            "connection": conn_info,
            "dataSource": ds_pref
        })

    reading_dict = dict(row)
    machine_temp = reading_dict["temperature"]
    ambient_temp = reading_dict["ambient_temperature"]
    anomaly_score = reading_dict.get("anomaly_score", 0.0)

    # Calculate reactive Health Score
    health_data = HealthScoreEngine.calculate_health_score(
        temperature=machine_temp,
        deviation_from_normal=reading_dict.get("deviation_from_normal", 0.0),
        warning_threshold=thresh["machine_temp_warning"],
        critical_threshold=thresh["machine_temp_critical"],
        anomaly_score=anomaly_score,
        consecutive_anomalies=alert_engine.consecutive_anomaly_count,
        rate_of_change=reading_dict.get("rate_of_change", 0.0)
    )

    # Clean Normalized Output with DUAL TIMESTAMPS
    normalized_reading = {
        "id": reading_dict["id"],
        "entryId": reading_dict["entry_id"],
        "timestamp": reading_dict["created_at"],
        "thingspeakTimestamp": reading_dict.get("thingspeak_created_at") or reading_dict["created_at"],
        "fetchTimestamp": reading_dict.get("fetch_timestamp") or conn_info.get("lastSuccessfulFetch"),
        "machineTemperature": machine_temp,
        "ambientTemperature": ambient_temp,
        "temperatureDifference": reading_dict["temperature_difference"],
        "rollingMean10": reading_dict["rolling_mean_10"],
        "rollingStd10": reading_dict["rolling_std_10"],
        "rateOfChange": reading_dict["rate_of_change"],
        "temperatureTrend": reading_dict["temperature_trend"],
        "condition": reading_dict["condition"],
        "anomalyFlag": reading_dict["anomaly_flag"],
        "anomalyScore": anomaly_score,
        "rfProbability": reading_dict["rf_probability"],
        "xgbProbability": reading_dict["xgb_probability"],
        "svcProbability": reading_dict["svc_probability"],
        "finalPrediction": reading_dict["final_prediction"],
        "finalConfidence": reading_dict["final_confidence"],
        "isLive": bool(reading_dict["is_live"]),
        "dataSource": reading_dict.get("data_source", "HISTORICAL_DATASET"),
        "healthScore": health_data["health_score"],
        "healthStatus": health_data["status"],
        "healthCondition": health_data["condition"],
        "healthColor": health_data["color"],
        "consecutiveAnomalies": alert_engine.consecutive_anomaly_count
    }

    return jsonify({
        "success": True,
        "reading": normalized_reading,
        "thresholds": thresh,
        "connection": conn_info,
        "dataSource": ds_pref
    })

@app.route("/api/readings", methods=["GET"])
def get_readings():
    limit = int(request.args.get("limit", 100))
    offset = int(request.args.get("offset", 0))
    is_live_only = request.args.get("live_only", "false").lower() == "true"

    conn = get_db_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM readings WHERE 1=1"
    params = []

    if is_live_only:
        query += " AND is_live = 1"

    count_query = query.replace("SELECT *", "SELECT COUNT(*)")
    cursor.execute(count_query, params)
    total_count = cursor.fetchone()[0]

    query += " ORDER BY id DESC LIMIT ? OFFSET ?;"
    params.extend([limit, offset])

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    readings = []
    for r in rows:
        d = dict(r)
        readings.append({
            "id": d["id"],
            "entryId": d["entry_id"],
            "timestamp": d["created_at"],
            "thingspeakTimestamp": d.get("thingspeak_created_at") or d["created_at"],
            "fetchTimestamp": d.get("fetch_timestamp"),
            "machineTemperature": d["temperature"],
            "ambientTemperature": d["ambient_temperature"],
            "temperatureDifference": d["temperature_difference"],
            "rollingMean10": d["rolling_mean_10"],
            "rollingStd10": d["rolling_std_10"],
            "rateOfChange": d["rate_of_change"],
            "temperatureTrend": d["temperature_trend"],
            "condition": d["condition"],
            "anomalyFlag": d["anomaly_flag"],
            "anomalyScore": d["anomaly_score"],
            "finalPrediction": d["final_prediction"],
            "finalConfidence": d["final_confidence"],
            "isLive": bool(d["is_live"]),
            "dataSource": d.get("data_source", "HISTORICAL_DATASET")
        })

    return jsonify({
        "success": True,
        "total": total_count,
        "limit": limit,
        "offset": offset,
        "readings": readings
    })

@app.route("/api/readings/chart", methods=["GET"])
def get_chart_data():
    points = int(request.args.get("points", 150))
    range_filter = request.args.get("range", "100")

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM threshold_config WHERE is_active = 1 ORDER BY id DESC LIMIT 1;")
    t_row = cursor.fetchone()
    thresh = dict(t_row) if t_row else {
        "machine_temp_warning": 52.29,
        "machine_temp_critical": 55.27,
        "normal_range_low": 34.61,
        "normal_range_high": 49.05
    }

    if range_filter in ["15m", "1h", "6h", "24h", "7d"]:
        time_map = {"15m": 15*60, "1h": 3600, "6h": 6*3600, "24h": 24*3600, "7d": 7*24*3600}
        cutoff = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=time_map[range_filter])).timestamp()
        cursor.execute("""
        SELECT id, entry_id, created_at, thingspeak_created_at, fetch_timestamp, temperature, ambient_temperature, condition, anomaly_flag, data_source
        FROM readings WHERE created_timestamp >= ? ORDER BY id ASC;
        """, (cutoff,))
    else:
        num = int(range_filter) if range_filter.isdigit() else points
        cursor.execute("""
        SELECT * FROM (
            SELECT id, entry_id, created_at, thingspeak_created_at, fetch_timestamp, temperature, ambient_temperature, condition, anomaly_flag, data_source
            FROM readings ORDER BY id DESC LIMIT ?
        ) ORDER BY id ASC;
        """, (num,))

    rows = cursor.fetchall()
    conn.close()

    series = []
    for r in rows:
        d = dict(r)
        time_label = d["created_at"].split(" ")[-1] if " " in d["created_at"] else d["created_at"]
        series.append({
            "id": d["id"],
            "time": time_label,
            "fullTime": d["created_at"],
            "thingspeakTime": d.get("thingspeak_created_at") or d["created_at"],
            "machineTemperature": d["temperature"],
            "ambientTemperature": d["ambient_temperature"],
            "condition": d["condition"],
            "isAnomaly": d["anomaly_flag"] == 1,
            "dataSource": d.get("data_source", "HISTORICAL_DATASET"),
            "warningThreshold": thresh["machine_temp_warning"],
            "criticalThreshold": thresh["machine_temp_critical"],
            "normalRangeLow": thresh["normal_range_low"],
            "normalRangeHigh": thresh["normal_range_high"]
        })

    return jsonify({
        "success": True,
        "count": len(series),
        "thresholds": thresh,
        "series": series
    })

# ==========================================
# 3. THINGSPEAK CONFIG & DIAGNOSTICS
# ==========================================

@app.route("/api/thingspeak/config", methods=["GET"])
@require_admin
def get_thingspeak_config():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM thingspeak_config ORDER BY id DESC LIMIT 1;")
    row = cursor.fetchone()
    conn.close()

    if not row:
        return jsonify({"success": True, "config": {}})

    d = dict(row)
    # Mask read & write keys for secure transmission
    rk = d.get("read_api_key", "")
    wk = d.get("write_api_key", "")
    d["masked_read_api_key"] = f"{rk[:3]}••••••••{rk[-3:]}" if len(rk) >= 6 else ("••••••••" if rk else "")
    d["masked_write_api_key"] = "••••••••" if wk else ""
    del d["read_api_key"]
    del d["write_api_key"]

    return jsonify({"success": True, "config": d})

@app.route("/api/thingspeak/config", methods=["PUT"])
@require_admin
def update_thingspeak_config():
    data = request.get_json() or {}
    channel_id = str(data.get("channel_id", "")).strip()
    read_key = str(data.get("read_api_key", "")).strip()
    write_key = str(data.get("write_api_key", "")).strip()
    poll_int = int(data.get("poll_interval_sec", 30))
    fresh_limit = int(data.get("freshness_limit_sec", 120))
    data_src = str(data.get("data_source", "both")).lower()

    if not channel_id:
        return jsonify({"success": False, "error": "Channel ID is required."}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    
    # If read_key is masked or empty, preserve existing key from DB
    if not read_key or "••••" in read_key:
        cursor.execute("SELECT read_api_key FROM thingspeak_config WHERE is_enabled = 1 ORDER BY id DESC LIMIT 1;")
        prev = cursor.fetchone()
        read_key = prev["read_api_key"] if prev else ""

    if not write_key or "••••" in write_key:
        cursor.execute("SELECT write_api_key FROM thingspeak_config WHERE is_enabled = 1 ORDER BY id DESC LIMIT 1;")
        prev = cursor.fetchone()
        write_key = prev["write_api_key"] if prev else ""

    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    username = request.current_user.get("username", "ADMIN")

    cursor.execute("UPDATE thingspeak_config SET is_enabled = 0 WHERE is_enabled = 1;")
    cursor.execute("""
    INSERT INTO thingspeak_config (
        channel_id, read_api_key, write_api_key, poll_interval_sec, freshness_limit_sec, data_source, is_enabled, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?);
    """, (channel_id, read_key, write_key, poll_int, fresh_limit, data_src, username, now_iso))
    conn.commit()
    conn.close()

    log_audit(username, "ADMIN", "UPDATE_THINGSPEAK_CONFIG", f"Updated ThingSpeak Channel #{channel_id} (Poll: {poll_int}s, Freshness: {fresh_limit}s)")
    
    # Force immediate polling with new configuration
    thingspeak_service.poll_now()

    return jsonify({"success": True, "message": "ThingSpeak configuration updated successfully."})

@app.route("/api/thingspeak/test-connection", methods=["POST"])
@require_admin
def test_thingspeak_connection():
    data = request.get_json() or {}
    channel_id = str(data.get("channel_id", "")).strip()
    read_key = str(data.get("read_api_key", "")).strip()

    # If keys are masked or empty, pull from DB
    if not read_key or "••••" in read_key or not channel_id:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT channel_id, read_api_key FROM thingspeak_config WHERE is_enabled = 1 ORDER BY id DESC LIMIT 1;")
        curr = cursor.fetchone()
        conn.close()
        if curr:
            channel_id = channel_id or curr["channel_id"]
            read_key = curr["read_api_key"] if ("••••" in read_key or not read_key) else read_key

    res = thingspeak_service.test_connection(channel_id, read_key)
    return jsonify(res)

@app.route("/api/thingspeak/disconnect", methods=["POST"])
@require_admin
def disconnect_thingspeak():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE thingspeak_config SET is_enabled = 0 WHERE is_enabled = 1;")
    conn.commit()
    conn.close()
    username = request.current_user.get("username", "ADMIN")
    log_audit(username, "ADMIN", "DISCONNECT_THINGSPEAK", "Administrator disconnected ThingSpeak live polling.")
    res = thingspeak_service.disconnect()
    return jsonify({"success": True, **res})

@app.route("/api/thingspeak/refresh-now", methods=["POST"])
@require_auth
def refresh_thingspeak_now():
    res = thingspeak_service.poll_now()
    return jsonify({
        "success": True,
        "result": res,
        "connection": thingspeak_service.get_connection_info()
    })

@app.route("/api/thingspeak/status", methods=["GET"])
def get_thingspeak_status():
    return jsonify({
        "success": True,
        "connection": thingspeak_service.get_connection_info()
    })

@app.route("/api/thingspeak/write-test", methods=["POST"])
@require_admin
def write_thingspeak_test():
    data = request.get_json() or {}
    m_temp = float(data.get("machine_temperature", 42.5))
    a_temp = float(data.get("ambient_temperature", 36.5))
    res = thingspeak_service.write_to_thingspeak(m_temp, a_temp)
    return jsonify(res)

# ==========================================
# 4. EMAIL CONFIGURATION & DISPATCH
# ==========================================

@app.route("/api/email/config", methods=["GET"])
@require_admin
def get_email_config():
    cfg = EmailService.get_email_config()
    # Mask password for security
    masked_pw = "••••••••" if cfg.get("smtp_password") else ""
    cfg_safe = {**cfg, "smtp_password": masked_pw}
    return jsonify({"success": True, "config": cfg_safe})

@app.route("/api/email/config", methods=["PUT"])
@require_admin
def update_email_config():
    data = request.get_json() or {}
    alert_recip = str(data.get("alert_recipient_email", "")).strip()
    admin_em = str(data.get("admin_email", "")).strip()
    cust_em = str(data.get("customer_email", "")).strip()
    smtp_host = str(data.get("smtp_host", "")).strip()
    try:
        smtp_port = int(data.get("smtp_port", 587))
    except (ValueError, TypeError):
        return jsonify({"success": False, "error": "SMTP Port must be a valid integer number (e.g. 587 or 465)."}), 400

    smtp_user = str(data.get("smtp_user", "")).strip()
    smtp_pass = str(data.get("smtp_password", "")).strip()
    smtp_from = str(data.get("smtp_from", "alerts@predictive-maintenance.io")).strip()

    if not alert_recip or "@" not in alert_recip or "." not in alert_recip.split("@")[-1]:
        return jsonify({"success": False, "error": "A valid Alert Recipient Email is required (e.g. alerts@company.com)."}), 400

    if smtp_host and "@" in smtp_host:
        return jsonify({"success": False, "error": f"Invalid SMTP Host '{smtp_host}'. Must be an SMTP server hostname (such as 'smtp.gmail.com'), NOT an email address."}), 400

    if smtp_port < 1 or smtp_port > 65535:
        return jsonify({"success": False, "error": f"Invalid SMTP Port {smtp_port}. Valid port range is 1–65535 (typically 587 for STARTTLS or 465 for SSL)."}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    if not smtp_pass or "••••" in smtp_pass:
        cursor.execute("SELECT smtp_password FROM email_config WHERE is_enabled = 1 ORDER BY id DESC LIMIT 1;")
        prev = cursor.fetchone()
        smtp_pass = prev["smtp_password"] if prev else ""

    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    username = request.current_user.get("username", "ADMIN")

    cursor.execute("UPDATE email_config SET is_enabled = 0 WHERE is_enabled = 1;")
    cursor.execute("""
    INSERT INTO email_config (
        alert_recipient_email, admin_email, customer_email, smtp_host, smtp_port, smtp_user, smtp_password, smtp_from, is_enabled, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?);
    """, (alert_recip, admin_em, cust_em, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from, username, now_iso))
    conn.commit()
    conn.close()

    log_audit(username, "ADMIN", "UPDATE_EMAIL_CONFIG", f"Updated Alert Recipient Email to '{alert_recip}', SMTP host: '{smtp_host}'")
    return jsonify({"success": True, "message": "Email alert configuration saved successfully."})

@app.route("/api/system/test-email", methods=["POST"])
@require_admin
def send_diagnostic_test_email():
    cfg = EmailService.get_email_config()
    recip = cfg.get("alert_recipient_email") or "alerts@predictive-maintenance.io"
    
    test_alert = {
        "alert_id": f"TEST-DIAG-{datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d')}-{os.urandom(2).hex().upper()}",
        "timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        "thingspeak_timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        "severity": "CRITICAL",
        "machine_temperature": 57.8,
        "ambient_temperature": 37.2,
        "threshold_value": 55.27,
        "warning_threshold": 52.29,
        "normal_range": "34.61 – 49.05 °C",
        "consecutive_count": 3,
        "anomaly_score": 0.7245,
        "health_score": 42.5,
        "entry_id": 9999,
        "trigger_reason": f"DIAGNOSTIC TEST: Manual SMTP test alert email triggered by Administrator '{request.current_user.get('username', 'ADMIN')}'.",
        "recommended_action": "Verify email recipient inbox receipt and automated alert routing."
    }
    res = EmailService.send_alert_email(test_alert)
    if res.get("status") != "SENT":
        return jsonify({
            "success": False,
            "sent": False,
            "error": res.get("message") or "Email delivery failed.",
            "message": res.get("message") or "Email delivery failed.",
            "error_code": res.get("error_code") or "SMTP_FAILED",
            **res
        }), 400
    return jsonify({
        "success": True,
        "sent": True,
        "message": res.get("message") or "Test email sent successfully",
        **res
    })

# ==========================================
# 5. DATASET UPLOAD & MANAGEMENT
# ==========================================

@app.route("/api/dataset/upload-validate", methods=["POST"])
@require_admin
def upload_and_validate_dataset():
    if "file" not in request.files:
        return jsonify({"success": False, "error": "No file uploaded."}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"success": False, "error": "No selected file."}), 400

    filename = secure_filename(file.filename)
    if not (filename.endswith(".xlsx") or filename.endswith(".xls") or filename.endswith(".csv")):
        return jsonify({"success": False, "error": "Only .xlsx, .xls, and .csv files are supported."}), 400

    save_path = os.path.join(app.config["UPLOAD_FOLDER"], f"{int(time.time())}_{filename}")
    file.save(save_path)

    val_result = DatasetService.inspect_and_validate_file(save_path, filename)
    val_result["tempFilePath"] = save_path
    return jsonify(val_result)

@app.route("/api/dataset/import", methods=["POST"])
@require_admin
def import_dataset():
    data = request.get_json() or {}
    temp_path = data.get("tempFilePath")
    filename = data.get("filename", "uploaded_dataset.xlsx")

    if not temp_path or not os.path.exists(temp_path):
        return jsonify({"success": False, "error": "Temporary upload file not found. Please re-upload."}), 400

    res = DatasetService.import_validated_dataset(temp_path, filename)
    if res.get("success"):
        log_audit(request.current_user.get("username", "ADMIN"), "ADMIN", "IMPORT_DATASET", f"Imported {res.get('importedRows')} rows from {filename}")
    return jsonify(res)

@app.route("/api/dataset/current", methods=["GET"])
@require_admin
def get_current_dataset_info():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM uploaded_datasets WHERE is_active = 1 ORDER BY id DESC LIMIT 1;")
    active = cursor.fetchone()
    cursor.execute("SELECT COUNT(*) FROM readings WHERE is_live = 0 OR data_source != 'THINGSPEAK_LIVE';")
    hist_count = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM readings WHERE is_live = 1 AND data_source = 'THINGSPEAK_LIVE';")
    live_count = cursor.fetchone()[0]
    conn.close()

    return jsonify({
        "success": True,
        "activeDataset": dict(active) if active else {
            "filename": "PREDICTIVE_MAINTENANCE_FINAL_3150.xlsx (Default)",
            "row_count": hist_count or 3150,
            "column_count": 29,
            "quality_score": 100.0,
            "upload_date": "Initial Reference Ingestion"
        },
        "historicalRecords": hist_count,
        "liveRecords": live_count
    })

# ==========================================
# 6. DEMO / SIMULATION TEST ALERT (DEV ONLY)
# ==========================================

@app.route("/api/simulate-alert-demo", methods=["POST"])
@app.route("/api/thingspeak/inject-test-anomalies", methods=["POST"])
@require_admin
def simulate_alert_demo():
    """DEVELOPMENT TEST ONLY: Triggers a simulated 3-anomaly alert flow without affecting ThingSpeak data"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM threshold_config WHERE is_active = 1 ORDER BY id DESC LIMIT 1;")
    t_row = cursor.fetchone()
    cursor.execute("SELECT * FROM threshold_config WHERE id = (SELECT MIN(id) FROM threshold_config);")
    baseline_row = cursor.fetchone()
    conn.close()

    thresh = dict(t_row) if t_row else {}
    crit_thresh = thresh.get("machine_temp_critical", 55.27)
    warn_thresh = thresh.get("machine_temp_warning", 52.29)
    norm_low = thresh.get("normal_range_low", 34.61)
    norm_high = thresh.get("normal_range_high", 49.05)

    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    alert_id = f"ALT-DEMO-{datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d')}-{os.urandom(3).hex().upper()}"

    # Use real threshold values in the simulated alert
    sim_temp = round(crit_thresh + 3.63, 2)   # slightly above critical
    sim_ambient = 37.4
    sim_health = 38.5

    alert_payload = {
        "alert_id": alert_id,
        "timestamp": now_iso,
        "thingspeak_timestamp": now_iso,
        "severity": "CRITICAL",
        "machine_temperature": sim_temp,
        "ambient_temperature": sim_ambient,
        "threshold_value": crit_thresh,
        "warning_threshold": warn_thresh,
        "normal_range": f"{norm_low} – {norm_high} °C",
        "consecutive_count": 3,
        "anomaly_score": 0.7450,
        "health_score": sim_health,
        "entry_id": 99999,
        "trigger_reason": f"DEVELOPMENT TEST ONLY: Simulated 3 consecutive abnormal temperature readings (Temp: {sim_temp}°C, Threshold: {crit_thresh}°C).",
        "recommended_action": "Verify dashboard alert indicators, audio/visual alerts, and recipient email notifications."
    }

    # Store in database
    conn = get_db_connection()
    try:
        conn.execute("""
        INSERT INTO alerts (
            alert_id, timestamp, severity, machine_temperature, ambient_temperature,
            threshold_value, consecutive_count, health_score, trigger_reason,
            recommended_action, status, email_sent, email_status
        ) VALUES (?, ?, 'CRITICAL', ?, ?, ?, 3, ?, ?, ?, 'ACTIVE', 1, 'PROCESSING');
        """, (alert_id, now_iso, sim_temp, sim_ambient, crit_thresh, sim_health,
              alert_payload["trigger_reason"], alert_payload["recommended_action"]))
        conn.commit()
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "error": f"Failed to store demo alert: {str(e)}"}), 500
    conn.close()

    # Dispatch email
    email_res = EmailService.send_alert_email(alert_payload)

    conn = get_db_connection()
    conn.execute("UPDATE alerts SET email_status = ? WHERE alert_id = ?;", (email_res.get("status", "SENT"), alert_id))
    conn.commit()
    conn.close()

    log_audit(request.current_user.get("username", "ADMIN"), "ADMIN", "SIMULATE_TEST_ALERT",
              f"Triggered development test alert {alert_id} (Simulated Temp: {sim_temp}°C)")
    return jsonify({
        "success": True,
        "alertId": alert_id,
        "simulatedTemperature": sim_temp,
        "criticalThreshold": crit_thresh,
        "emailResult": email_res,
        "message": "DEVELOPMENT TEST ALERT triggered successfully! Email dispatched to configured recipients."
    })

# ==========================================
# 7. REMAINING ANALYTICS & ALERTS API ROUTES
# ==========================================

@app.route("/api/statistics", methods=["GET"])
def get_statistics():
    cached_stats = METADATA_CACHE.get("dataset_statistics")
    if not cached_stats:
        conn = get_db_connection()
        df = pd.read_sql_query("SELECT * FROM readings WHERE is_live = 0;", conn)
        conn.close()
        if len(df) > 0:
            cached_stats = StatisticsEngine.compute_full_dataset_analytics(df)
            METADATA_CACHE["dataset_statistics"] = cached_stats

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM threshold_config WHERE is_active = 1 ORDER BY id DESC LIMIT 1;")
    t_row = cursor.fetchone()
    conn.close()

    return jsonify({
        "success": True,
        "statistics": cached_stats,
        "active_thresholds": dict(t_row) if t_row else None
    })

@app.route("/api/anomalies", methods=["GET"])
def get_anomalies():
    limit = int(request.args.get("limit", 50))
    offset = int(request.args.get("offset", 0))
    min_temp = float(request.args.get("min_temp", 0.0))
    max_temp = float(request.args.get("max_temp", 200.0))

    conn = get_db_connection()
    cursor = conn.cursor()
    query = "SELECT * FROM readings WHERE anomaly_flag = 1 AND temperature >= ? AND temperature <= ?"
    params = [min_temp, max_temp]

    count_query = query.replace("SELECT *", "SELECT COUNT(*)")
    cursor.execute(count_query, params)
    total_count = cursor.fetchone()[0]

    query += " ORDER BY id DESC LIMIT ? OFFSET ?;"
    params.extend([limit, offset])
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    anomalies = [dict(r) for r in rows]
    return jsonify({"success": True, "total": total_count, "anomalies": anomalies})

@app.route("/api/alerts", methods=["GET"])
def get_alerts():
    status = request.args.get("status", "all")
    severity = request.args.get("severity", "all")
    limit = int(request.args.get("limit", 50))

    conn = get_db_connection()
    cursor = conn.cursor()
    query = "SELECT * FROM alerts WHERE 1=1"
    params = []

    if status != "all":
        query += " AND status = ?"
        params.append(status)
    if severity != "all":
        query += " AND severity = ?"
        params.append(severity)

    query += " ORDER BY id DESC LIMIT ?;"
    params.append(limit)

    cursor.execute(query, params)
    rows = cursor.fetchall()

    cursor.execute("SELECT status, COUNT(*) FROM alerts GROUP BY status;")
    status_counts = dict(cursor.fetchall())
    conn.close()

    alerts = []
    for r in rows:
        d = dict(r)
        alerts.append({
            "id": d["id"],
            "alertId": d["alert_id"],
            "timestamp": d["timestamp"],
            "thingspeakTimestamp": d.get("thingspeak_timestamp") or d["timestamp"],
            "severity": d["severity"],
            "machineTemperature": d["machine_temperature"],
            "ambientTemperature": d["ambient_temperature"],
            "thresholdValue": d["threshold_value"],
            "consecutiveCount": d["consecutive_count"],
            "healthScore": d["health_score"],
            "anomalyScore": d.get("anomaly_score", 0.0),
            "entryId": d.get("entry_id"),
            "triggerReason": d["trigger_reason"],
            "recommendedAction": d["recommended_action"],
            "status": d["status"],
            "acknowledgedBy": d["acknowledged_by"],
            "acknowledgedAt": d["acknowledged_at"],
            "resolvedBy": d["resolved_by"],
            "resolvedAt": d["resolved_at"],
            "resolutionNotes": d["resolution_notes"],
            "emailStatus": d["email_status"]
        })

    return jsonify({
        "success": True,
        "counts": {
            "active": status_counts.get("ACTIVE", 0),
            "acknowledged": status_counts.get("ACKNOWLEDGED", 0),
            "resolved": status_counts.get("RESOLVED", 0),
            "total": sum(status_counts.values())
        },
        "alerts": alerts
    })

@app.route("/api/alerts/<alert_id>/acknowledge", methods=["POST"])
@require_auth
def acknowledge_alert(alert_id):
    username = request.current_user.get("username", "Operator")
    success = alert_engine.acknowledge_alert(alert_id, username)
    if success:
        return jsonify({"success": True, "message": f"Alert {alert_id} acknowledged by {username}."})
    return jsonify({"success": False, "error": f"Alert {alert_id} not found or already acknowledged."}), 400

@app.route("/api/alerts/<alert_id>/resolve", methods=["POST"])
@require_auth
def resolve_alert(alert_id):
    username = request.current_user.get("username", "Engineer")
    data = request.get_json() or {}
    notes = data.get("notes", "Routine inspection performed; parameters normal.")
    success = alert_engine.resolve_alert(alert_id, username, notes)
    if success:
        return jsonify({"success": True, "message": f"Alert {alert_id} resolved by {username}."})
    return jsonify({"success": False, "error": f"Alert {alert_id} not found."}), 400

@app.route("/api/health", methods=["GET"])
def get_machine_health():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM readings WHERE is_live = 1 AND data_source = 'THINGSPEAK_LIVE' "
        "ORDER BY id DESC LIMIT 1;"
    )
    last_r = cursor.fetchone()
    cursor.execute("SELECT * FROM threshold_config WHERE is_active = 1 ORDER BY id DESC LIMIT 1;")
    t_row = cursor.fetchone()
    conn.close()

    thresh = dict(t_row) if t_row else {
        "machine_temp_warning": 52.29,
        "machine_temp_critical": 55.27,
        "normal_range_low": 34.61,
        "normal_range_high": 49.05
    }

    if not last_r:
        return jsonify({
            "success": True,
            "machine": {"id": Config.MACHINE_ID, "name": Config.MACHINE_NAME, "location": Config.LOCATION},
            "health": None,
            "consecutiveAnomalies": alert_engine.consecutive_anomaly_count,
            "message": "No live ThingSpeak reading yet. Health is not assumed to be 100."
        })

    r_dict = dict(last_r)
    current_health = HealthScoreEngine.calculate_health_score(
        temperature=r_dict["temperature"],
        deviation_from_normal=r_dict.get("deviation_from_normal", 0.0),
        warning_threshold=thresh["machine_temp_warning"],
        critical_threshold=thresh["machine_temp_critical"],
        anomaly_score=r_dict.get("anomaly_score", 0.0),
        consecutive_anomalies=alert_engine.consecutive_anomaly_count,
        rate_of_change=r_dict.get("rate_of_change", 0.0)
    )

    return jsonify({
        "success": True,
        "machine": {"id": Config.MACHINE_ID, "name": Config.MACHINE_NAME, "location": Config.LOCATION},
        "health": current_health,
        "consecutiveAnomalies": alert_engine.consecutive_anomaly_count
    })

@app.route("/api/thresholds", methods=["GET"])
def get_thresholds():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM threshold_config WHERE is_active = 1 ORDER BY id DESC LIMIT 1;")
    active = cursor.fetchone()
    cursor.execute("SELECT * FROM threshold_config WHERE updated_by = 'CALCULATED_DEFAULT' ORDER BY id ASC LIMIT 1;")
    baseline = cursor.fetchone()
    conn.close()

    return jsonify({
        "success": True,
        "active": dict(active) if active else None,
        "baseline_calculated": dict(baseline) if baseline else None
    })

@app.route("/api/thresholds", methods=["PUT"])
@require_admin
def update_thresholds():
    data = request.get_json() or {}
    mach_warn = float(data.get("machine_temp_warning", 52.29))
    mach_crit = float(data.get("machine_temp_critical", 55.27))
    amb_warn = float(data.get("ambient_temp_warning", 40.69))
    amb_crit = float(data.get("ambient_temp_critical", 42.06))
    norm_low = float(data.get("normal_range_low", 34.61))
    norm_high = float(data.get("normal_range_high", 49.05))
    consec_limit = int(data.get("consecutive_anomaly_threshold", 3))

    if mach_warn >= mach_crit:
        return jsonify({"success": False, "error": "Machine Temperature Warning Threshold must be strictly less than Critical Threshold."}), 400
    if norm_low >= norm_high:
        return jsonify({"success": False, "error": "Normal Range Low must be strictly less than Normal Range High."}), 400

    username = request.current_user.get("username", "ADMIN")
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE threshold_config SET is_active = 0 WHERE is_active = 1;")
    cursor.execute("""
    INSERT INTO threshold_config (
        machine_temp_warning, machine_temp_critical, ambient_temp_warning,
        ambient_temp_critical, normal_range_low, normal_range_high,
        consecutive_anomaly_threshold, is_active, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?);
    """, (mach_warn, mach_crit, amb_warn, amb_crit, norm_low, norm_high, consec_limit, username, now_iso))
    conn.commit()
    conn.close()

    log_audit(username, "ADMIN", "UPDATE_THRESHOLDS", f"Updated thresholds: Warning={mach_warn}°C, Critical={mach_crit}°C")
    return jsonify({"success": True, "message": "Threshold configuration updated successfully."})

@app.route("/api/thresholds/reset", methods=["POST"])
@require_admin
def reset_thresholds():
    stats_data = METADATA_CACHE.get("dataset_statistics", {})
    mach_stats = stats_data.get("machine_temperature", {})
    amb_stats = stats_data.get("ambient_temperature", {})

    mach_warn = mach_stats.get("warning_threshold", 52.29)
    mach_crit = mach_stats.get("critical_threshold", 55.27)
    amb_warn = amb_stats.get("warning_threshold", 40.69)
    amb_crit = amb_stats.get("critical_threshold", 42.06)
    norm_low = mach_stats.get("normal_range_low", 34.61)
    norm_high = mach_stats.get("normal_range_high", 49.05)

    username = request.current_user.get("username", "ADMIN")
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE threshold_config SET is_active = 0 WHERE is_active = 1;")
    cursor.execute("""
    INSERT INTO threshold_config (
        machine_temp_warning, machine_temp_critical, ambient_temp_warning,
        ambient_temp_critical, normal_range_low, normal_range_high,
        consecutive_anomaly_threshold, is_active, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 3, 1, 'RESET_TO_CALCULATED_DEFAULT', ?);
    """, (mach_warn, mach_crit, amb_warn, amb_crit, norm_low, norm_high, now_iso))
    conn.commit()
    conn.close()

    log_audit(username, "ADMIN", "RESET_THRESHOLDS", "Reset thresholds to statistical defaults.")
    return jsonify({"success": True, "message": "Thresholds reset to calculated statistical defaults."})

@app.route("/api/models", methods=["GET"])
def get_model_performance():
    return jsonify({
        "success": True,
        "models": METADATA_CACHE.get("model_performance", []),
        "feature_importance": METADATA_CACHE.get("feature_importance", []),
        "anomaly_summary": METADATA_CACHE.get("anomaly_summary", []),
        "data_dictionary": METADATA_CACHE.get("data_dictionary", [])
    })

@app.route("/api/shap", methods=["GET"])
def get_shap_analysis():
    return jsonify({
        "success": True,
        "shap_summary": METADATA_CACHE.get("shap_summary", []),
        "feature_importance": METADATA_CACHE.get("feature_importance", [])
    })

@app.route("/api/shap/explain", methods=["POST"])
def explain_reading():
    data = request.get_json() or {}
    temp = float(data.get("temperature", 42.5))
    ambient = float(data.get("ambient_temperature", 36.5))
    features = ml_engine.extract_features_for_reading(temp, ambient)
    prediction = ml_engine.predict_live_reading(features)
    return jsonify({"success": True, "prediction": prediction})

@app.route("/api/system/health", methods=["GET"])
def get_system_health():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM readings WHERE is_live = 0 OR IFNULL(data_source,'') != 'THINGSPEAK_LIVE';")
    hist_readings = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM readings WHERE is_live = 1 AND data_source = 'THINGSPEAK_LIVE';")
    live_readings = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM alerts WHERE status = 'ACTIVE';")
    active_alerts = cursor.fetchone()[0]
    conn.close()

    ts_conn = thingspeak_service.get_connection_info()
    email_cfg = EmailService.get_email_config()

    return jsonify({
        "success": True,
        "system": {
            "backend": "ONLINE",
            "database": "CONNECTED",
            "database_type": "SQLite 3 (WAL Mode)",
            "historical_readings": hist_readings,
            "live_readings": live_readings,
            "total_readings": hist_readings + live_readings,
            "active_alerts": active_alerts,
            "machine_id": Config.MACHINE_ID,
            "machine_name": Config.MACHINE_NAME,
            "ml_models_ready": ml_engine.is_trained
        },
        "thingspeak": ts_conn,
        "email": {
            "configured": bool(email_cfg.get("smtp_host") and email_cfg.get("smtp_user")),
            "alert_recipient_email": email_cfg.get("alert_recipient_email"),
            "smtp_host": email_cfg.get("smtp_host") or "Simulated/Database Logged Mode"
        }
    })

@app.route("/api/system/logs", methods=["GET"])
@require_admin
def get_system_logs():
    limit = int(request.args.get("limit", 50))
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM system_logs ORDER BY id DESC LIMIT ?;", (limit,))
    sys_logs = [dict(r) for r in cursor.fetchall()]
    cursor.execute("SELECT * FROM email_logs ORDER BY id DESC LIMIT ?;", (limit,))
    email_logs = [dict(r) for r in cursor.fetchall()]
    cursor.execute("SELECT * FROM audit_trail ORDER BY id DESC LIMIT ?;", (limit,))
    audit_logs = [dict(r) for r in cursor.fetchall()]
    conn.close()

    return jsonify({
        "success": True,
        "system_logs": sys_logs,
        "email_logs": email_logs,
        "audit_logs": audit_logs
    })

# ==========================================
# APPLICATION STARTUP LIFECYCLE
# ==========================================

def initialize_application():
    print("=" * 60)
    print("STARTING INDUSTRY 4.0 PREDICTIVE MAINTENANCE PLATFORM")
    print("=" * 60)
    init_db()
    cleaned_df = load_excel_dataset()
    if cleaned_df is not None:
        ml_engine.train_models(cleaned_df)
    thingspeak_service.start_service()
    print("Application initialization complete. Ready to serve traffic.")
    print("=" * 60)

initialize_application()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=Config.PORT, debug=False)
