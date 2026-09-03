import express from 'express';
import { mlService } from '../services/mlService.js';

const router = express.Router();

// GET /api/models
router.get('/', (req, res) => {
  try {
    const models = mlService.getModels();
    res.json({
      success: true,
      total_models: models.length,
      split: 'Hold-out Test Split (N=788 observations)',
      models
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: `Failed to retrieve ML models: ${err.message}`
    });
  }
});

export default router;
