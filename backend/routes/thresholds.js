import express from 'express';
import { getDb, logAudit } from '../services/db.js';
import { Config } from '../config.js';

const router = express.Router();

// GET /api/thresholds
router.get('/', (req, res) => {
  const db = getDb();
  let row = db.prepare('SELECT * FROM threshold_config WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get();
  
  if (!row) {
    row = Config.DEFAULT_THRESHOLDS;
  }

  // Ensure consecutive_anomaly_threshold is always 1 (Critical Rule #5)
  row.consecutive_anomaly_threshold = 1;

  res.json({
    success: true,
    active: row,
    baseline_calculated: Config.DEFAULT_THRESHOLDS
  });
});

// PUT /api/thresholds
router.put('/', (req, res) => {
  const data = req.body || {};
  const db = getDb();
  const nowIso = new Date().toISOString();

  const machineTempMin = parseFloat(data.machine_temp_min ?? data.normal_range_low ?? 20.0);
  const machineTempMax = parseFloat(data.machine_temp_max ?? data.normal_range_high ?? 55.0);
  const machineTempWarn = parseFloat(data.machine_temp_warning ?? 52.0);
  const machineTempCrit = parseFloat(data.machine_temp_critical ?? 55.0);

  const ambTempMin = parseFloat(data.ambient_temp_min ?? 15.0);
  const ambTempMax = parseFloat(data.ambient_temp_max ?? 42.0);
  const ambTempWarn = parseFloat(data.ambient_temp_warning ?? 40.0);
  const ambTempCrit = parseFloat(data.ambient_temp_critical ?? 42.0);

  const vibMin = parseFloat(data.vibration_min ?? 0.1);
  const vibMax = parseFloat(data.vibration_max ?? 4.5);
  const vibWarn = parseFloat(data.vibration_warning ?? 3.5);
  const vibCrit = parseFloat(data.vibration_critical ?? 4.5);

  const rpmMin = parseFloat(data.rpm_min ?? 800.0);
  const rpmMax = parseFloat(data.rpm_max ?? 3200.0);
  const rpmWarn = parseFloat(data.rpm_warning ?? 3000.0);
  const rpmCrit = parseFloat(data.rpm_critical ?? 3200.0);

  const pressMin = parseFloat(data.pressure_min ?? 1.0);
  const pressMax = parseFloat(data.pressure_max ?? 8.0);
  const pressWarn = parseFloat(data.pressure_warning ?? 7.0);
  const pressCrit = parseFloat(data.pressure_critical ?? 8.0);

  const curMin = parseFloat(data.current_min ?? 2.0);
  const curMax = parseFloat(data.current_max ?? 25.0);

  const voltMin = parseFloat(data.voltage_min ?? 200.0);
  const voltMax = parseFloat(data.voltage_max ?? 250.0);

  // Deactivate older configurations
  db.prepare('UPDATE threshold_config SET is_active = 0').run();

  // Insert active threshold row (enforcing consecutive_anomaly_threshold = 1)
  db.prepare(`
    INSERT INTO threshold_config (
      machine_temp_min, machine_temp_max, machine_temp_warning, machine_temp_critical,
      ambient_temp_min, ambient_temp_max, ambient_temp_warning, ambient_temp_critical,
      normal_range_low, normal_range_high,
      vibration_min, vibration_max, vibration_warning, vibration_critical,
      rpm_min, rpm_max, rpm_warning, rpm_critical,
      pressure_min, pressure_max, pressure_warning, pressure_critical,
      current_min, current_max, voltage_min, voltage_max,
      consecutive_anomaly_threshold, is_active, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 'ADMIN', ?)
  `).run(
    machineTempMin, machineTempMax, machineTempWarn, machineTempCrit,
    ambTempMin, ambTempMax, ambTempWarn, ambTempCrit,
    machineTempMin, machineTempMax,
    vibMin, vibMax, vibWarn, vibCrit,
    rpmMin, rpmMax, rpmWarn, rpmCrit,
    pressMin, pressMax, pressWarn, pressCrit,
    curMin, curMax, voltMin, voltMax,
    nowIso
  );

  const updated = db.prepare('SELECT * FROM threshold_config WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get();
  logAudit(db, 'ADMIN', 'ADMIN', 'UPDATE_THRESHOLDS', 'Updated machine anomaly thresholds. Trigger set to 1 anomaly.');

  res.json({
    success: true,
    message: 'Machine thresholds updated successfully. 1-anomaly immediate alert rule active.',
    thresholds: updated
  });
});

// POST /api/thresholds/reset
router.post('/reset', (req, res) => {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const dt = Config.DEFAULT_THRESHOLDS;

  db.prepare('UPDATE threshold_config SET is_active = 0').run();

  db.prepare(`
    INSERT INTO threshold_config (
      machine_temp_min, machine_temp_max, machine_temp_warning, machine_temp_critical,
      ambient_temp_min, ambient_temp_max, ambient_temp_warning, ambient_temp_critical,
      normal_range_low, normal_range_high,
      vibration_min, vibration_max, vibration_warning, vibration_critical,
      rpm_min, rpm_max, rpm_warning, rpm_critical,
      pressure_min, pressure_max, pressure_warning, pressure_critical,
      current_min, current_max, voltage_min, voltage_max,
      consecutive_anomaly_threshold, is_active, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 'SYSTEM', ?)
  `).run(
    dt.machine_temp_min, dt.machine_temp_max, dt.machine_temp_warning, dt.machine_temp_critical,
    dt.ambient_temp_min, dt.ambient_temp_max, dt.ambient_temp_warning, dt.ambient_temp_critical,
    dt.normal_range_low, dt.normal_range_high,
    dt.vibration_min, dt.vibration_max, dt.vibration_warning, dt.vibration_critical,
    dt.rpm_min, dt.rpm_max, dt.rpm_warning, dt.rpm_critical,
    dt.pressure_min, dt.pressure_max, dt.pressure_warning, dt.pressure_critical,
    dt.current_min, dt.current_max, dt.voltage_min, dt.voltage_max,
    nowIso
  );

  const resetRow = db.prepare('SELECT * FROM threshold_config WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get();
  logAudit(db, 'ADMIN', 'ADMIN', 'RESET_THRESHOLDS', 'Reset machine thresholds to default baseline.');

  res.json({
    success: true,
    message: 'Thresholds reset to calculated defaults.',
    thresholds: resetRow
  });
});

export default router;
