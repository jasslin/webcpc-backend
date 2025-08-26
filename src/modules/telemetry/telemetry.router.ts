import { Router } from 'express';
import { Pool } from 'pg';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';

export const createTelemetryRouter = (pool: Pool): Router => {
  const router = Router();
  const telemetryService = new TelemetryService(pool);
  const telemetryController = new TelemetryController(telemetryService);

  // Telemetry data ingestion
  router.post('/batch', telemetryController.insertTelemetryBatch);

  // Vehicle tracking
  router.get('/vehicle/:licensePlate/track', telemetryController.getVehicleTrack);

  // Geospatial queries
  router.get('/nearby', telemetryController.getNearbyVehicles);

  // Real-time data
  router.get('/realtime-summary', telemetryController.getRealtimeSummary);

  // Performance monitoring
  router.get('/performance/metrics', telemetryController.getPerformanceMetrics);
  router.get('/performance/alerts', telemetryController.getPerformanceAlerts);

  // Analytics
  router.get('/analytics/vehicle-daily', telemetryController.getVehicleDailySummary);
  router.get('/analytics/driver-daily', telemetryController.getDriverDailySummary);

  return router;
};
