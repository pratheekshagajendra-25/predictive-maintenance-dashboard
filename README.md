# PredictiveIQ: Industry 4.0 Real-Time Machine Temperature & Predictive Maintenance Platform

A complete, production-grade Industry 4.0 Predictive Maintenance Platform designed for real-time machine temperature telemetry, dynamic statistical thresholding, multi-model machine learning anomaly detection, consecutive-anomaly incident alerting, automated SMTP email dispatch, and role-based Customer and Administrator monitoring portals.

Built upon the reference historical dataset `PREDICTIVE_MAINTENANCE_FINAL_3150.xlsx` and live ThingSpeak IoT channels.

---

## 1. System Architecture

```
                                  +---------------------------------------+
                                  |    ThingSpeak IoT Temperature Feed    |
                                  | (field1: Machine, field2: Ambient)   |
                                  +---------------------------------------+
                                                      |
                                                      v
                                  +---------------------------------------+
                                  |        Backend Polling Worker         |
                                  |  - Normalization (field1->Machine)    |
                                  |  - Validation (bounds, NaN, null)     |
                                  |  - State: LIVE / CONNECTION LOST      |
                                  +---------------------------------------+
                                                      |
                                                      v
                                  +---------------------------------------+
                                  |     Feature Engineering Engine        |
                                  |  - Rolling Mean 10, Rolling Std 10    |
                                  |  - Rate of Change, Thermal Diff (ΔT)  |
                                  |  - Local Z-Score, Normal Deviation    |
                                  +---------------------------------------+
                                                      |
                                                      v
                                  +---------------------------------------+
                                  |    Machine Learning & SHAP Engine     |
                                  |  - Random Forest Classifier           |
                                  |  - HistGradientBoosting (XGB-equiv)   |
                                  |  - Support Vector Classifier (SVC)    |
                                  |  - Isolation Forest (Unsupervised)    |
                                  |  - Ensemble Vote & SHAP Contributions |
                                  +---------------------------------------+
                                                      |
                                                      v
                                  +---------------------------------------+
                                  |      Machine Health Score Engine      |
                                  |  - 0–100 Continuous Penalty Model     |
                                  |  - Dynamic Health Tier Classification |
                                  +---------------------------------------+
                                                      |
                                                      v
                                  +---------------------------------------+
                                  |      Threshold & Anomaly Guard        |
                                  |  - Learned Dynamic IQR Normal Band    |
                                  |  - Warning & Critical Tukey Limits    |
                                  +---------------------------------------+
                                                      |
                                                      v
                                  +---------------------------------------+
                                  | 3-Consecutive Anomaly Alert Engine    |
                                  |  - Counter: 0 -> 1 -> 2 -> 3 (ALERT)  |
                                  |  - Event ID & Deduplication Cooldown  |
                                  +---------------------------------------+
                                                      |
                                                      v
                        +-----------------------------+-----------------------------+
                        |                                                           |
                        v                                                           v
      +-----------------------------------+                       +-----------------------------------+
      |        SMTP Email Dispatcher      |                       |    REST API & SQLite WAL Database |
      |  - Admin & Customer HTML Alerts   |                       |  - JWT Authentication & RBAC      |
      |  - Incident Context & Action Rec  |                       |  - Real-time Chart Endpoints      |
      +-----------------------------------+                       +-----------------------------------+
                                                                                    |
                                            +---------------------------------------+---------------------------------------+
                                            |                                                                               |
                                            v                                                                               v
                          +-----------------------------------+                                           +-----------------------------------+
                          |        Customer Dashboard         |                                           |         Admin Dashboard           |
                          |  - Live Status & KPI Cards        |                                           |  - 8-Card Overview & Deep Stats   |
                          |  - Radial Health Gauge (0-100)    |                                           |  - Model Performance & Confusion  |
                          |  - Interactive Temperature Graph  |                                           |  - SHAP Explainability Inspector  |
                          |  - 1-Click Alert Acknowledgement  |                                           |  - Dynamic Threshold Editor       |
                          +-----------------------------------+                                           |  - System Diagnostics & Controls  |
                                                                                                          +-----------------------------------+
```

---

## 2. Key Features

### 📡 1. Real-Time ThingSpeak IoT Integration
- Automatically polls ThingSpeak feeds at configurable intervals (`LIVE_POLL_INTERVAL=15`).
- **Normalized Sensor Mapping**:
  - `field1` &rarr; **`Machine Temperature`** (Primary machine thermal condition variable).
  - `field2` &rarr; **`Ambient Temperature`** (Environmental baseline variable).
- **Strict Data Validation**: Discards `null`, `NaN`, non-numeric characters, physical impossibility out-of-bounds readings (`< -30°C` or `> 150°C`), and duplicate entry IDs.
- **Connection Indicator**: Real-time `LIVE` pulse indicator or `CONNECTION LOST` status with last successful update timestamp.
- **Zero Exposure**: `field1`, `field2`, and private API keys are never exposed to the frontend.

### 🧠 2. Machine Learning Anomaly Detection & SHAP Explainability
- Evaluates four distinct machine learning architectures:
  1. **Random Forest Classifier** (Accuracy: 99.62%, Precision: 96.88%, F1: 95.38%, ROC-AUC: 0.9996)
  2. **Gradient Boosted Decision Trees / XGBoost equivalent** (HistGradientBoosting: Accuracy: 99.62%, F1: 95.38%)
  3. **Support Vector Classifier (SVC)** with Standard Scaling & RBF kernel (Accuracy: 99.62%, F1: 95.52%)
  4. **Isolation Forest** (Unsupervised Outlier Detection: Accuracy: 99.11%, Recall: 100%)
- **SHAP Feature Importance**: Quantifies feature contributions (`Rolling_Std_10`, `Temperature`, `Temperature_Difference`, `Deviation_From_Normal`, `Rate_Of_Change`).
- **Natural-Language Root-Cause Engine**: Explains why a reading is anomalous in plain English (e.g. *"Machine Temperature of 58.7°C exceeds the normal operating band by +9.65°C with elevated local volatility (Rolling Std = 2.4°C)"*).

### 🛡️ 3. Consecutive Anomaly Alert State Machine
- **Strict 3-Consecutive Rule**: Individual sensor glitches or single transient spikes do **not** trigger false alarms.
- Alert condition is triggered **only when 3 consecutive abnormal readings occur**:
  $$\text{Normal (0)} \xrightarrow{+\text{anom}} \text{1} \xrightarrow{+\text{anom}} \text{2} \xrightarrow{+\text{anom}} \text{3} \longrightarrow \mathbf{CRITICAL\ ALERT\ TRIGGERED}$$
  $$\text{Any Normal Reading} \longrightarrow \mathbf{Counter\ Resets\ to\ 0}$$
- **Event ID & Deduplication**: Assigns a unique event identifier (`ALT-YYYYMMDD-XXXXXX`) and prevents duplicate email spam during ongoing incidents.

### 📧 4. Automated SMTP Email Alert System
- Dispatches responsive HTML and plain-text alert emails to `ADMIN_EMAIL` and `CUSTOMER_EMAIL`.
- **Email Content Includes**:
  - Machine ID & Name (`MACH-CNC-3150: High-Precision CNC Spindle 01`)
  - Alert Severity Level (`CRITICAL`)
  - Machine Temperature & Ambient Temperature (`XX.X °C`)
  - Operating Threshold (`XX.X °C`)
  - Consecutive Count (`3`)
  - Machine Health Score (`XX / 100`)
  - Detected Timestamp (UTC)
  - Recommended Maintenance Action
  - Direct Link to Dashboard

### 💓 5. Machine Health Score Algorithm (0–100)
Calculates a continuous health score $H \in [0, 100]$:
$$H = 100 - P_{\text{deviation}} - P_{\text{threshold}} - P_{\text{anomaly}} - P_{\text{consecutive}} - P_{\text{volatility}}$$

- **Health Tiers**:
  - **90 – 100**: `Excellent` (Healthy operating condition)
  - **75 – 89**: `Good` (Nominal operation)
  - **50 – 74**: `Warning` (Thermal stress or buffer depletion)
  - **0 – 49**: `Poor / Critical` (Critical maintenance required)

### 📊 6. Role-Based Customer & Administrator Portals
- **Customer (Operator)**: Streamlined status header, 6 KPI cards, radial health gauge, interactive temperature chart with zoom presets (15m, 1h, 6h, 24h, 7d, all), and 1-click alert acknowledgement.
- **Admin (Engineer)**: 8 Overview KPIs, deep statistical analysis, anomaly exploration table with multi-filters, ML model performance metrics, confusion matrices, SHAP explainability inspector, threshold editor with *"Reset to Calculated Defaults"*, user management, and system diagnostics.

---

## 3. Technology Stack

- **Backend**: Python 3.13 / Flask, Scikit-Learn, Pandas, NumPy, SciPy, OpenPyXL, SQLite 3 (WAL mode), PyJWT, Werkzeug.
- **Frontend**: React 18, Vite, Tailwind CSS, Lucide Icons, Recharts, Canvas / SVG radial gauges.
- **Data Source**: ThingSpeak REST API & `PREDICTIVE_MAINTENANCE_FINAL_3150.xlsx` (3,150 historical records).

---

## 4. Quick Start & Execution

### Prerequisites
- Python 3.10+ (or Anaconda Python)
- Node.js 18+ and npm

### One-Click Launch (Windows)
Double-click:
```cmd
start.bat
```
Or run the PowerShell launcher:
```powershell
.\run.ps1
```

### Manual Launch

#### 1. Backend Service
```bash
cd backend
# Optional: create virtual environment
# python -m venv venv && venv\Scripts\activate
# pip install -r requirements.txt

python app.py
```
*Backend runs at `http://localhost:5000` (SQLite database initialized automatically).*

#### 2. Frontend Application
```bash
cd frontend
npm install
npm run dev
```
*Frontend runs at `http://localhost:5173`.*

---

## 5. Default Credentials

| Role | Username | Email | Password | Access Level |
| :--- | :--- | :--- | :--- | :--- |
| **Administrator** | `admin` | `admin@maintenance.io` | `Admin@12345` | Full System Access, Thresholds, ML Models, Diagnostics |
| **Customer** | `customer` | `operator@client.com` | `Customer@12345` | Operator Monitoring, Health Gauge, Alert Acknowledgement |

*(Quick one-click login buttons are also provided directly on the login portal).*

---

## 6. Environment Configuration (`.env`)

Configure `backend/.env` (template available in `backend/.env.example`):

```env
# Server Port
PORT=5000

# Security & Authentication
AUTH_SECRET=predictive-maintenance-jwt-secret-key-2026

# ThingSpeak IoT Channel Configuration
# Map: field1 -> Machine Temperature, field2 -> Ambient Temperature
THING_SPEAK_CHANNEL_ID=your_channel_id_here
THING_SPEAK_READ_API_KEY=your_read_api_key_here
THING_SPEAK_WRITE_API_KEY=your_write_api_key_here
LIVE_POLL_INTERVAL=15

# Email & SMTP Alert Configuration
ADMIN_EMAIL=admin@maintenance.io
CUSTOMER_EMAIL=operator@client.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password
SMTP_FROM=alerts@predictive-maintenance.io

# Machine Metadata
MACHINE_ID=MACH-CNC-3150
MACHINE_NAME=High-Precision CNC Spindle 01
LOCATION=Shop Floor Bay 4, Facility A
```

> **Note on Simulated vs Live IoT Mode**:
> If `THING_SPEAK_CHANNEL_ID` is left blank, the platform automatically runs in a realistic IoT simulation mode calibrated to the exact AR(1) distribution of the dataset, allowing you to test the complete full-stack application immediately without needing live hardware. When you provide your ThingSpeak Channel ID and API keys, it connects directly to live hardware streams.

---

## 7. How to Test the 3-Consecutive Anomaly Alerting Engine

1. Sign in to the Admin Portal (`admin` / `Admin@12345`).
2. Navigate to **System Health** or **Dashboard**.
3. Click **"Simulate 3-Anomaly Alert Burst"** (or use the API endpoint `POST /api/thingspeak/inject-test-anomalies`).
4. Observe the consecutive counter:
   - **Tick 1**: Machine Temp > 56°C &rarr; Anomaly detected (`1 / 3`). No alert yet.
   - **Tick 2**: Machine Temp > 56°C &rarr; Anomaly detected (`2 / 3`). No alert yet.
   - **Tick 3**: Machine Temp > 56°C &rarr; Anomaly detected (`3 / 3`) &rarr; **CRITICAL ALERT TRIGGERED**!
5. The top alert notification banner appears, the incident is logged in the database (`ALT-YYYYMMDD-XXXXXX`), and an alert email is dispatched.
6. Switch to the **Customer Portal** and verify that the customer sees the alert with the **Acknowledge** button.

---

## 8. REST API Reference

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Authenticate user & issue JWT | No |
| `GET` | `/api/auth/me` | Current user profile | Bearer Token |
| `GET` | `/api/auth/users` | List platform users | Admin |
| `POST` | `/api/auth/users` | Create new user account | Admin |
| `GET` | `/api/readings/latest` | Latest normalized reading & health | No |
| `GET` | `/api/readings` | Paginated sensor readings | No |
| `GET` | `/api/readings/chart` | Time-series chart points with thresholds | No |
| `GET` | `/api/statistics` | Dynamic dataset statistical parameters | No |
| `GET` | `/api/anomalies` | Filterable anomaly observations | No |
| `GET` | `/api/alerts` | Active & historical machine alerts | No |
| `POST` | `/api/alerts/:id/acknowledge` | Acknowledge active incident | Bearer Token |
| `POST` | `/api/alerts/:id/resolve` | Resolve incident with notes | Bearer Token |
| `GET` | `/api/health` | Machine health score & factor breakdown | No |
| `GET` | `/api/thresholds` | Active thresholds & calculated defaults | No |
| `PUT` | `/api/thresholds` | Update operating thresholds | Admin |
| `POST` | `/api/thresholds/reset` | Reset thresholds to calculated defaults | Admin |
| `GET` | `/api/models` | ML performance metrics & confusion matrix | No |
| `GET` | `/api/shap` | SHAP feature importance rankings | No |
| `POST` | `/api/shap/explain` | Natural-language root-cause inspector | No |
| `GET` | `/api/thingspeak/status` | Poller connection health & latency | No |
| `POST` | `/api/thingspeak/poll-now` | Force immediate ThingSpeak poll | No |
| `POST` | `/api/thingspeak/write-test` | Test posting via ThingSpeak Write API | Admin |
| `POST` | `/api/thingspeak/inject-test-anomalies` | Test consecutive anomaly alerting burst | Admin |
| `GET` | `/api/system/health` | Comprehensive infrastructure status | No |
| `GET` | `/api/system/logs` | Audit trail, email logs, and system logs | Admin |
| `POST` | `/api/system/test-email` | Dispatch diagnostic test email | Admin |

---

## 9. Calculated Historical Baseline Characteristics

Derived dynamically from `PREDICTIVE_MAINTENANCE_FINAL_3150.xlsx` ($N=3,150$):

- **Machine Temperature**:
  - Mean: $42.89^\circ\text{C}$
  - Median: $43.14^\circ\text{C}$
  - Standard Deviation: $5.43^\circ\text{C}$
  - Interquartile Range (IQR): $5.97^\circ\text{C}$ ($Q_1=40.35^\circ\text{C}, Q_3=46.32^\circ\text{C}$)
  - Normal Operating Range (5th–95th percentile): $34.61^\circ\text{C} - 49.05^\circ\text{C}$
  - Warning Threshold ($Q_3 + 1.0\times\text{IQR}$): $52.29^\circ\text{C}$
  - Critical Threshold ($Q_3 + 1.5\times\text{IQR}$): $55.27^\circ\text{C}$
- **Ambient Temperature**:
  - Mean: $36.49^\circ\text{C}$
  - Median: $36.56^\circ\text{C}$
  - Standard Deviation: $1.87^\circ\text{C}$
  - Warning Threshold: $40.69^\circ\text{C}$
  - Critical Threshold: $42.06^\circ\text{C}$
