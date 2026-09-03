import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const Config = {
  PORT: parseInt(process.env.PORT || '5000', 10),
  HOST: process.env.HOST || '0.0.0.0',
  JWT_SECRET: process.env.JWT_SECRET || 'pm_super_secret_jwt_key_ind40_2026',
  BASE_DIR: __dirname,
  DATABASE_PATH: process.env.DATABASE_PATH || path.join(__dirname, 'predictive_maintenance.db'),
  UPLOADS_DIR: path.join(__dirname, 'uploads'),
  
  MACHINE_ID: process.env.MACHINE_ID || 'Machine-01',
  MACHINE_NAME: process.env.MACHINE_NAME || 'Machine 01',
  
  // Default SMTP Configuration
  DEFAULT_SMTP: {
    alert_recipient_email: process.env.ALERT_RECIPIENT_EMAIL || '',
    admin_email: process.env.ADMIN_EMAIL || 'admin@maintenance.io',
    customer_email: process.env.CUSTOMER_EMAIL || 'operator@client.com',
    smtp_host: process.env.SMTP_HOST || 'smtp.gmail.com',
    smtp_port: parseInt(process.env.SMTP_PORT || '587', 10),
    smtp_user: process.env.SMTP_USER || '',
    smtp_password: process.env.SMTP_PASSWORD || '',
    smtp_from: process.env.SMTP_FROM || 'alerts@predictive-maintenance.io',
    is_verified: 0,
    is_enabled: 1
  },

  // Default Anomaly Thresholds
  DEFAULT_THRESHOLDS: {
    machine_temp_min: 20.0,
    machine_temp_max: 55.0,
    machine_temp_warning: 52.0,
    machine_temp_critical: 55.0,
    ambient_temp_min: 15.0,
    ambient_temp_max: 42.0,
    ambient_temp_warning: 40.0,
    ambient_temp_critical: 42.0,
    normal_range_low: 34.0,
    normal_range_high: 49.0,
    vibration_min: 0.1,
    vibration_max: 4.5,
    vibration_warning: 3.5,
    vibration_critical: 4.5,
    rpm_min: 800.0,
    rpm_max: 3200.0,
    rpm_warning: 3000.0,
    rpm_critical: 3200.0,
    pressure_min: 1.0,
    pressure_max: 8.0,
    pressure_warning: 7.0,
    pressure_critical: 8.0,
    current_min: 2.0,
    current_max: 25.0,
    voltage_min: 200.0,
    voltage_max: 250.0,
    // Critical Alert Rule: EXACTLY 1 anomaly = immediate alert
    consecutive_anomaly_threshold: 1,
    is_active: 1
  }
};
