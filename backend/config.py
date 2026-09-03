import os
from pathlib import Path

# Base directories
BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
DATA_DIR = PROJECT_ROOT / "data"

# Load simple .env parser if .env exists
env_file = BASE_DIR / ".env"
if env_file.exists():
    with open(env_file, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                os.environ.setdefault(key.strip(), val.strip().strip('"\''))

class Config:
    PORT = int(os.environ.get("PORT", 5000))
    DATABASE_PATH = os.environ.get("DATABASE_PATH", str(BASE_DIR / "predictive_maintenance.db"))
    EXCEL_PATH = os.environ.get("EXCEL_PATH", str(DATA_DIR / "PREDICTIVE_MAINTENANCE_FINAL_3150.xlsx"))
    AUTH_SECRET = os.environ.get("AUTH_SECRET", "predictive-maintenance-jwt-secret-key-2026")
    
    # ThingSpeak Configuration
    THING_SPEAK_CHANNEL_ID = os.environ.get("THING_SPEAK_CHANNEL_ID", "").strip()
    THING_SPEAK_READ_API_KEY = os.environ.get("THING_SPEAK_READ_API_KEY", "").strip()
    THING_SPEAK_WRITE_API_KEY = os.environ.get("THING_SPEAK_WRITE_API_KEY", "").strip()
    # Accept seconds (30) or milliseconds (30000)
    _poll_raw = int(os.environ.get("LIVE_POLL_INTERVAL", 30000))
    LIVE_POLL_INTERVAL = _poll_raw // 1000 if _poll_raw >= 1000 else _poll_raw
    if LIVE_POLL_INTERVAL < 15:
        LIVE_POLL_INTERVAL = 15
    
    # Email / Notification Configuration
    ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "").strip()
    CUSTOMER_EMAIL = os.environ.get("CUSTOMER_EMAIL", "").strip()
    SMTP_HOST = os.environ.get("SMTP_HOST", "")
    SMTP_PORT = int(os.environ.get("SMTP_PORT", 587))
    SMTP_USER = os.environ.get("SMTP_USER", "")
    SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
    SMTP_FROM = os.environ.get("SMTP_FROM", "alerts@predictive-maintenance.io")
    
    # Machine Metadata
    MACHINE_ID = os.environ.get("MACHINE_ID", "MACH-CNC-3150")
    MACHINE_NAME = os.environ.get("MACHINE_NAME", "High-Precision CNC Spindle 01")
    LOCATION = os.environ.get("LOCATION", "Shop Floor Bay 4, Facility A")
