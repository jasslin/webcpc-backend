import express, { Request, Response } from 'express';
import { healthRouter } from './modules/health/health.router';
import { createTelemetryRouter } from './modules/telemetry/telemetry.router';
import { createDatabasePool, testDatabaseConnection } from './config/database';

export const app = express();

// Create database pool
const pool = createDatabasePool();

// Test database connection on startup
testDatabaseConnection(pool).catch((error) => {
  console.error('Failed to connect to database:', error);
  process.exit(1);
});

app.use(express.json({ limit: '10mb' })); // Increase limit for bulk telemetry data

// Routes
app.use('/health', healthRouter);
app.use('/api/telemetry', createTelemetryRouter(pool));

app.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'VDRS Telemetry Backend',
    version: '1.0.0',
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  await pool.end();
  process.exit(0);
});
