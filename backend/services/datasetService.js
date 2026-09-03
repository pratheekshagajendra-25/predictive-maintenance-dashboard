import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';
import csvParser from 'csv-parser';
import { getDb, logAudit } from './db.js';
import { AnomalyEngine } from './anomalyEngine.js';
import { HealthScoreEngine } from './healthScoreEngine.js';
import { AlertEngine } from './alertEngine.js';

export class DatasetService {
  /**
   * Reads and parses a CSV or XLSX file buffer or file path.
   */
  static parseFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.xlsx' || ext === '.xls') {
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      return xlsx.utils.sheet_to_json(sheet, { defval: null });
    }

    // CSV fallback
    return new Promise((resolve, reject) => {
      const results = [];
      fs.createReadStream(filePath)
        .pipe(csvParser())
        .on('data', (data) => results.push(data))
        .on('end', () => resolve(results))
        .on('error', (err) => reject(err));
    });
  }

  /**
   * Standardizes column names to canonical schema keys.
   */
  static normalizeKey(key) {
    const k = String(key || '').toLowerCase().trim().replace(/[\s_\-\.]+/g, '_');
    if (k.includes('machine_temp') || k.includes('machinetemp') || (k.includes('temp') && !k.includes('amb'))) return 'temperature';
    if (k.includes('ambient_temp') || k.includes('ambienttemp') || k.includes('amb_temp') || k.includes('room_temp')) return 'ambient_temperature';
    if (k.includes('vib') || k.includes('vibration')) return 'vibration';
    if (k.includes('rpm') || k.includes('speed') || k.includes('rotation')) return 'rpm';
    if (k.includes('press') || k.includes('pressure') || k.includes('bar')) return 'pressure';
    if (k.includes('curr') || k.includes('current') || k.includes('amp')) return 'current';
    if (k.includes('volt') || k.includes('voltage')) return 'voltage';
    if (k.includes('power') || k.includes('watt') || k.includes('kw')) return 'power';
    if (k.includes('time') || k.includes('date')) return 'timestamp';
    if (k.includes('machine') || k.includes('spindle')) return 'machine_id';
    if (k.includes('anomaly') || k.includes('label') || k.includes('fault')) return 'anomaly_flag';
    return k;
  }

  /**
   * Validates and processes uploaded dataset with full anomaly detection and dynamic health scoring.
   * 
   * Dynamic Health Score Rule:
   * Every row receives a real, calculated Health Score strictly between 0 and 100.
   */
  static async processDataset(filePath, originalFilename = 'dataset.csv', uploadedBy = 'ADMIN') {
    const rawRows = await this.parseFile(filePath);
    const totalRows = rawRows.length;

    if (totalRows === 0) {
      throw new Error('Uploaded dataset is empty or contains no valid rows.');
    }

    const db = getDb();
    const thresholds = db.prepare('SELECT * FROM threshold_config WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get() || {};

    let validRows = 0;
    let missingValuesCount = 0;
    let normalCount = 0;
    let anomalyCount = 0;
    let totalHealthSum = 0;
    const processedReadings = [];
    const anomalyRows = [];

    // Temporary unique dataset upload run ID
    const datasetRunId = Date.now();

    for (let i = 0; i < rawRows.length; i++) {
      const raw = rawRows[i];
      const normalized = {};

      for (const [key, value] of Object.entries(raw)) {
        const normKey = this.normalizeKey(key);
        normalized[normKey] = value;
      }

      // Check missing fields and sanitize
      let temp = parseFloat(normalized.temperature);
      let ambTemp = parseFloat(normalized.ambient_temperature);
      let vibration = parseFloat(normalized.vibration);
      let rpm = parseFloat(normalized.rpm);
      let pressure = parseFloat(normalized.pressure);
      let current = parseFloat(normalized.current);
      let voltage = parseFloat(normalized.voltage);
      let power = parseFloat(normalized.power);

      if (isNaN(temp)) {
        temp = 42.0; // Safe default
        missingValuesCount++;
      }
      if (isNaN(ambTemp)) {
        ambTemp = 28.0;
        missingValuesCount++;
      }
      if (isNaN(vibration)) vibration = 1.2;
      if (isNaN(rpm)) rpm = 1800.0;
      if (isNaN(pressure)) pressure = 4.0;
      if (isNaN(current)) current = 8.5;
      if (isNaN(voltage)) voltage = 230.0;
      if (isNaN(power)) power = +(current * voltage / 1000).toFixed(2);

      const timestamp = normalized.timestamp ? new Date(normalized.timestamp).toISOString() : new Date(Date.now() - (rawRows.length - i) * 60000).toISOString();
      const machineId = normalized.machine_id || 'Machine-01';
      const rowNumber = i + 1;

      const readingData = {
        machine_id: machineId,
        dataset_id: datasetRunId,
        dataset_name: originalFilename,
        row_number: rowNumber,
        entry_id: rowNumber,
        created_at: timestamp,
        temperature: +temp.toFixed(2),
        ambient_temperature: +ambTemp.toFixed(2),
        vibration: +vibration.toFixed(2),
        rpm: +rpm.toFixed(1),
        pressure: +pressure.toFixed(2),
        current: +current.toFixed(2),
        voltage: +voltage.toFixed(1),
        power: +power.toFixed(2),
        is_live: 0, // MUST BE 0 so it never affects ThingSpeak Live status
        data_source: 'DATASET_UPLOAD'
      };

      // 1. Anomaly detection for EVERY row
      const anomalyRes = AnomalyEngine.analyze(readingData, thresholds);
      readingData.anomaly_flag = anomalyRes.isAnomaly ? 1 : 0;
      readingData.anomaly_score = anomalyRes.anomalyScore;
      readingData.condition = anomalyRes.condition;
      readingData.detection_method = anomalyRes.detectionMethod;

      // 2. Dynamic Machine Health Score calculation for EVERY row
      const healthRes = HealthScoreEngine.calculate(readingData, thresholds);
      readingData.health_score = healthRes.healthScore;
      readingData.machine_status = healthRes.status;

      totalHealthSum += healthRes.healthScore;

      if (anomalyRes.isAnomaly) {
        anomalyCount++;
        anomalyRows.push({ readingData, anomalyRes, healthRes });
      } else {
        normalCount++;
      }

      validRows++;
      processedReadings.push(readingData);
    }

    const anomalyPercentage = totalRows > 0 ? +((anomalyCount / totalRows) * 100).toFixed(2) : 0;
    const qualityScore = totalRows > 0 ? Math.max(0, +((1 - missingValuesCount / (totalRows * 5)) * 100).toFixed(1)) : 100;
    const avgHealthScore = totalRows > 0 ? +(totalHealthSum / totalRows).toFixed(1) : 100.0;

    // Batch insert into readings table inside a transaction
    const insertStmt = db.prepare(`
      INSERT INTO readings (
        machine_id, entry_id, created_at, fetch_timestamp,
        temperature, ambient_temperature, vibration, rpm, pressure,
        current, voltage, power,
        condition, anomaly_flag, anomaly_score, health_score,
        detection_method, is_live, data_source, created_timestamp
      ) VALUES (
        @machine_id, @entry_id, @created_at, @created_at,
        @temperature, @ambient_temperature, @vibration, @rpm, @pressure,
        @current, @voltage, @power,
        @condition, @anomaly_flag, @anomaly_score, @health_score,
        @detection_method, 0, 'DATASET_UPLOAD', ${Date.now() / 1000}
      )
    `);

    const insertMany = db.transaction((readings) => {
      for (const r of readings) insertStmt.run(r);
    });

    insertMany(processedReadings);

    // Save dataset record in uploaded_datasets
    const datasetRow = db.prepare(`
      INSERT INTO uploaded_datasets (
        filename, file_path, row_count, column_count,
        quality_score, normal_count, anomaly_count, validation_summary,
        is_active, uploaded_by, uploaded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      originalFilename, filePath, totalRows, Object.keys(rawRows[0] || {}).length,
      qualityScore, normalCount, anomalyCount,
      JSON.stringify({
        totalRows,
        validRows,
        missingValuesCount,
        normalCount,
        anomalyCount,
        anomalyPercentage,
        qualityScore,
        avgHealthScore
      }),
      uploadedBy, new Date().toISOString()
    );

    const actualDatasetId = datasetRow.lastInsertRowid;

    // Execute COMMON ALERT SERVICE for EVERY anomalous row in dataset
    let alertsCreated = 0;
    let emailsSent = 0;
    for (const anom of anomalyRows) {
      anom.readingData.dataset_id = actualDatasetId;
      const alertResult = await AlertEngine.processReading(
        anom.readingData,
        anom.anomalyRes,
        thresholds,
        anom.healthRes
      );
      if (alertResult.alertCreated) {
        alertsCreated++;
        if (alertResult.emailSent) emailsSent++;
      }
    }

    logAudit(db, uploadedBy, 'ADMIN', 'DATASET_UPLOAD', `Uploaded ${totalRows} rows from ${originalFilename}. Detected ${anomalyCount} anomalies. Avg Health Score: ${avgHealthScore}%. Created ${alertsCreated} alerts.`);

    return {
      success: true,
      datasetId: actualDatasetId,
      filename: originalFilename,
      summary: {
        totalRows,
        validRows,
        missingValuesCount,
        normalCount,
        anomalyCount,
        anomalyPercentage,
        qualityScore,
        avgHealthScore,
        alertsCreated,
        emailsSent
      },
      previewRows: processedReadings.slice(0, 50)
    };
  }
}
