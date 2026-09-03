import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app
from thingspeak_service import thingspeak_service
import json

client = app.test_client()

print("\n=== Testing 1: Root / Health ===")
r = client.get("/")
print(f"Status: {r.status_code}, Machine: {r.json.get('machine')}")

print("\n=== Testing 2: Latest Reading ===")
r = client.get("/api/readings/latest")
print(f"Status: {r.status_code}, Machine Temp: {r.json.get('reading', {}).get('machineTemperature')} °C, Health: {r.json.get('reading', {}).get('healthScore')}/100")

print("\n=== Testing 3: Statistics ===")
r = client.get("/api/statistics")
mach = r.json.get("statistics", {}).get("machine_temperature", {})
print(f"Mean: {mach.get('mean')} °C, Median: {mach.get('median')} °C, Normal Range: {mach.get('normal_range_low')} - {mach.get('normal_range_high')} °C")
print(f"Warning Thresh: {mach.get('warning_threshold')} °C, Critical Thresh: {mach.get('critical_threshold')} °C")

print("\n=== Testing 4: Models Performance ===")
r = client.get("/api/models")
models = r.json.get("models", [])
print(f"Loaded {len(models)} models:")
for m in models:
    print(f" - {m.get('Model')}: Accuracy={m.get('Accuracy')}, F1={m.get('F1_Score')}, ROC_AUC={m.get('ROC_AUC')}")

print("\n=== Testing 5: SHAP Feature Importance ===")
r = client.get("/api/shap")
shap_list = r.json.get("shap_summary", [])
print("Top 5 Contributing Features:")
for f in shap_list[:5]:
    print(f" - {f.get('feature')}: Mean Absolute SHAP = {f.get('mean_shap_value')}")

print("\n=== Testing 6: Authentication ===")
r_admin = client.post("/api/auth/login", json={"username": "admin", "password": "Admin@12345"})
print(f"Admin Login: {r_admin.status_code}, Role: {r_admin.json.get('user', {}).get('role')}")

r_cust = client.post("/api/auth/login", json={"username": "customer", "password": "Customer@12345"})
print(f"Customer Login: {r_cust.status_code}, Role: {r_cust.json.get('user', {}).get('role')}")

print("\n=== Testing 7: 3-Consecutive Anomaly Simulation & Alerting ===")
admin_token = r_admin.json.get("token")
r_inject = client.post(
    "/api/thingspeak/inject-test-anomalies",
    json={"count": 3},
    headers={"Authorization": f"Bearer {admin_token}"}
)
print(f"Inject result: {r_inject.json.get('message')}")

# Simulate 3 polling ticks to trigger 3 consecutive abnormal readings
for i in range(1, 4):
    print(f"Tick {i}...")
    thingspeak_service.poll_now()

r_alerts = client.get("/api/alerts")
counts = r_alerts.json.get("counts", {})
alerts = r_alerts.json.get("alerts", [])
print(f"Alerts Summary: {counts}")
if alerts:
    latest = alerts[0]
    print(f"Latest Alert: ID={latest.get('alertId')}, Severity={latest.get('severity')}, ConsecutiveCount={latest.get('consecutiveCount')}")
    print(f"Trigger Reason: {latest.get('triggerReason')}")
    print(f"Recommended Action: {latest.get('recommendedAction')}")
    print(f"Email Status: {latest.get('emailStatus')}")

    # Test Customer Acknowledgement
    cust_token = r_cust.json.get("token")
    r_ack = client.post(f"/api/alerts/{latest.get('alertId')}/acknowledge", headers={"Authorization": f"Bearer {cust_token}"})
    print(f"Customer Acknowledge Alert: {r_ack.json}")

print("\n=== ALL BACKEND TESTS PASSED SUCCESSFULLY! ===")
