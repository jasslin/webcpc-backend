import { Pool } from 'pg';
import { VehicleTelemetry } from '../../types/telemetry';

export class TelemetryService {
  constructor(private pool: Pool) {}

  /**
   * Insert bulk telemetry data using the optimized bulk insert function
   */
  async insertTelemetryBatch(telemetryData: VehicleTelemetry[]): Promise<number> {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT bulk_insert_telemetry($1)', [
        JSON.stringify(telemetryData),
      ]);
      return result.rows[0].bulk_insert_telemetry;
    } finally {
      client.release();
    }
  }

  /**
   * Get vehicle track for a specific license plate
   */
  async getVehicleTrack(
    licensePlate: string,
    startTime?: Date,
    endTime?: Date,
    limit?: number,
  ): Promise<VehicleTelemetry[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM get_vehicle_track_by_license_plate($1, $2, $3, $4)',
        [
          licensePlate,
          startTime || new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
          endTime || new Date(),
          limit || 1000,
        ],
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Find nearby vehicles within a radius
   */
  async getNearbyVehicles(
    longitude: number,
    latitude: number,
    radiusMeters: number = 1000,
    timeWindowMinutes: number = 15,
  ): Promise<VehicleTelemetry[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT * FROM get_nearby_vehicles($1, $2, $3, $4)', [
        longitude,
        latitude,
        radiusMeters,
        `${timeWindowMinutes} minutes`,
      ]);
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Get real-time vehicle status summary
   */
  async getRealtimeVehicleSummary(): Promise<Record<string, unknown>[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM analytics.mv_vehicle_realtime_summary ORDER BY last_update DESC',
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Get telemetry performance metrics
   */
  async getPerformanceMetrics(): Promise<Record<string, unknown>[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT * FROM monitoring.v_telemetry_performance');
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Check for telemetry performance alerts
   */
  async checkPerformanceAlerts(): Promise<Record<string, unknown>[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT * FROM check_telemetry_performance()');
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Get vehicle daily summary for a specific date range
   */
  async getVehicleDailySummary(
    startDate: Date,
    endDate: Date,
    licensePlate?: string,
  ): Promise<Record<string, unknown>[]> {
    const client = await this.pool.connect();
    try {
      let query = `
        SELECT * FROM analytics.cagg_vehicle_daily_summary 
        WHERE date BETWEEN $1 AND $2
      `;
      const params: unknown[] = [startDate, endDate];

      if (licensePlate) {
        query += ' AND license_plate = $3';
        params.push(licensePlate);
      }

      query += ' ORDER BY date DESC, license_plate';

      const result = await client.query(query, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Get driver daily summary for performance analysis
   */
  async getDriverDailySummary(
    startDate: Date,
    endDate: Date,
    driverId?: string,
  ): Promise<Record<string, unknown>[]> {
    const client = await this.pool.connect();
    try {
      let query = `
        SELECT * FROM analytics.cagg_driver_daily_summary 
        WHERE date BETWEEN $1 AND $2
      `;
      const params: unknown[] = [startDate, endDate];

      if (driverId) {
        query += ' AND driver_id = $3';
        params.push(driverId);
      }

      query += ' ORDER BY date DESC, driver_id';

      const result = await client.query(query, params);
      return result.rows;
    } finally {
      client.release();
    }
  }
}
