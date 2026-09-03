import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Config } from './config.js';
import { getDb } from './services/db.js';
import { thingspeakService } from './services/thingspeakService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Route Handlers
import authRouter from './routes/auth.js';
import healthRouter from './routes/health.js';
import readingsRouter from './routes/readings.js';
import anomaliesRouter from './routes/anomalies.js';
import alertsRouter from './routes/alerts.js';
import smtpRouter from './routes/smtp.js';
import thresholdsRouter from './routes/thresholds.js';
import thingspeakRouter from './routes/thingspeak.js';
import datasetRouter from './routes/dataset.js';
import statisticsRouter from './routes/statistics.js';
import systemRouter from './routes/system.js';
import modelsRouter from './routes/models.js';
import shapRouter from './routes/shap.js';

const app = express();

// Initialize SQLite database
getDb();

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Static uploads folder
app.use('/uploads', express.static(Config.UPLOADS_DIR));

// Root Health
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Predictive Maintenance Full-Stack API',
    machine: Config.MACHINE_NAME,
    machine_id: Config.MACHINE_ID,
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/health', healthRouter);
app.use('/api/readings', readingsRouter);
app.use('/api/anomalies', anomaliesRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/smtp', smtpRouter);
app.use('/api/email', smtpRouter); // Backward-compatible alias
app.use('/api/thresholds', thresholdsRouter);
app.use('/api/thingspeak', thingspeakRouter);
app.use('/api/dataset', datasetRouter);
app.use('/api/statistics', statisticsRouter);
app.use('/api/system', systemRouter);
app.use('/api/models', modelsRouter);
app.use('/api/shap', shapRouter);
app.use('/api', systemRouter); // Mounts /api/simulate-alert-demo directly

// Start ThingSpeak background poller if enabled
try {
  thingspeakService.startPolling();
} catch (err) {
  console.warn(`[THINGSPEAK] Background poller startup warning: ${err.message}`);
}

// Serve static frontend build in production
const frontendDist = path.resolve(__dirname, '../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return next();
    }
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Start Server on PORT 5000
const PORT = process.env.PORT || Config.PORT || 5000;
const server = app.listen(PORT, Config.HOST, () => {
  console.log('============================================================');
  console.log(`Backend server running on port ${PORT}`);
  console.log(`API URL: http://localhost:${PORT}/api`);
  console.log(`Machine Target: ${Config.MACHINE_NAME} [${Config.MACHINE_ID}]`);
  console.log('Immediate 1-Anomaly Alert Sentinel: ACTIVE');
  console.log('============================================================');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[UNHANDLED SERVER ERROR]', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

export default app;
