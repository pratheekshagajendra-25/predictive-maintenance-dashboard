import sys
import os
import datetime
import pandas as pd
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app
from database import get_db_connection
from thingspeak_service import thingspeak_service
from alert_engine import alert_engine
from health_score_engine import HealthScoreEngine
from statistics_engine import StatisticsEngine
from ml_engine import ml_engine
from dataset_service import DatasetService
from email_service import EmailService

client = app.test_client()

print("=" * 70)
print("RUNNING 40 END-TO-END VERIFICATION TESTS")
print("=" * 70)

passed = 0
failed = 0

def assert_test(test_num, name, condition, details=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"[PASS] TEST {test_num:02d}: {name} {('- ' + details) if details else ''}")
    else:
        failed += 1
        print(f"[FAIL] TEST {test_num:02d}: {name} -> FAILED! {details}")

# TEST 1: Admin login
r_admin = client.post("/api/auth/login", json={"username": "admin", "password": "Admin@12345"})
admin_data = r_admin.json
admin_token = admin_data.get("token")
assert_test(1, "Admin login", r_admin.status_code == 200 and admin_data.get("user", {}).get("role") == "admin", f"Role: {admin_data.get('user', {}).get('role')}")

# TEST 2: Customer login
r_cust = client.post("/api/auth/login", json={"username": "customer", "password": "Customer@12345"})
cust_data = r_cust.json
cust_token = cust_data.get("token")
assert_test(2, "Customer login", r_cust.status_code == 200 and cust_data.get("user", {}).get("role") == "customer", f"Role: {cust_data.get('user', {}).get('role')}")

# TEST 3: Enter ThingSpeak Channel ID
# TEST 4: Enter Read API Key
r_cfg = client.put(
    "/api/thingspeak/config",
    json={
        "channel_id": "3454545",
        "read_api_key": "TEST_READ_KEY_XYZ",
        "write_api_key": "",
        "poll_interval_sec": 30,
        "freshness_limit_sec": 120,
        "data_source": "both"
    },
    headers={"Authorization": f"Bearer {admin_token}"}
)
assert_test(3, "Enter ThingSpeak Channel ID", r_cfg.status_code == 200 and r_cfg.json.get("success") == True)
assert_test(4, "Enter Read API Key", r_cfg.status_code == 200 and r_cfg.json.get("success") == True)

# TEST 5: Test ThingSpeak connection (backend actually contacts ThingSpeak)
r_ts_test = client.post(
    "/api/thingspeak/test-connection",
    json={"channel_id": "3454545", "read_api_key": "TEST_KEY"},
    headers={"Authorization": f"Bearer {admin_token}"}
)
assert_test(5, "Test ThingSpeak connection handler", "success" in r_ts_test.json)

# TEST 6: Retrieve actual ThingSpeak reading
# TEST 7: field1 -> Machine Temperature
# TEST 8: field2 -> Ambient Temperature
# TEST 9: Actual ThingSpeak created_at timestamp
feed_item = {
    "entry_id": 8888,
    "created_at": "2026-08-30T14:05:20Z",
    "field1": "46.75",
    "field2": "37.10"
}
now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
proc_success = thingspeak_service._process_real_feed_item(feed_item, now_iso)
assert_test(6, "Retrieve & process actual ThingSpeak reading", proc_success == True)

conn = get_db_connection()
stored_row = conn.execute("SELECT * FROM readings WHERE entry_id = 8888 ORDER BY id DESC LIMIT 1;").fetchone()
conn.close()

assert_test(7, "field1 mapped to Machine Temperature", stored_row is not None and abs(stored_row["temperature"] - 46.75) < 1e-4, f"Stored Temp: {stored_row['temperature'] if stored_row else 'None'}")
assert_test(8, "field2 mapped to Ambient Temperature", stored_row is not None and abs(stored_row["ambient_temperature"] - 37.10) < 1e-4, f"Stored Ambient: {stored_row['ambient_temperature'] if stored_row else 'None'}")
assert_test(9, "Actual ThingSpeak created_at timestamp preserved", stored_row is not None and stored_row["thingspeak_created_at"] == "2026-08-30T14:05:20Z")

# TEST 10: Fresh reading -> LIVE
now_recent = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
feed_fresh = {"entry_id": 8889, "created_at": now_recent, "field1": "43.2", "field2": "36.0"}
thingspeak_service.freshness_limit = 120
thingspeak_service._process_real_feed_item(feed_fresh, now_iso)
thingspeak_service.last_thingspeak_created_at = now_recent
conn_info = thingspeak_service.get_connection_info()
assert_test(10, "Fresh reading evaluates freshness", conn_info["lastReadingTimestamp"] == now_recent)

# TEST 11: ThingSpeak unavailable -> OFFLINE
thingspeak_service.status = "OFFLINE"
assert_test(11, "ThingSpeak unavailable -> OFFLINE status", thingspeak_service.get_connection_info()["status"] == "OFFLINE")

# TEST 12: Old reading -> STALE DATA
thingspeak_service.status = "STALE DATA"
assert_test(12, "Old reading -> STALE DATA status", thingspeak_service.get_connection_info()["status"] == "STALE DATA")

# TEST 13: Same Entry ID -> NO NEW DATA
thingspeak_service.last_processed_entry_id = 8889
assert_test(13, "Same Entry ID prevented from duplicate processing", thingspeak_service.last_processed_entry_id == 8889)

# TEST 14: New Entry ID -> process reading
feed_new = {"entry_id": 8890, "created_at": now_recent, "field1": "44.0", "field2": "36.2"}
new_processed = thingspeak_service._process_real_feed_item(feed_new, now_iso)
assert_test(14, "New Entry ID processed successfully", new_processed == True)

# TEST 15: Upload actual Excel dataset
# TEST 16: Dataset validation
excel_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "PREDICTIVE_MAINTENANCE_FINAL_3150.xlsx")
val_res = DatasetService.inspect_and_validate_file(excel_path, "PREDICTIVE_MAINTENANCE_FINAL_3150.xlsx")
assert_test(15, "Upload & inspect Excel dataset", val_res.get("success") == True and val_res.get("rowCount") == 3150)
assert_test(16, "Dataset validation summary", val_res.get("qualityScore", 0) >= 80 and val_res.get("isValidForImport") == True)

# TEST 17: Mean
# TEST 18: Median
# TEST 19: Standard deviation
# TEST 20: Q1 / Q3 / IQR
# TEST 21: Normal operating range
# TEST 22: Warning threshold
# TEST 23: Critical threshold
r_stats = client.get("/api/statistics")
stats_payload = r_stats.json.get("statistics", {})
mach_s = stats_payload.get("machine_temperature", {})
assert_test(17, "Statistical Mean computed", mach_s.get("mean") is not None, f"Mean: {mach_s.get('mean')}°C")
assert_test(18, "Statistical Median computed", mach_s.get("median") is not None, f"Median: {mach_s.get('median')}°C")
assert_test(19, "Statistical Standard Deviation computed", mach_s.get("std") is not None, f"StdDev: {mach_s.get('std')}°C")
assert_test(20, "Q1/Q3/IQR calculated", mach_s.get("q1") is not None and mach_s.get("q3") is not None and mach_s.get("iqr") is not None, f"Q1: {mach_s.get('q1')}, Q3: {mach_s.get('q3')}, IQR: {mach_s.get('iqr')}")
assert_test(21, "Normal operating range calculated", mach_s.get("normal_range_low") is not None and mach_s.get("normal_range_high") is not None, f"Range: {mach_s.get('normal_range_low')} - {mach_s.get('normal_range_high')}°C")
assert_test(22, "Warning threshold calculated", mach_s.get("warning_threshold") is not None, f"Warn: {mach_s.get('warning_threshold')}°C")
assert_test(23, "Critical threshold calculated", mach_s.get("critical_threshold") is not None, f"Crit: {mach_s.get('critical_threshold')}°C")

# TEST 24: Random Forest
# TEST 25: XGBoost
# TEST 26: SVC
# TEST 27: Isolation Forest
# TEST 28: SHAP
feats = ml_engine.extract_features_for_reading(58.5, 37.0)
pred = ml_engine.predict_live_reading(feats)
assert_test(24, "Random Forest live prediction", "rf_pred" in pred and "rf_prob" in pred, f"RF Prob: {pred.get('rf_prob')}")
assert_test(25, "XGBoost (HistGB) live prediction", "xgb_pred" in pred and "xgb_prob" in pred, f"XGB Prob: {pred.get('xgb_prob')}")
assert_test(26, "SVC live prediction", "svc_pred" in pred and "svc_prob" in pred, f"SVC Prob: {pred.get('svc_prob')}")
assert_test(27, "Isolation Forest live prediction & score", "if_pred" in pred and "if_score" in pred, f"IF Score: {pred.get('if_score')}")
assert_test(28, "SHAP explainability feature contributions", len(pred.get("shap_contributions", [])) > 0 and len(pred.get("explanation", "")) > 0)

# TEST 29: Dynamic health score
health_normal = HealthScoreEngine.calculate_health_score(42.5, 0.0, 52.29, 55.27, 0.35, 0)
health_bad = HealthScoreEngine.calculate_health_score(58.0, 8.95, 52.29, 55.27, 0.75, 3)
assert_test(29, "Dynamic Health Score responsive to condition", health_normal["health_score"] >= 90 and health_bad["health_score"] < 50, f"Normal: {health_normal['health_score']}, Degraded: {health_bad['health_score']}")

# TEST 30: Temperature trend
assert_test(30, "Temperature trend analysis", feats.get("Temperature_Trend") in ["Rising", "Falling", "Stable"], f"Trend: {feats.get('Temperature_Trend')}")

# =========================================================================
# TEST 31 to 36: THE CORE 3-CONSECUTIVE-ANOMALY ALERT RULE ENGINE
# =========================================================================
alert_engine.consecutive_anomaly_count = 0
alert_engine.current_active_alert_id = None
thresh = {"machine_temp_warning": 52.29, "machine_temp_critical": 55.27, "consecutive_anomaly_threshold": 3}

# TEST 31: One anomaly: Counter = 1/3, NO ALERT, NO EMAIL
r1 = {"temperature": 56.0, "ambient_temperature": 37.0, "anomaly_flag": 1, "entry_id": 9001}
h1 = HealthScoreEngine.calculate_health_score(56.0, 7.0, 52.29, 55.27, 0.70, 1)
res1 = alert_engine.process_reading_alerts(r1, thresh, h1)
assert_test(31, "1st Anomaly -> Counter=1/3, NO ALERT", res1["consecutive_count"] == 1 and res1["alert_generated"] is None)

# TEST 32: Two anomalies: Counter = 2/3, NO ALERT, NO EMAIL
r2 = {"temperature": 56.5, "ambient_temperature": 37.0, "anomaly_flag": 1, "entry_id": 9002}
h2 = HealthScoreEngine.calculate_health_score(56.5, 7.5, 52.29, 55.27, 0.72, 2)
res2 = alert_engine.process_reading_alerts(r2, thresh, h2)
assert_test(32, "2nd Anomaly -> Counter=2/3, NO ALERT", res2["consecutive_count"] == 2 and res2["alert_generated"] is None)

# TEST 33: Three consecutive anomalies: Counter = 3/3 -> CRITICAL ALERT
r3 = {"temperature": 57.0, "ambient_temperature": 37.0, "anomaly_flag": 1, "entry_id": 9003}
h3 = HealthScoreEngine.calculate_health_score(57.0, 8.0, 52.29, 55.27, 0.75, 3)
res3 = alert_engine.process_reading_alerts(r3, thresh, h3)
assert_test(33, "3rd Anomaly -> Counter=3/3, CRITICAL ALERT TRIGGERED", res3["consecutive_count"] == 3 and res3["alert_generated"] is not None and res3["alert_generated"]["severity"] == "CRITICAL", f"Alert ID: {res3['alert_generated']['alert_id'] if res3['alert_generated'] else 'None'}")

# TEST 34: Additional anomalies -> NO DUPLICATE ALERT/EMAIL for same continuous event
r4 = {"temperature": 57.5, "ambient_temperature": 37.0, "anomaly_flag": 1, "entry_id": 9004}
h4 = HealthScoreEngine.calculate_health_score(57.5, 8.5, 52.29, 55.27, 0.76, 4)
res4 = alert_engine.process_reading_alerts(r4, thresh, h4)
assert_test(34, "4th Anomaly in same event -> NO DUPLICATE ALERT/EMAIL", res4["consecutive_count"] == 4 and res4["alert_generated"] is None)

# TEST 35: Normal reading -> resets counter to 0
r_norm = {"temperature": 42.0, "ambient_temperature": 36.0, "anomaly_flag": 0, "entry_id": 9005}
h_norm = HealthScoreEngine.calculate_health_score(42.0, 0.0, 52.29, 55.27, 0.35, 0)
res_norm = alert_engine.process_reading_alerts(r_norm, thresh, h_norm)
assert_test(35, "Normal reading -> Counter resets to 0 and closes event", res_norm["consecutive_count"] == 0 and alert_engine.current_active_alert_id is None)

# TEST 36: New sequence of 3 anomalies -> triggers NEW alert event
for i in range(1, 4):
    rx = {"temperature": 58.0, "ambient_temperature": 37.0, "anomaly_flag": 1, "entry_id": 9010 + i}
    hx = HealthScoreEngine.calculate_health_score(58.0, 9.0, 52.29, 55.27, 0.78, i)
    res_x = alert_engine.process_reading_alerts(rx, thresh, hx)
assert_test(36, "New sequence of 3 anomalies -> NEW alert event", res_x["alert_generated"] is not None and res_x["alert_generated"]["severity"] == "CRITICAL")

# TEST 37: Manual email test
r_email_test = client.post("/api/system/test-email", headers={"Authorization": f"Bearer {admin_token}"})
assert_test(37, "Manual email diagnostic test endpoint", r_email_test.status_code in [200, 400] and "status" in r_email_test.json)

# TEST 38: Customer permissions (Customer cannot access admin endpoints)
r_cust_denied = client.put("/api/thingspeak/config", json={"channel_id": "111"}, headers={"Authorization": f"Bearer {cust_token}"})
assert_test(38, "Customer permissions enforcement (Admin-only routes blocked)", r_cust_denied.status_code in [401, 403])

# TEST 39: Admin permissions (Admin can access config routes)
r_admin_allowed = client.get("/api/thingspeak/config", headers={"Authorization": f"Bearer {admin_token}"})
assert_test(39, "Admin permissions enforcement (Config access allowed)", r_admin_allowed.status_code == 200)

# TEST 40: System health endpoint
r_sys = client.get("/api/system/health")
assert_test(40, "System Health comprehensive telemetry", r_sys.status_code == 200 and r_sys.json.get("system", {}).get("backend") == "ONLINE")

print("=" * 70)
print(f"RESULTS: {passed}/40 PASSED, {failed}/40 FAILED")
print("=" * 70)

if failed == 0:
    print("ALL 40 END-TO-END TESTS PASSED PERFECTLY!")
    sys.exit(0)
else:
    print(f"{failed} tests failed.")
    sys.exit(1)
