/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  // Create analytics.v_daily_vehicle_summary view
  pgm.sql(`
    CREATE OR REPLACE VIEW analytics.v_daily_vehicle_summary AS
    SELECT 
      DATE_TRUNC('day', time) as date,
      license_plate,
      COUNT(*) as total_records,
      AVG(speed) as avg_speed,
      MAX(speed) as max_speed,
      MIN(speed) as min_speed,
      AVG(rpm) as avg_rpm,
      SUM(CASE WHEN is_speeding THEN 1 ELSE 0 END) as speeding_incidents,
      SUM(CASE WHEN is_moving THEN 1 ELSE 0 END) as moving_records,
      ST_AsText(ST_Centroid(ST_Collect(geom))) as center_point,
      ST_Length(ST_MakeLine(geom ORDER BY time)) as total_distance_meters
    FROM telemetry.vehicle_telemetry
    WHERE geom IS NOT NULL
    GROUP BY DATE_TRUNC('day', time), license_plate
    ORDER BY date DESC, license_plate;
  `);

  // Create analytics.v_daily_driver_summary view
  pgm.sql(`
    CREATE OR REPLACE VIEW analytics.v_daily_driver_summary AS
    SELECT 
      DATE_TRUNC('day', time) as date,
      driver_id,
      COUNT(DISTINCT license_plate) as vehicles_assigned,
      COUNT(*) as total_records,
      AVG(speed) as avg_speed,
      MAX(speed) as max_speed,
      SUM(CASE WHEN is_speeding THEN 1 ELSE 0 END) as speeding_incidents,
      SUM(CASE WHEN is_moving THEN 1 ELSE 0 END) as moving_records,
      AVG(battery_voltage) as avg_battery_voltage,
      AVG(engine_temperature) as avg_engine_temperature
    FROM telemetry.vehicle_telemetry
    WHERE driver_id IS NOT NULL
    GROUP BY DATE_TRUNC('day', time), driver_id
    ORDER BY date DESC, driver_id;
  `);

  // Create analytics.v_vehicle_track_summary view
  pgm.sql(`
    CREATE OR REPLACE VIEW analytics.v_vehicle_track_summary AS
    SELECT 
      license_plate,
      DATE_TRUNC('hour', time) as hour_bucket,
      COUNT(*) as records_count,
      MIN(time) as start_time,
      MAX(time) as end_time,
      AVG(speed) as avg_speed,
      MAX(speed) as max_speed,
      ST_AsText(ST_StartPoint(ST_MakeLine(geom ORDER BY time))) as start_point,
      ST_AsText(ST_EndPoint(ST_MakeLine(geom ORDER BY time))) as end_point,
      ST_Length(ST_MakeLine(geom ORDER BY time)) as distance_meters,
      ST_AsText(ST_Centroid(ST_Collect(geom))) as center_point
    FROM telemetry.vehicle_telemetry
    WHERE geom IS NOT NULL
    GROUP BY license_plate, DATE_TRUNC('hour', time)
    ORDER BY license_plate, hour_bucket DESC;
  `);

  // Create analytics.v_performance_metrics view
  pgm.sql(`
    CREATE OR REPLACE VIEW analytics.v_performance_metrics AS
    SELECT 
      'data_ingestion' as metric_category,
      'records_per_second' as metric_name,
      CASE 
        WHEN EXTRACT(EPOCH FROM (MAX(time) - MIN(time))) > 0 
        THEN COUNT(*) / EXTRACT(EPOCH FROM (MAX(time) - MIN(time)))
        ELSE 0 
      END as metric_value,
      'records/sec' as unit,
      NOW() as calculated_at
    FROM telemetry.vehicle_telemetry
    WHERE time >= NOW() - INTERVAL '5 minutes'
    UNION ALL
    SELECT 
      'storage_efficiency' as metric_category,
      'compression_ratio' as metric_name,
      CASE 
        WHEN pg_relation_size('telemetry.vehicle_telemetry'::regclass) > 0 
        THEN (pg_total_relation_size('telemetry.vehicle_telemetry'::regclass)::numeric / 
              pg_relation_size('telemetry.vehicle_telemetry'::regclass)::numeric)
        ELSE 1 
      END as metric_value,
      'ratio' as unit,
      NOW() as calculated_at
    UNION ALL
    SELECT 
      'query_performance' as metric_category,
      'avg_query_time' as metric_name,
      COALESCE(
        (SELECT AVG(mean_exec_time) FROM pg_stat_statements 
         WHERE query LIKE '%telemetry.vehicle_telemetry%'), 
        0
      ) as metric_value,
      'ms' as unit,
      NOW() as calculated_at;
  `);

  // Create analytics.v_anomaly_summary view
  pgm.sql(`
    CREATE OR REPLACE VIEW analytics.v_anomaly_summary AS
    SELECT 
      DATE_TRUNC('day', time) as date,
      anomaly_type,
      severity,
      COUNT(*) as occurrence_count,
      COUNT(DISTINCT license_plate) as affected_vehicles,
      COUNT(DISTINCT driver_id) as affected_drivers,
      AVG(CASE WHEN is_critical THEN 1 ELSE 0 END) as critical_ratio,
      AVG(CASE WHEN is_resolved THEN 1 ELSE 0 END) as resolution_ratio
    FROM telemetry.vehicle_anomalies
    GROUP BY DATE_TRUNC('day', time), anomaly_type, severity
    ORDER BY date DESC, anomaly_type, severity;
  `);

  // Create analytics.v_device_health_summary view
  pgm.sql(`
    CREATE OR REPLACE VIEW analytics.v_device_health_summary AS
    SELECT 
      DATE_TRUNC('hour', time) as hour_bucket,
      COUNT(DISTINCT imei) as total_devices,
      COUNT(CASE WHEN needs_attention THEN 1 END) as devices_needing_attention,
      COUNT(CASE WHEN NOT needs_attention THEN 1 END) as healthy_devices,
      (COUNT(CASE WHEN NOT needs_attention THEN 1 END)::numeric / 
       COUNT(DISTINCT imei)::numeric * 100) as health_percentage
    FROM telemetry.device_status
    GROUP BY DATE_TRUNC('hour', time)
    ORDER BY hour_bucket DESC;
  `);
};

exports.down = pgm => {
  // Drop all created views
  pgm.sql(`DROP VIEW IF EXISTS analytics.v_daily_vehicle_summary;`);
  pgm.sql(`DROP VIEW IF EXISTS analytics.v_daily_driver_summary;`);
  pgm.sql(`DROP VIEW IF EXISTS analytics.v_vehicle_track_summary;`);
  pgm.sql(`DROP VIEW IF EXISTS analytics.v_performance_metrics;`);
  pgm.sql(`DROP VIEW IF EXISTS analytics.v_anomaly_summary;`);
  pgm.sql(`DROP VIEW IF EXISTS analytics.v_device_health_summary;`);
};
