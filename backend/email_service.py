import smtplib
import socket
import ssl
import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from config import Config
from database import get_db_connection, log_system_event

class EmailService:
    @staticmethod
    def get_email_config():
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM email_config WHERE is_enabled = 1 ORDER BY id DESC LIMIT 1;")
            row = cursor.fetchone()
            conn.close()
            if row:
                return dict(row)
        except Exception as e:
            print(f"Error reading email_config: {e}")

        return {
            "alert_recipient_email": Config.ADMIN_EMAIL,
            "admin_email": Config.ADMIN_EMAIL,
            "customer_email": Config.CUSTOMER_EMAIL,
            "smtp_host": Config.SMTP_HOST,
            "smtp_port": Config.SMTP_PORT,
            "smtp_user": Config.SMTP_USER,
            "smtp_password": Config.SMTP_PASSWORD,
            "smtp_from": Config.SMTP_FROM,
            "is_enabled": 1
        }

    @classmethod
    def send_alert_email(cls, alert_data):
        cfg = cls.get_email_config()
        
        # Build recipients list with priority to alert_recipient_email
        raw_recipients = []
        if cfg.get("alert_recipient_email"):
            raw_recipients.append(cfg["alert_recipient_email"].strip())
        if cfg.get("admin_email"):
            raw_recipients.append(cfg["admin_email"].strip())
        if cfg.get("customer_email"):
            raw_recipients.append(cfg["customer_email"].strip())
        
        # Deduplicate and filter non-empty valid format
        recipients = list(set([r for r in raw_recipients if r and "@" in r and "." in r.split("@")[-1]]))
        if not recipients:
            err_msg = "INVALID RECIPIENT: No valid alert recipient email address is configured. Please enter a recipient in Email Alert Settings."
            return {
                "status": "FAILED",
                "error_code": "INVALID_RECIPIENT",
                "sent": False,
                "recipients": [],
                "error": err_msg,
                "message": err_msg
            }

        # Exact subject per Requirement #22
        subject = "Predictive Maintenance Alert - Critical Machine Condition"
        
        timestamp = alert_data.get("timestamp", datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"))
        thingspeak_ts = alert_data.get("thingspeak_timestamp", timestamp)
        machine_temp = float(alert_data.get("machine_temperature", 0.0))
        ambient_temp = float(alert_data.get("ambient_temperature", 0.0))
        warn_thresh = float(alert_data.get("warning_threshold", 52.29))
        crit_thresh = float(alert_data.get("threshold_value", 55.27))
        norm_range = str(alert_data.get("normal_range", "34.61 – 49.05 °C"))
        anomaly_score = float(alert_data.get("anomaly_score", 0.65))
        health_score = float(alert_data.get("health_score", 45.0))
        entry_id = alert_data.get("entry_id", "N/A")
        alert_id = alert_data.get("alert_id", "ALT-UNKNOWN")
        severity = alert_data.get("severity", "CRITICAL")
        action = alert_data.get("recommended_action", "Inspect machine condition and evaluate maintenance requirements.")
        dashboard_url = "http://localhost:5173"

        # Plain Text Body
        plain_text = f"""
======================================================================
PREDICTIVE MAINTENANCE ALERT
======================================================================
Machine:
{Config.MACHINE_NAME} ({Config.MACHINE_ID})

Alert:
3 consecutive abnormal readings detected

Machine Temperature:
{machine_temp:.2f} °C

Ambient Temperature:
{ambient_temp:.2f} °C

Normal Range:
{norm_range}

Warning Threshold:
{warn_thresh:.2f} °C

Critical Threshold:
{crit_thresh:.2f} °C

Anomaly Score:
{anomaly_score:.4f}

Machine Health Score:
{health_score:.1f} / 100

Detected At:
{thingspeak_ts}

ThingSpeak Entry ID:
#{entry_id}

Recommended Action:
{action}

Dashboard Link:
{dashboard_url}
======================================================================
"""

        # HTML Body
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {{ font-family: 'Segoe UI', Arial, sans-serif; background-color: #0B0F19; color: #F1F5F9; margin: 0; padding: 20px; }}
            .container {{ max-width: 600px; margin: 0 auto; background: #1E293B; border-radius: 12px; border: 1px solid #334155; overflow: hidden; }}
            .header {{ background: #DC2626; padding: 20px 24px; color: #FFFFFF; }}
            .header h1 {{ margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.5px; }}
            .content {{ padding: 24px; }}
            .badge {{ display: inline-block; padding: 4px 10px; border-radius: 6px; font-weight: bold; font-size: 11px; background: #EF4444; color: #FFF; }}
            .grid-table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
            .grid-table td {{ padding: 8px 4px; border-bottom: 1px solid #334155; font-size: 13px; }}
            .label {{ color: #94A3B8; font-weight: 500; }}
            .val {{ text-align: right; color: #F8FAFC; font-weight: 700; font-family: monospace; }}
            .action-box {{ background: #292524; border-left: 4px solid #F59E0B; padding: 14px; margin: 18px 0; border-radius: 4px; }}
            .btn {{ display: inline-block; background: #06B6D4; color: #0F172A; text-decoration: none; padding: 10px 24px; border-radius: 6px; font-weight: 700; font-size: 13px; }}
            .footer {{ background: #0F172A; padding: 14px 24px; text-align: center; color: #64748B; font-size: 11px; border-top: 1px solid #334155; }}
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🚨 Predictive Maintenance Alert</h1>
              <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.95;">Machine Condition Critical &bull; Event #{alert_id}</p>
            </div>
            <div class="content">
              <p><span class="badge">CRITICAL ALERT</span> &nbsp; <strong>3 Consecutive Abnormal Readings Detected</strong></p>

              <table class="grid-table">
                <tr><td class="label">Machine:</td><td class="val">{Config.MACHINE_NAME} ({Config.MACHINE_ID})</td></tr>
                <tr><td class="label">Machine Temperature:</td><td class="val" style="color: #F87171;">{machine_temp:.2f} °C</td></tr>
                <tr><td class="label">Ambient Temperature:</td><td class="val">{ambient_temp:.2f} °C</td></tr>
                <tr><td class="label">Normal Operating Range:</td><td class="val" style="color: #34D399;">{norm_range}</td></tr>
                <tr><td class="label">Warning Threshold:</td><td class="val" style="color: #FBBF24;">{warn_thresh:.2f} °C</td></tr>
                <tr><td class="label">Critical Threshold:</td><td class="val" style="color: #F87171;">{crit_thresh:.2f} °C</td></tr>
                <tr><td class="label">Anomaly Score:</td><td class="val">{anomaly_score:.4f}</td></tr>
                <tr><td class="label">Machine Health Score:</td><td class="val" style="color: #EF4444;">{health_score:.1f} / 100</td></tr>
                <tr><td class="label">Detected At:</td><td class="val">{thingspeak_ts}</td></tr>
                <tr><td class="label">ThingSpeak Entry ID:</td><td class="val">#{entry_id}</td></tr>
              </table>

              <div class="action-box">
                <strong style="color: #FBBF24; font-size: 12px; text-transform: uppercase;">Recommended Maintenance Action:</strong>
                <p style="margin: 4px 0 0 0; color: #E2E8F0; font-size: 13px;">{action}</p>
              </div>

              <center style="margin-top: 20px;">
                <a href="{dashboard_url}" class="btn">Open Telemetry Dashboard</a>
              </center>
            </div>
            <div class="footer">
              Automated Notification &bull; Industry 4.0 Predictive Maintenance System &bull; Location: {Config.LOCATION}
            </div>
          </div>
        </body>
        </html>
        """

        conn = get_db_connection()
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        smtp_host = str(cfg.get("smtp_host") or Config.SMTP_HOST or "").strip()
        smtp_user = str(cfg.get("smtp_user") or Config.SMTP_USER or "").strip()
        smtp_pass = str(cfg.get("smtp_password") or Config.SMTP_PASSWORD or "").strip()
        smtp_from = str(cfg.get("smtp_from") or Config.SMTP_FROM or "alerts@predictive-maintenance.io").strip()
        try:
            smtp_port = int(cfg.get("smtp_port") or Config.SMTP_PORT or 587)
        except (ValueError, TypeError):
            smtp_port = 587

        # 1. Validation: Check if SMTP is configured
        if not smtp_host or not smtp_user or not smtp_pass:
            err_msg = "EMAIL SERVICE NOT CONFIGURED: SMTP Server Host, Username/Email, and App Password must be filled in Email Alert Settings."
            print(f"[EMAIL SERVICE] {err_msg}")
            for rec in recipients:
                conn.execute("""
                INSERT INTO email_logs (timestamp, recipient, subject, severity, status, error_message, email_body)
                VALUES (?, ?, ?, ?, 'FAILED', ?, ?);
                """, (now_iso, rec, subject, severity, err_msg, plain_text))
            conn.commit()
            conn.close()
            return {
                "status": "NOT_CONFIGURED",
                "error_code": "EMAIL_SERVICE_NOT_CONFIGURED",
                "sent": False,
                "recipients": recipients,
                "error": err_msg,
                "message": err_msg
            }

        # 2. Validation: Hostname validation (must not contain '@')
        if "@" in smtp_host:
            err_msg = f"INVALID SMTP HOST: '{smtp_host}' looks like an email address. Enter a valid SMTP server hostname such as 'smtp.gmail.com'."
            conn.close()
            return {
                "status": "FAILED",
                "error_code": "INVALID_SMTP_HOST",
                "sent": False,
                "recipients": recipients,
                "error": err_msg,
                "message": err_msg
            }

        # 3. Validation: Port range check
        if smtp_port < 1 or smtp_port > 65535:
            err_msg = f"INVALID PORT: Port {smtp_port} is out of valid range (1-65535). Use 587 (STARTTLS) or 465 (SSL)."
            conn.close()
            return {
                "status": "FAILED",
                "error_code": "INVALID_PORT",
                "sent": False,
                "recipients": recipients,
                "error": err_msg,
                "message": err_msg
            }

        # 4. Attempt Real SMTP Transmission with Detailed Exception Handling
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = smtp_from
            msg["To"] = ", ".join(recipients)
            msg.attach(MIMEText(plain_text, "plain", "utf-8"))
            msg.attach(MIMEText(html_content, "html", "utf-8"))

            if smtp_port == 465:
                context = ssl.create_default_context()
                server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=12, context=context)
            else:
                server = smtplib.SMTP(smtp_host, smtp_port, timeout=12)
                context = ssl.create_default_context()
                server.starttls(context=context)

            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_from, recipients, msg.as_string())
            server.quit()

            print(f"[EMAIL SERVICE] Alert email delivered to {recipients} for Alert {alert_id}")
            for rec in recipients:
                conn.execute("""
                INSERT INTO email_logs (timestamp, recipient, subject, severity, status, error_message, email_body)
                VALUES (?, ?, ?, ?, 'SENT', NULL, ?);
                """, (now_iso, rec, subject, severity, plain_text))
            conn.commit()
            conn.close()
            return {
                "status": "SENT",
                "sent": True,
                "recipients": recipients,
                "message": f"Test email sent successfully to {', '.join(recipients)}"
            }

        except smtplib.SMTPAuthenticationError as auth_err:
            err_code = "SMTP_AUTH_FAILED"
            err_msg = (
                f"SMTP AUTHENTICATION FAILED: Username or password rejected by {smtp_host}. "
                "For Gmail, you must generate a 16-character App Password (at myaccount.google.com/apppasswords) "
                "and enable 2-Step Verification instead of using your normal account password."
            )
            print(f"[EMAIL SERVICE ERROR] {err_msg} ({auth_err})")
            log_system_event("ERROR", "EMAIL_SERVICE", f"{err_code}: {auth_err}")
            for rec in recipients:
                conn.execute("""
                INSERT INTO email_logs (timestamp, recipient, subject, severity, status, error_message, email_body)
                VALUES (?, ?, ?, ?, 'FAILED', ?, ?);
                """, (now_iso, rec, subject, severity, err_msg, plain_text))
            conn.commit()
            conn.close()
            return {
                "status": "FAILED",
                "error_code": err_code,
                "sent": False,
                "recipients": recipients,
                "error": err_msg,
                "message": err_msg
            }

        except (socket.gaierror, socket.timeout, smtplib.SMTPConnectError) as conn_err:
            err_code = "SMTP_CONNECTION_FAILED"
            err_msg = f"SMTP CONNECTION FAILED: Unable to reach {smtp_host} on port {smtp_port}. Check your internet connection, SMTP hostname, and firewall."
            print(f"[EMAIL SERVICE ERROR] {err_msg} ({conn_err})")
            log_system_event("ERROR", "EMAIL_SERVICE", f"{err_code}: {conn_err}")
            for rec in recipients:
                conn.execute("""
                INSERT INTO email_logs (timestamp, recipient, subject, severity, status, error_message, email_body)
                VALUES (?, ?, ?, ?, 'FAILED', ?, ?);
                """, (now_iso, rec, subject, severity, err_msg, plain_text))
            conn.commit()
            conn.close()
            return {
                "status": "FAILED",
                "error_code": err_code,
                "sent": False,
                "recipients": recipients,
                "error": err_msg,
                "message": err_msg
            }

        except (ssl.SSLError, smtplib.SMTPNotSupportedError) as ssl_err:
            err_code = "SMTP_TLS_ERROR"
            err_msg = f"SMTP TLS ERROR: Secure handshake failed with {smtp_host}:{smtp_port}. Verify port selection (587 for STARTTLS, 465 for SSL)."
            print(f"[EMAIL SERVICE ERROR] {err_msg} ({ssl_err})")
            log_system_event("ERROR", "EMAIL_SERVICE", f"{err_code}: {ssl_err}")
            for rec in recipients:
                conn.execute("""
                INSERT INTO email_logs (timestamp, recipient, subject, severity, status, error_message, email_body)
                VALUES (?, ?, ?, ?, 'FAILED', ?, ?);
                """, (now_iso, rec, subject, severity, err_msg, plain_text))
            conn.commit()
            conn.close()
            return {
                "status": "FAILED",
                "error_code": err_code,
                "sent": False,
                "recipients": recipients,
                "error": err_msg,
                "message": err_msg
            }

        except smtplib.SMTPRecipientsRefused as rec_err:
            err_code = "SMTP_REJECTED"
            err_msg = f"SMTP REJECTED: The mail server {smtp_host} refused delivery to recipient(s): {recipients}."
            print(f"[EMAIL SERVICE ERROR] {err_msg} ({rec_err})")
            log_system_event("ERROR", "EMAIL_SERVICE", f"{err_code}: {rec_err}")
            for rec in recipients:
                conn.execute("""
                INSERT INTO email_logs (timestamp, recipient, subject, severity, status, error_message, email_body)
                VALUES (?, ?, ?, ?, 'FAILED', ?, ?);
                """, (now_iso, rec, subject, severity, err_msg, plain_text))
            conn.commit()
            conn.close()
            return {
                "status": "FAILED",
                "error_code": err_code,
                "sent": False,
                "recipients": recipients,
                "error": err_msg,
                "message": err_msg
            }

        except Exception as e:
            err_code = "SMTP_ERROR"
            err_msg = f"SMTP ERROR: {str(e)}"
            print(f"[EMAIL SERVICE ERROR] {err_msg}")
            log_system_event("ERROR", "EMAIL_SERVICE", err_msg)
            for rec in recipients:
                conn.execute("""
                INSERT INTO email_logs (timestamp, recipient, subject, severity, status, error_message, email_body)
                VALUES (?, ?, ?, ?, 'FAILED', ?, ?);
                """, (now_iso, rec, subject, severity, err_msg, plain_text))
            conn.commit()
            conn.close()
            return {
                "status": "FAILED",
                "error_code": err_code,
                "sent": False,
                "recipients": recipients,
                "error": err_msg,
                "message": err_msg
            }

