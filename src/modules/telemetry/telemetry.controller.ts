import { Request, Response } from 'express';
import { TelemetryService } from './telemetry.service';
import { VehicleTelemetry } from '../../types/telemetry';

export class TelemetryController {
  constructor(private telemetryService: TelemetryService) {}

  /**
   * POST /telemetry/batch - Insert bulk telemetry data
   */
  insertTelemetryBatch = async (req: Request, res: Response): Promise<void> => {
    try {
      const telemetryData: VehicleTelemetry[] = req.body;

      if (!Array.isArray(telemetryData) || telemetryData.length === 0) {
        res.status(400).json({ error: 'Invalid telemetry data format' });
        return;
      }

      const insertedCount = await this.telemetryService.insertTelemetryBatch(telemetryData);

      res.status(201).json({
        success: true,
        message: `Successfully inserted ${insertedCount} telemetry records`,
        count: insertedCount,
      });
    } catch (error) {
      console.error('Error inserting telemetry batch:', error);
      res.status(500).json({ error: 'Failed to insert telemetry data' });
    }
  };

  /**
   * GET /telemetry/vehicle/:licensePlate/track - Get vehicle track data
   */
  getVehicleTrack = async (req: Request, res: Response): Promise<void> => {
    try {
      const { licensePlate } = req.params;
      const { startTime, endTime, limit } = req.query;

      const track = await this.telemetryService.getVehicleTrack(
        licensePlate,
        startTime ? new Date(startTime as string) : undefined,
        endTime ? new Date(endTime as string) : undefined,
        limit ? parseInt(limit as string) : undefined,
      );

      res.json({
        success: true,
        data: track,
        count: track.length,
      });
    } catch (error) {
      console.error('Error getting vehicle track:', error);
      res.status(500).json({ error: 'Failed to retrieve vehicle track' });
    }
  };

  /**
   * GET /telemetry/nearby - Find nearby vehicles
   */
  getNearbyVehicles = async (req: Request, res: Response): Promise<void> => {
    try {
      const { longitude, latitude, radius, timeWindow } = req.query;

      if (!longitude || !latitude) {
        res.status(400).json({ error: 'Longitude and latitude are required' });
        return;
      }

      const nearbyVehicles = await this.telemetryService.getNearbyVehicles(
        parseFloat(longitude as string),
        parseFloat(latitude as string),
        radius ? parseInt(radius as string) : 1000,
        timeWindow ? parseInt(timeWindow as string) : 15,
      );

      res.json({
        success: true,
        data: nearbyVehicles,
        count: nearbyVehicles.length,
      });
    } catch (error) {
      console.error('Error finding nearby vehicles:', error);
      res.status(500).json({ error: 'Failed to find nearby vehicles' });
    }
  };

  /**
   * GET /telemetry/realtime-summary - Get real-time vehicle status
   */
  getRealtimeSummary = async (req: Request, res: Response): Promise<void> => {
    try {
      const summary = await this.telemetryService.getRealtimeVehicleSummary();

      res.json({
        success: true,
        data: summary,
        count: summary.length,
      });
    } catch (error) {
      console.error('Error getting realtime summary:', error);
      res.status(500).json({ error: 'Failed to retrieve realtime summary' });
    }
  };

  /**
   * GET /telemetry/performance/metrics - Get performance metrics
   */
  getPerformanceMetrics = async (req: Request, res: Response): Promise<void> => {
    try {
      const metrics = await this.telemetryService.getPerformanceMetrics();

      res.json({
        success: true,
        data: metrics,
        count: metrics.length,
      });
    } catch (error) {
      console.error('Error getting performance metrics:', error);
      res.status(500).json({ error: 'Failed to retrieve performance metrics' });
    }
  };

  /**
   * GET /telemetry/performance/alerts - Check for performance alerts
   */
  getPerformanceAlerts = async (req: Request, res: Response): Promise<void> => {
    try {
      const alerts = await this.telemetryService.checkPerformanceAlerts();

      res.json({
        success: true,
        data: alerts,
        count: alerts.length,
      });
    } catch (error) {
      console.error('Error checking performance alerts:', error);
      res.status(500).json({ error: 'Failed to check performance alerts' });
    }
  };

  /**
   * GET /telemetry/analytics/vehicle-daily - Get vehicle daily summary
   */
  getVehicleDailySummary = async (req: Request, res: Response): Promise<void> => {
    try {
      const { startDate, endDate, licensePlate } = req.query;

      if (!startDate || !endDate) {
        res.status(400).json({ error: 'Start date and end date are required' });
        return;
      }

      const summary = await this.telemetryService.getVehicleDailySummary(
        new Date(startDate as string),
        new Date(endDate as string),
        licensePlate as string,
      );

      res.json({
        success: true,
        data: summary,
        count: summary.length,
      });
    } catch (error) {
      console.error('Error getting vehicle daily summary:', error);
      res.status(500).json({ error: 'Failed to retrieve vehicle daily summary' });
    }
  };

  /**
   * GET /telemetry/analytics/driver-daily - Get driver daily summary
   */
  getDriverDailySummary = async (req: Request, res: Response): Promise<void> => {
    try {
      const { startDate, endDate, driverId } = req.query;

      if (!startDate || !endDate) {
        res.status(400).json({ error: 'Start date and end date are required' });
        return;
      }

      const summary = await this.telemetryService.getDriverDailySummary(
        new Date(startDate as string),
        new Date(endDate as string),
        driverId as string,
      );

      res.json({
        success: true,
        data: summary,
        count: summary.length,
      });
    } catch (error) {
      console.error('Error getting driver daily summary:', error);
      res.status(500).json({ error: 'Failed to retrieve driver daily summary' });
    }
  };
}
