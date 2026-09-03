import express from 'express';
import { mlService } from '../services/mlService.js';

const router = express.Router();

// GET /api/shap
router.get('/', (req, res) => {
  try {
    const featureImportance = mlService.getFeatureImportance();
    const shapSummary = mlService.getShapSummary();
    res.json({
      success: true,
      feature_importance: featureImportance,
      shap_summary: shapSummary
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: `Failed to retrieve SHAP data: ${err.message}`
    });
  }
});

// POST /api/shap/explain
router.post('/explain', (req, res) => {
  try {
    const { temperature, ambient_temperature } = req.body || {};
    const explanation = mlService.explainReading(temperature, ambient_temperature);
    res.json(explanation);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: `Failed to explain reading: ${err.message}`
    });
  }
});

export default router;
