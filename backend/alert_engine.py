import datetime
import uuid
from database import get_db_connection, log_system_event, log_audit
from email_service import EmailService

class AlertEngine:
    def __init__(self):
        self.consecutive_anomaly_count = 0
        self.current_active_alert_id = None
        self.last_alert_timestamp = None
        # Load persisted state from DB so server restart doesn't reset the counter
        self._restore_state_from_db()

    def _restore_state_from_db(self):
        """
        On startup, restore in-memory state from the database so that a server
        restart in the middle of a consecutive-anomaly sequence does not silently
        reset the counter and miss generating an alert.
        """
        try:
            conn = get_db_connection()
            cursor = conn.cursor()

            # Restore consecutive_anomaly_count from the persisted system_state table if it
            # exists, otherwise fall back to counting recent live readings.
            cursor.execute("""
                SELECT name FROM sqlite_master
                WHERE type='table' AND name='alert_engine_state';
            """)
            if cursor.fetchone():
                cursor.execute(
                    "SELECT consecutive_anomaly_count, current_active_alert_id "
                    "FROM alert_engine_state WHERE id = 1;"
                )
                row = cursor.fetchone()
                if row:
                    self.consecutive_anomaly_count = row["consecutive_anomaly_count"] or 0
                    self.current_active_alert_id = row["current_active_alert_id"]
                    print(f"[ALERT ENGINE] Restored state: consecutive={self.consecutive_anomaly_count}, "
                          f"active_alert={self.current_active_alert_id}")
            else:
                # Table does not exist yet — create it and seed with zeroes
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS alert_engine_state (
                        id INTEGER PRIMARY KEY CHECK (id = 1),
                        consecutive_anomaly_count INTEGER NOT NULL DEFAULT 0,
                        current_active_alert_id TEXT,
                        updated_at TEXT NOT NULL
                    );
                """)
                cursor.execute("""
                    INSERT OR IGNORE INTO alert_engine_state
                        (id, consecutive_anomaly_count, current_active_alert_id, updated_at)
                    VALUES (1, 0, NULL, ?);
                """, (datetime.datetime.now(datetime.timezone.utc).isoformat(),))
                conn.commit()

            conn.close()
        except Exception as e:
            print(f"[ALERT ENGINE] Could not restore state from DB: {e}")

    def _persist_state(self):
        """Write the current in-memory state to the DB so it survives restarts."""
        try:
            conn = get_db_connection()
            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
            conn.execute("""
                INSERT INTO alert_engine_state
                    (id, consecutive_anomaly_count, current_active_alert_id, updated_at)
                VALUES (1, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    consecutive_anomaly_count = excluded.consecutive_anomaly_count,
                    current_active_alert_id   = excluded.current_active_alert_id,
                    updated_at                = excluded.updated_at;
            """, (self.consecutive_anomaly_count, self.current_active_alert_id, now_iso))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"[ALERT ENGINE] Failed to persist state: {e}")

    def process_reading_alerts(self, reading_data, threshold_config, health_data):
        machine_temp = reading_data.get("temperature", 0.0)
        ambient_temp = reading_data.get("ambient_temperature", 0.0)
        anomaly_flag = reading_data.get("anomaly_flag", 0)
        entry_id     = reading_data.get("entry_id")
        timestamp    = reading_data.get("created_at",
                       datetime.datetime.now(datetime.timezone.utc).isoformat())

        warning_thresh = threshold_config.get("machine_temp_warning", 52.29)
        critical_thresh = threshold_config.get("machine_temp_critical", 55.27)
        consec_req      = threshold_config.get("consecutive_anomaly_threshold", 3)

        # A reading is "abnormal" if it crosses the warning threshold OR the ML
        # models flagged it as an anomaly.
        is_abnormal = (
            machine_temp >= warning_thresh
            or anomaly_flag == 1
            or machine_temp >= critical_thresh
        )

        alert_generated = None

        if is_abnormal:
            self.consecutive_anomaly_count += 1
            print(f"[ALERT ENGINE] Anomaly detected! Consecutive count: "
                  f"{self.consecutive_anomaly_count} / {consec_req}")

            # Only create ONE alert per continuous anomaly event
            if self.consecutive_anomaly_count >= consec_req:
                severity = "CRITICAL"
                trigger_reason = (
                    f"Critical condition: {self.consecutive_anomaly_count} consecutive abnormal "
                    f"readings detected (Temp: {machine_temp:.2f}°C, "
                    f"Threshold: {critical_thresh:.2f}°C)."
                )
                recommended_action = (
                    "Immediate inspection of spindle cooling circuit, check lubricant "
                    "flow, and verify load distribution."
                )

                # Guard: only generate a NEW alert if no event is currently active
                if self.current_active_alert_id is None:
                    alert_id = (
                        f"ALT-{datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d')}"
                        f"-{uuid.uuid4().hex[:6].upper()}"
                    )
                    self.current_active_alert_id = alert_id
                    self.last_alert_timestamp = timestamp

                    # Gather threshold baseline for email body
                    try:
                        conn_t = get_db_connection()
                        t_row = conn_t.execute(
                            "SELECT * FROM threshold_config WHERE is_active=1 "
                            "ORDER BY id DESC LIMIT 1;"
                        ).fetchone()
                        conn_t.close()
                        t = dict(t_row) if t_row else {}
                    except Exception:
                        t = {}

                    alert_payload = {
                        "alert_id": alert_id,
                        "timestamp": timestamp,
                        "thingspeak_timestamp": reading_data.get("thingspeak_created_at", timestamp),
                        "severity": severity,
                        "machine_temperature": machine_temp,
                        "ambient_temperature": ambient_temp,
                        "threshold_value": critical_thresh,
                        "warning_threshold": warning_thresh,
                        "normal_range": (
                            f"{t.get('normal_range_low', 34.61)} – "
                            f"{t.get('normal_range_high', 49.05)} °C"
                        ),
                        "consecutive_count": self.consecutive_anomaly_count,
                        "anomaly_score": reading_data.get("anomaly_score",
                                         health_data.get("anomaly_score", 0.0)),
                        "health_score": health_data.get("health_score", 45.0),
                        "entry_id": entry_id,
                        "trigger_reason": trigger_reason,
                        "recommended_action": recommended_action,
                        "status": "ACTIVE"
                    }

                    # Persist alert to DB
                    conn = get_db_connection()
                    conn.execute("""
                        INSERT INTO alerts (
                            alert_id, timestamp, severity, machine_temperature,
                            ambient_temperature, threshold_value, consecutive_count,
                            health_score, trigger_reason, recommended_action,
                            status, email_sent, email_status
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 1, 'PROCESSING');
                    """, (
                        alert_id, timestamp, severity, machine_temp, ambient_temp,
                        critical_thresh, self.consecutive_anomaly_count,
                        health_data.get("health_score", 45.0),
                        trigger_reason, recommended_action
                    ))
                    conn.commit()
                    conn.close()

                    # Dispatch email alert
                    email_res = EmailService.send_alert_email(alert_payload)

                    conn = get_db_connection()
                    conn.execute(
                        "UPDATE alerts SET email_status = ? WHERE alert_id = ?;",
                        (email_res.get("status", "SENT"), alert_id)
                    )
                    conn.commit()
                    conn.close()

                    log_system_event(
                        "WARNING", "ALERT_ENGINE",
                        f"CRITICAL ALERT triggered: {alert_id}",
                        alert_payload
                    )
                    alert_generated = alert_payload

        else:
            # Normal reading — reset the consecutive counter
            if self.consecutive_anomaly_count > 0:
                print(
                    f"[ALERT ENGINE] Normal reading ({machine_temp:.2f}°C) received. "
                    f"Resetting consecutive counter from {self.consecutive_anomaly_count} to 0."
                )
            self.consecutive_anomaly_count = 0
            # Clear memory pointer so a future anomaly event triggers a fresh alert
            self.current_active_alert_id = None

        # Persist state to DB after every reading so restarts are safe
        self._persist_state()

        return {
            "consecutive_count": self.consecutive_anomaly_count,
            "is_abnormal": is_abnormal,
            "alert_generated": alert_generated
        }

    @staticmethod
    def acknowledge_alert(alert_id, username):
        conn = get_db_connection()
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE alerts
            SET status = 'ACKNOWLEDGED', acknowledged_by = ?, acknowledged_at = ?
            WHERE alert_id = ? AND status = 'ACTIVE';
        """, (username, now_iso, alert_id))
        rows_affected = cursor.rowcount
        conn.commit()
        conn.close()

        if rows_affected > 0:
            log_audit(username, "OPERATOR", "ACKNOWLEDGE_ALERT",
                      f"Acknowledged alert {alert_id}")
            log_system_event("INFO", "ALERT_ENGINE",
                             f"Alert {alert_id} acknowledged by {username}")
            return True
        return False

    @staticmethod
    def resolve_alert(alert_id, username, notes=""):
        conn = get_db_connection()
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE alerts
            SET status = 'RESOLVED', resolved_by = ?, resolved_at = ?,
                resolution_notes = ?
            WHERE alert_id = ?;
        """, (username, now_iso, notes, alert_id))
        rows_affected = cursor.rowcount
        conn.commit()
        conn.close()

        if rows_affected > 0:
            log_audit(username, "ENGINEER", "RESOLVE_ALERT",
                      f"Resolved alert {alert_id}. Notes: {notes}")
            log_system_event("INFO", "ALERT_ENGINE",
                             f"Alert {alert_id} resolved by {username}")
            return True
        return False


# Global Singleton — state is restored from DB inside __init__
alert_engine = AlertEngine()
