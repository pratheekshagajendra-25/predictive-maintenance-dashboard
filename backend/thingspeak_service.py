import time
import threading
import datetime
import requests
import pandas as pd
from config import Config
from database import get_db_connection, log_system_event
from ml_engine import ml_engine
from health_score_engine import HealthScoreEngine
from alert_engine import alert_engine

class ThingSpeakService:
    def __init__(self):
        self.is_running = False
        self.worker_thread = None
        self.status = "OFFLINE" # "LIVE", "STALE DATA", "NO RECENT DATA", "OFFLINE"
        self.last_successful_fetch = None
        self.last_new_reading_timestamp = None
        self.last_thingspeak_created_at = None
        self.last_poll_attempt = None
        self.last_error = None
        self.last_error_code = None
        self.poll_interval = Config.LIVE_POLL_INTERVAL
        self.freshness_limit = 120 # Seconds before data is considered stale
        self.last_processed_entry_id = -1
        self.last_reading = None
        self.total_readings_fetched = 0
        self.failed_request_count = 0
        self.manual_demo_anomaly_count = 0 # For Admin-only development test button

    def get_active_config(self):
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM thingspeak_config WHERE is_enabled = 1 ORDER BY id DESC LIMIT 1;")
            row = cursor.fetchone()
            conn.close()
            if row:
                d = dict(row)
                self.poll_interval = d.get("poll_interval_sec", 30)
                self.freshness_limit = d.get("freshness_limit_sec", 120)
                return d
        except Exception as e:
            print(f"Error reading thingspeak_config from DB: {e}")

        # No enabled connection — do not silently reuse leftover env keys after Disconnect
        return {
            "channel_id": "",
            "read_api_key": "",
            "write_api_key": "",
            "poll_interval_sec": Config.LIVE_POLL_INTERVAL,
            "freshness_limit_sec": 120,
            "data_source": "both"
        }

    def _restore_last_entry_id(self):
        """Avoid reprocessing the same ThingSpeak entry after a restart."""
        try:
            conn = get_db_connection()
            row = conn.execute(
                "SELECT entry_id, thingspeak_created_at, fetch_timestamp FROM readings "
                "WHERE is_live = 1 AND data_source = 'THINGSPEAK_LIVE' AND entry_id IS NOT NULL "
                "ORDER BY id DESC LIMIT 1;"
            ).fetchone()
            count_row = conn.execute(
                "SELECT COUNT(*) AS n FROM readings WHERE is_live = 1 AND data_source = 'THINGSPEAK_LIVE';"
            ).fetchone()
            conn.close()
            if row and row["entry_id"] is not None:
                self.last_processed_entry_id = int(row["entry_id"])
                self.last_thingspeak_created_at = row["thingspeak_created_at"]
                self.last_new_reading_timestamp = row["fetch_timestamp"]
            if count_row:
                self.total_readings_fetched = int(count_row["n"] or 0)
        except Exception as e:
            print(f"[THINGSPEAK] Could not restore last entry_id: {e}")

    def start_service(self):
        self._restore_last_entry_id()
        if not self.is_running:
            self.is_running = True
            self.worker_thread = threading.Thread(target=self._polling_loop, daemon=True)
            self.worker_thread.start()
            print("ThingSpeak Polling Worker started.")
            log_system_event("INFO", "THINGSPEAK", "Background polling worker started.")

    def stop_service(self):
        self.is_running = False
        print("ThingSpeak Polling Worker stopped.")

    def _polling_loop(self):
        while self.is_running:
            try:
                self.poll_now()
            except Exception as e:
                print(f"[THINGSPEAK WORKER ERROR] {e}")
                self.status = "OFFLINE"
                self.last_error = str(e)
            
            cfg = self.get_active_config()
            interval = max(15, int(cfg.get("poll_interval_sec") or self.poll_interval or 30))
            time.sleep(interval)

    def poll_now(self):
        self.last_poll_attempt = datetime.datetime.now(datetime.timezone.utc).isoformat()
        cfg = self.get_active_config()
        channel_id = str(cfg.get("channel_id", "")).strip()
        read_key = str(cfg.get("read_api_key", "")).strip()
        data_source = str(cfg.get("data_source", "both")).lower()

        if data_source == "dataset":
            self.status = "OFFLINE"
            self.last_error = "ThingSpeak polling is paused because Data Source is set to Historical Dataset only."
            self.last_error_code = "DATASET_ONLY"
            return {
                "status": self.status,
                "is_new": False,
                "message": self.last_error
            }

        # If credentials are not configured
        if not channel_id:
            self.status = "OFFLINE"
            self.last_error = "ThingSpeak Channel ID is not configured."
            self.last_error_code = "NO_CONFIG"
            return {
                "status": self.status,
                "is_new": False,
                "message": "ThingSpeak Channel ID is not configured."
            }

        url = f"https://api.thingspeak.com/channels/{channel_id}/feeds.json?results=2"
        if read_key:
            url += f"&api_key={read_key}"

        try:
            resp = requests.get(url, timeout=10)
            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

            if resp.status_code == 200:
                data = resp.json()
                feeds = data.get("feeds", [])

                if not feeds:
                    self.status = "NO NEW DATA"
                    self.last_successful_fetch = now_iso
                    self.last_error = "Channel is reachable but returned zero feed entries."
                    self.last_error_code = "EMPTY_FEED"
                    return {"status": self.status, "is_new": False, "message": self.last_error}

                latest_feed = feeds[-1]
                entry_id = latest_feed.get("entry_id")
                created_at_raw = latest_feed.get("created_at")

                # Evaluate Reading Freshness based on created_at
                is_fresh = False
                reading_age_sec = 999999
                if created_at_raw:
                    try:
                        feed_dt = pd.to_datetime(created_at_raw)
                        if feed_dt.tzinfo is None:
                            feed_dt = feed_dt.tz_localize("UTC")
                        now_dt = datetime.datetime.now(datetime.timezone.utc)
                        reading_age_sec = (now_dt - feed_dt).total_seconds()
                        is_fresh = (reading_age_sec <= self.freshness_limit)
                    except Exception as ex:
                        print(f"Timestamp parse error: {ex}")

                self.last_successful_fetch = now_iso
                self.last_thingspeak_created_at = created_at_raw
                self.last_error = None
                self.last_error_code = None

                # Deduplication: same entry_id is NOT a new reading
                already_processed = False
                if entry_id is not None:
                    try:
                        if int(entry_id) == int(self.last_processed_entry_id):
                            already_processed = True
                    except (TypeError, ValueError):
                        already_processed = False
                    if not already_processed:
                        try:
                            conn_chk = get_db_connection()
                            exists = conn_chk.execute(
                                "SELECT id FROM readings WHERE is_live = 1 AND entry_id = ? LIMIT 1;",
                                (entry_id,)
                            ).fetchone()
                            conn_chk.close()
                            if exists:
                                already_processed = True
                                self.last_processed_entry_id = entry_id
                        except Exception as ex:
                            print(f"Duplicate check failed: {ex}")

                if already_processed:
                    self.status = "STALE DATA" if not is_fresh else "NO NEW DATA"
                    return {
                        "status": self.status,
                        "is_new": False,
                        "entryId": entry_id,
                        "readingAgeSec": int(reading_age_sec),
                        "message": f"No new reading available (Entry #{entry_id} is up to date)."
                    }

                # Process the NEW reading — LIVE only after a valid reading is stored
                success = self._process_real_feed_item(latest_feed, now_iso)
                if success:
                    self.last_processed_entry_id = entry_id
                    self.last_new_reading_timestamp = now_iso
                    self.total_readings_fetched += 1
                    self.status = "LIVE" if is_fresh else "STALE DATA"
                    return {
                        "status": self.status,
                        "is_new": True,
                        "entryId": entry_id,
                        "readingAgeSec": int(reading_age_sec),
                        "message": f"New reading received (Entry #{entry_id})."
                    }

                self.status = "NO NEW DATA"
                self.last_error = "ThingSpeak responded but the latest feed entry was not a valid temperature reading."
                return {
                    "status": self.status,
                    "is_new": False,
                    "entryId": entry_id,
                    "message": self.last_error
                }

            elif resp.status_code in [401, 403]:
                self.status = "OFFLINE"
                self.last_error = "ThingSpeak Authentication Failed: Invalid Read API Key."
                self.last_error_code = f"HTTP_{resp.status_code}"
                self.failed_request_count += 1
            elif resp.status_code == 404:
                self.status = "OFFLINE"
                self.last_error = f"ThingSpeak Channel #{channel_id} not found."
                self.last_error_code = "HTTP_404"
                self.failed_request_count += 1
            elif resp.status_code == 429:
                self.status = "STALE DATA"
                self.last_error = "ThingSpeak Rate Limit Exceeded (15s minimum per request)."
                self.last_error_code = "HTTP_429"
            else:
                self.status = "OFFLINE"
                self.last_error = f"ThingSpeak Error HTTP {resp.status_code}: {resp.text[:120]}"
                self.last_error_code = f"HTTP_{resp.status_code}"
                self.failed_request_count += 1

        except Exception as e:
            self.status = "OFFLINE"
            raw = str(e)
            if "api_key=" in raw.lower() or "thingspeak.com" in raw.lower():
                self.last_error = "Connection failed: unable to reach api.thingspeak.com. Check internet connectivity."
            else:
                self.last_error = f"Connection failed: {raw[:180]}"
            self.last_error_code = "NET_ERR"
            self.failed_request_count += 1

        return {
            "status": self.status,
            "is_new": False,
            "error": self.last_error,
            "errorCode": self.last_error_code
        }

    def _process_real_feed_item(self, feed, fetch_time_iso):
        f1 = feed.get("field1")
        f2 = feed.get("field2")
        created_at_str = feed.get("created_at")
        entry_id = feed.get("entry_id")

        # 1. Validation: Reject null / empty / non-numeric
        if f1 is None or str(f1).strip().lower() in ["", "nan", "null", "none"]:
            log_system_event("WARNING", "VALIDATION", f"Rejected reading with empty field1 (Entry #{entry_id})")
            return False

        try:
            machine_temp = float(str(f1).strip())
            ambient_temp = float(str(f2).strip()) if (f2 is not None and str(f2).strip() != "") else 36.5
        except ValueError:
            log_system_event("WARNING", "VALIDATION", f"Rejected non-numeric temperature: f1={f1}, f2={f2}")
            return False

        # Physics bounds check (-30°C to 150°C)
        if machine_temp < -30.0 or machine_temp > 150.0 or ambient_temp < -30.0 or ambient_temp > 80.0:
            log_system_event("WARNING", "VALIDATION", f"Rejected physically impossible values: Machine {machine_temp}°C, Ambient {ambient_temp}°C")
            return False

        # Parse ThingSpeak timestamp
        try:
            created_dt = pd.to_datetime(created_at_str)
            created_ts = created_dt.timestamp()
            standard_created_at = created_dt.strftime("%Y-%m-%d %H:%M:%S")
        except Exception:
            created_dt = datetime.datetime.now(datetime.timezone.utc)
            created_ts = created_dt.timestamp()
            standard_created_at = created_dt.strftime("%Y-%m-%d %H:%M:%S")

        # Load active thresholds
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM threshold_config WHERE is_active = 1 ORDER BY id DESC LIMIT 1;")
        t_row = cursor.fetchone()
        thresh_dict = dict(t_row) if t_row else {
            "machine_temp_warning": 52.29,
            "machine_temp_critical": 55.27,
            "normal_range_low": 34.61,
            "normal_range_high": 49.05,
            "consecutive_anomaly_threshold": 3
        }

        # 2. Extract features
        features = ml_engine.extract_features_for_reading(
            machine_temp,
            ambient_temp,
            created_dt,
            normal_range_low=thresh_dict.get("normal_range_low", 34.61),
            normal_range_high=thresh_dict.get("normal_range_high", 49.05)
        )

        # 3. Machine Learning Inference
        prediction = ml_engine.predict_live_reading(features)

        # 4. Machine Health Score Calculation
        health_res = HealthScoreEngine.calculate_health_score(
            temperature=machine_temp,
            deviation_from_normal=features["Deviation_From_Normal"],
            warning_threshold=thresh_dict.get("machine_temp_warning", 52.29),
            critical_threshold=thresh_dict.get("machine_temp_critical", 55.27),
            anomaly_score=prediction["anomaly_score"],
            consecutive_anomalies=alert_engine.consecutive_anomaly_count + (1 if prediction["anomaly_flag"] == 1 or machine_temp >= thresh_dict.get("machine_temp_warning", 52.29) else 0),
            rate_of_change=features["Rate_Of_Change"]
        )

        # 5. Consecutive Anomaly Guard & Alert State Machine
        reading_payload = {
            "entry_id": entry_id,
            "created_at": standard_created_at,
            "thingspeak_created_at": created_at_str,
            "temperature": machine_temp,
            "ambient_temperature": ambient_temp,
            "anomaly_flag": prediction["anomaly_flag"]
        }
        alert_res = alert_engine.process_reading_alerts(reading_payload, thresh_dict, health_res)

        # 6. Insert Into SQLite
        cursor.execute("""
        INSERT INTO readings (
            entry_id, created_at, thingspeak_created_at, fetch_timestamp, temperature, ambient_temperature,
            temperature_difference, rolling_mean_10, rolling_median_10, rolling_std_10, rate_of_change,
            temperature_trend, deviation_from_normal, local_z_score, condition, anomaly_flag,
            anomaly_score, rf_prediction, rf_probability, xgb_prediction, xgb_probability,
            svc_prediction, svc_probability, isolation_forest_prediction, isolation_forest_score,
            final_prediction, final_confidence, is_live, data_source, created_timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'THINGSPEAK_LIVE', ?);
        """, (
            entry_id or int(time.time()),
            standard_created_at,
            created_at_str,
            fetch_time_iso,
            machine_temp,
            ambient_temp,
            features["Temperature_Difference"],
            features["Rolling_Mean_10"],
            features["Rolling_Median_10"],
            features["Rolling_Std_10"],
            features["Rate_Of_Change"],
            features["Temperature_Trend"],
            features["Deviation_From_Normal"],
            features["Local_Z_Score"],
            prediction["condition"],
            prediction["anomaly_flag"],
            prediction["anomaly_score"],
            prediction["rf_pred"],
            prediction["rf_prob"],
            prediction["xgb_pred"],
            prediction["xgb_prob"],
            prediction["svc_pred"],
            prediction["svc_prob"],
            prediction["if_pred"],
            prediction["if_score"],
            prediction["final_prediction"],
            prediction["final_confidence"],
            created_ts
        ))
        conn.commit()
        conn.close()

        # Update latest snapshot
        self.last_reading = {
            "entry_id": entry_id,
            "timestamp": standard_created_at,
            "thingspeakTimestamp": created_at_str,
            "fetchTimestamp": fetch_time_iso,
            "machineTemperature": machine_temp,
            "ambientTemperature": ambient_temp,
            "temperatureDifference": features["Temperature_Difference"],
            "condition": prediction["condition"],
            "anomalyFlag": prediction["anomaly_flag"],
            "anomalyScore": prediction["anomaly_score"],
            "healthScore": health_res["health_score"],
            "healthStatus": health_res["status"],
            "healthCondition": health_res["condition"],
            "healthColor": health_res["color"],
            "consecutiveAnomalies": alert_res["consecutive_count"],
            "explanation": prediction["explanation"],
            "shapContributions": prediction["shap_contributions"][:5]
        }
        return True

    def test_connection(self, channel_id, read_api_key=""):
        """Performs a live test request to ThingSpeak and returns exact diagnostic info"""
        channel_id = str(channel_id).strip()
        read_api_key = str(read_api_key).strip()

        if not channel_id:
            return {"success": False, "error": "Channel ID cannot be empty."}

        url = f"https://api.thingspeak.com/channels/{channel_id}/feeds.json?results=2"
        if read_api_key:
            url += f"&api_key={read_api_key}"

        try:
            resp = requests.get(url, timeout=10)
            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

            if resp.status_code == 200:
                data = resp.json()
                channel_info = data.get("channel", {})
                feeds = data.get("feeds", [])

                if not feeds:
                    return {
                        "success": True,
                        "status": "CONNECTED_NO_FEEDS",
                        "channelId": channel_id,
                        "channelName": channel_info.get("name", "Unknown"),
                        "message": "ThingSpeak Connected! (Channel currently has no feed entries).",
                        "lastSuccessfulFetch": now_iso
                    }

                latest = feeds[-1]
                f1 = latest.get("field1")
                f2 = latest.get("field2")
                entry_id = latest.get("entry_id")
                created_at = latest.get("created_at")

                try:
                    mach_temp = float(f1) if f1 is not None else None
                except ValueError:
                    mach_temp = None

                try:
                    amb_temp = float(f2) if f2 is not None else None
                except ValueError:
                    amb_temp = None

                return {
                    "success": True,
                    "status": "CONNECTED",
                    "channelId": channel_id,
                    "channelName": channel_info.get("name", "ThingSpeak IoT Channel"),
                    "latestEntryId": entry_id,
                    "latestMachineTemperature": mach_temp,
                    "latestAmbientTemperature": amb_temp,
                    "thingspeakTimestamp": created_at,
                    "lastSuccessfulFetch": now_iso,
                    "message": f"ThingSpeak Connected successfully! Received Entry #{entry_id}."
                }

            elif resp.status_code in [401, 403]:
                return {
                    "success": False,
                    "errorCode": f"HTTP_{resp.status_code}",
                    "error": "Authentication Failed: The provided Read API Key is invalid or unauthorized for this private channel."
                }
            elif resp.status_code == 404:
                return {
                    "success": False,
                    "errorCode": "HTTP_404",
                    "error": f"Channel Not Found: Channel ID #{channel_id} does not exist on ThingSpeak."
                }
            elif resp.status_code == 429:
                return {
                    "success": False,
                    "errorCode": "HTTP_429",
                    "error": "Rate Limited: ThingSpeak requires at least 15 seconds between consecutive API queries."
                }
            else:
                return {
                    "success": False,
                    "errorCode": f"HTTP_{resp.status_code}",
                    "error": f"ThingSpeak returned status {resp.status_code}: {resp.text[:150]}"
                }
        except requests.exceptions.Timeout:
            return {"success": False, "error": "Connection timed out connecting to api.thingspeak.com (10s limit)."}
        except requests.exceptions.ConnectionError:
            return {"success": False, "error": "ThingSpeak unavailable. Check internet connection."}
        except Exception as e:
            return {"success": False, "error": "Network Error: unable to reach ThingSpeak."}

    def disconnect(self):
        """Stop live polling without deleting historical dataset or email settings."""
        self.status = "OFFLINE"
        self.last_error = "ThingSpeak connection was disconnected by an administrator."
        self.last_error_code = "DISCONNECTED"
        return {
            "status": self.status,
            "message": "ThingSpeak disconnected. Live polling is stopped. Historical dataset and email settings are unchanged."
        }

    def write_to_thingspeak(self, machine_temperature, ambient_temperature):
        cfg = self.get_active_config()
        write_key = cfg.get("write_api_key") or ""
        if not write_key:
            return {"success": False, "message": "ThingSpeak Write API Key is not configured in settings."}

        url = "https://api.thingspeak.com/update"
        params = {
            "api_key": write_key,
            "field1": round(float(machine_temperature), 2),
            "field2": round(float(ambient_temperature), 2)
        }
        try:
            resp = requests.post(url, data=params, timeout=10)
            if resp.status_code == 200 and resp.text.strip() != "0":
                log_system_event("INFO", "THINGSPEAK_WRITE", f"Posted reading: Machine={machine_temperature}°C, Ambient={ambient_temperature}°C")
                return {"success": True, "entry_id": resp.text.strip(), "message": "Successfully posted reading to ThingSpeak."}
            else:
                return {"success": False, "message": f"ThingSpeak returned status {resp.status_code} / response: {resp.text}"}
        except Exception as e:
            return {"success": False, "message": f"Write failed: {str(e)}"}

    def get_connection_info(self):
        cfg = self.get_active_config()
        channel_id = cfg.get("channel_id", "")
        read_key = cfg.get("read_api_key", "")

        # Mask API keys — never expose full key to browser
        masked_read_key = (
            f"{read_key[:3]}••••••••{read_key[-3:]}" if len(read_key) >= 6
            else ("••••••••" if read_key else "")
        )
        masked_write_key = "••••••••" if cfg.get("write_api_key") else ""

        # Calculate numeric age and human-readable string since the last ThingSpeak reading
        last_reading_age_sec = None
        last_reading_age_str = "No reading received"
        if self.last_thingspeak_created_at:
            try:
                dt = pd.to_datetime(self.last_thingspeak_created_at)
                if dt.tzinfo is None:
                    dt = dt.tz_localize("UTC")
                now_dt = datetime.datetime.now(datetime.timezone.utc)
                diff_sec = int((now_dt - dt).total_seconds())
                last_reading_age_sec = diff_sec
                if diff_sec < 60:
                    last_reading_age_str = f"{diff_sec} seconds ago"
                elif diff_sec < 3600:
                    last_reading_age_str = f"{diff_sec // 60} minutes ago"
                else:
                    last_reading_age_str = f"{diff_sec // 3600} hours ago"
            except Exception:
                pass

        return {
            "status": self.status,
            "channelId": channel_id if channel_id else "Not Configured",
            "isConfigured": bool(channel_id),
            "maskedReadKey": masked_read_key,
            "maskedWriteKey": masked_write_key,
            "hasWriteKey": bool(cfg.get("write_api_key")),
            "lastSuccessfulFetch": self.last_successful_fetch,
            "lastReadingTimestamp": self.last_thingspeak_created_at,
            "lastReadingAge": last_reading_age_str,
            "lastReadingAgeSec": last_reading_age_sec,
            "lastNewReadingTimestamp": self.last_new_reading_timestamp,
            "lastEntryId": self.last_processed_entry_id if self.last_processed_entry_id > 0 else None,
            "pollInterval": self.poll_interval,
            "freshnessLimit": self.freshness_limit,
            "dataSource": cfg.get("data_source", "both"),
            "totalProcessedReadings": self.total_readings_fetched,
            "failedRequests": self.failed_request_count,
            "lastError": self.last_error,
            "lastErrorCode": self.last_error_code
        }

# Global Singleton
thingspeak_service = ThingSpeakService()
