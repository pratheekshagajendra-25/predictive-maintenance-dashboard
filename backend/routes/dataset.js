import express from 'express';
import multer from 'multer';
import path from 'path';
import { getDb } from '../services/db.js';
import { DatasetService } from '../services/datasetService.js';
import { Config } from '../config.js';

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, Config.UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9\._-]/g, '_')}`;
    cb(null, uniqueSuffix);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50 MB
});

// POST /api/dataset/upload-validate
router.post('/upload-validate', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file was uploaded.' });
  }

  const filePath = req.file.path;
  const originalName = req.file.originalname;

  try {
    const result = await DatasetService.processDataset(filePath, originalName, 'ADMIN');
    res.json({
      success: true,
      message: `Successfully processed ${result.summary.totalRows} rows from ${originalName}.`,
      ...result
    });
  } catch (err) {
    res.status(400).json({ success: false, error: `Dataset processing failed: ${err.message}` });
  }
});

// POST /api/dataset/import
router.post('/import', async (req, res) => {
  const { tempFilePath, filename } = req.body || {};
  if (!tempFilePath) {
    return res.status(400).json({ success: false, error: 'File path is required.' });
  }

  try {
    const result = await DatasetService.processDataset(tempFilePath, filename || 'dataset.xlsx', 'ADMIN');
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/dataset/current
router.get('/current', (req, res) => {
  const db = getDb();
  const dataset = db.prepare('SELECT * FROM uploaded_datasets WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get();
  
  if (!dataset) {
    return res.json({
      success: true,
      dataset: null
    });
  }

  let summary = {};
  try {
    summary = JSON.parse(dataset.validation_summary || '{}');
  } catch {
    summary = {};
  }

  res.json({
    success: true,
    dataset: {
      ...dataset,
      summary
    }
  });
});

// POST /api/dataset/reset: Clear all dataset records, simulated test anomalies, and alerts to 0
router.post('/reset', (req, res) => {
  const db = getDb();
  try {
    db.prepare("DELETE FROM readings WHERE data_source IN ('DATASET_UPLOAD', 'DATASET', 'SIMULATED_TEST', 'MANUAL_TEST', 'API_DIRECT') OR is_live = 0").run();
    db.prepare("DELETE FROM alerts").run();
    db.prepare("DELETE FROM uploaded_datasets").run();
    db.prepare("DELETE FROM alert_idempotency").run();
    res.json({ success: true, message: 'Dataset records, simulated anomalies, and alerts cleared successfully. Dashboard reset to 0.' });
  } catch (err) {
    res.status(500).json({ success: false, error: `Failed to reset dataset: ${err.message}` });
  }
});

export default router;
