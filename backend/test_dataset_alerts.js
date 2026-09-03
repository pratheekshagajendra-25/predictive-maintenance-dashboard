import fs from 'fs';
import path from 'path';
import { getDb } from './services/db.js';
import { DatasetService } from './services/datasetService.js';
import { thingspeakService } from './services/thingspeakService.js';

async function runDatasetAlertsTest() {
  console.log('=== STARTING DATASET ANOMALY ALERT TEST ===');

  // 1. Create a temporary test CSV with 6 rows: 3 Normal and 3 Anomalies
  const testCsvContent = `temperature,ambient_temperature,vibration,rpm,pressure
42.0,28.0,1.2,1800,4.0
43.0,28.5,1.3,1810,4.1
95.5,30.0,1.5,1800,4.2
42.5,28.0,1.2,1800,4.0
45.0,29.0,12.5,1800,4.2
44.0,28.0,1.2,3500,4.2`;

  const tempCsvPath = path.resolve('./test_dataset_sample.csv');
  fs.writeFileSync(tempCsvPath, testCsvContent);
  console.log('Created test CSV file with 6 rows (3 normal, 3 anomalies: Temp 95.5, Vib 12.5, RPM 3500)');

  // 2. Process the dataset through DatasetService
  const result = await DatasetService.processDataset(tempCsvPath, 'test_dataset_sample.csv', 'ADMIN');
  console.log('Dataset Processing Result Summary:', result.summary);

  // 3. Verify Alert Count in database for this dataset
  const db = getDb();
  const alerts = db.prepare(`
    SELECT alert_id, entry_id, parameter, value, severity, status, email_sent, email_status, created_at
    FROM alerts
    ORDER BY id DESC
    LIMIT 10
  `).all();

  console.log('\n--- Recent Alerts in Alert History ---');
  for (const a of alerts) {
    console.log(`Alert ID: ${a.alert_id} | Entry/Row: ${a.entry_id} | Parameter: ${a.parameter} | Value: ${a.value} | Email: ${a.email_status}`);
  }

  // 4. Verify ThingSpeak Status is NOT LIVE
  const tsStatus = thingspeakService.getConnectionStatus();
  console.log('\n--- ThingSpeak Status Integrity Check ---');
  console.log('ThingSpeak Connected:', tsStatus.connected);
  console.log('ThingSpeak Status:', tsStatus.status);

  // 5. Test Duplicate Prevention: Process the exact same dataset file again
  console.log('\n--- Duplicate Prevention Test (Re-processing same dataset) ---');
  const dupResult = await DatasetService.processDataset(tempCsvPath, 'test_dataset_sample.csv', 'ADMIN');
  console.log('Duplicate Processing Summary (Alerts Created):', dupResult.summary.alertsCreated, '(Expected: 0 duplicate alerts created)');

  // Cleanup
  if (fs.existsSync(tempCsvPath)) fs.unlinkSync(tempCsvPath);
  console.log('\n=== TEST COMPLETE ===');
}

runDatasetAlertsTest().catch(console.error);
