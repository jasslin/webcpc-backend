'use strict';

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  
  // ========================================
  // Seed Data 1: Multi-tenant Retention Policy Configuration
  // ========================================
  
  pgm.sql(`
    INSERT INTO config.retention_policies (tenant_id, data_type, retention_days, compression_days, regulatory_requirement) VALUES
    ('default', 'vehicle_telemetry', 730, 7, 'Standard 2-year retention'),
    ('enterprise', 'vehicle_telemetry', 2555, 30, 'Enterprise 7-year retention'),
    ('government', 'vehicle_telemetry', 3650, 90, 'Government 10-year retention'),
    ('default', 'vehicle_anomalies', 1825, 30, 'Standard 5-year anomaly retention'),
    ('enterprise', 'vehicle_anomalies', 2555, 60, 'Enterprise 7-year anomaly retention'),
    ('government', 'vehicle_anomalies', 3650, 180, 'Government 10-year anomaly retention'),
    ('default', 'device_status', 365, 3, 'Standard 1-year device status retention'),
    ('enterprise', 'device_status', 730, 7, 'Enterprise 2-year device status retention'),
    ('government', 'device_status', 1095, 14, 'Government 3-year device status retention')
    ON CONFLICT (tenant_id, data_type) DO NOTHING;
  `);

  // ========================================
  // Seed Data 2: Test Telemetry Data
  // ========================================
  
  pgm.sql(`
    INSERT INTO telemetry.vehicle_telemetry (
      license_plate, time, imei, imsi, longitude, latitude, altitude,
      speed, gps_speed, direction, mileage, rpm, gps_status, 
      gps_satellite_count, is_moving, is_speeding, csq, driver_id,
      log_sequence, crc_checksum, ignition, engine_on, door_open, 
      brake_signal, fuel_level, battery_voltage, engine_temperature,
      raw_data, raw_log_data, raw_device_status, raw_io_extended, data_source
    ) VALUES 
    (
      'PROD-001', 
      NOW(), 
      '860123456789012',
      '460001234567890',
      121.5654, 
      25.0330, 
      15.5,
      65.0, 
      67.2,
      45.5,
      12580.75,
      2800,
      'A', 
      10, 
      true,
      false,
      25,
      'DRV001',
      54321, 
      'prod123abc456',
      true, 
      true, 
      false,
      false,
      85, 
      12.8,
      78.5,
      '{"io": {"ignition": true, "engine_on": true, "door_open": false, "brake_signal": false}, "gps": {"satellites": 10, "hdop": 1.2}}',
      '{"timestamp": "2025-08-26T08:30:00Z", "vehicle_id": "PROD-001", "driver": "DRV001"}',
      '{"battery_voltage": 12.8, "temperature": 78.5, "fuel_level": 85, "engine_rpm": 2800}',
      '{"input1": true, "input2": false, "output1": true, "output2": false}',
      'production_test'
    ),
    (
      'TEST-001', 
      NOW() - INTERVAL '5 minutes', 
      '860123456789013',
      '460001234567891',
      121.5680, 
      25.0340, 
      12.0,
      50.0, 
      52.3,
      90.0,
      8750.25,
      2500,
      'A', 
      8, 
      true,
      false,
      22,
      'DRV002',
      54322, 
      'test456def789',
      true, 
      true, 
      false,
      false,
      75, 
      12.5,
      82.0,
      '{"io": {"ignition": true, "engine_on": true, "door_open": false, "brake_signal": false}, "gps": {"satellites": 8, "hdop": 1.5}}',
      '{"timestamp": "2025-08-26T08:25:00Z", "vehicle_id": "TEST-001", "driver": "DRV002"}',
      '{"battery_voltage": 12.5, "temperature": 82.0, "fuel_level": 75, "engine_rpm": 2500}',
      '{"input1": true, "input2": true, "output1": false, "output2": true}',
      'test_data'
    ),
    (
      'DEV-001', 
      NOW() - INTERVAL '10 minutes', 
      '860123456789014',
      '460001234567892',
      121.5700, 
      25.0350, 
      8.2,
      0.0, 
      0.0,
      0.0,
      15420.50,
      0,
      'A', 
      12, 
      false,
      false,
      28,
      'DRV003',
      54323, 
      'dev789ghi012',
      false, 
      false, 
      true,
      true,
      90, 
      12.9,
      65.0,
      '{"io": {"ignition": false, "engine_on": false, "door_open": true, "brake_signal": true}, "gps": {"satellites": 12, "hdop": 0.8}}',
      '{"timestamp": "2025-08-26T08:20:00Z", "vehicle_id": "DEV-001", "driver": "DRV003"}',
      '{"battery_voltage": 12.9, "temperature": 65.0, "fuel_level": 90, "engine_rpm": 0}',
      '{"input1": false, "input2": false, "output1": false, "output2": false}',
      'development_test'
    )
    ON CONFLICT (license_plate, time) DO NOTHING;
  `);

  // ========================================
  // Seed Data 3: Test Anomaly Data
  // ========================================
  
  pgm.sql(`
    INSERT INTO telemetry.vehicle_anomalies (
      license_plate, time, longitude, latitude, anomaly_type, severity, 
      description, status, driver_id, driver_attribution_method, 
      driver_confidence_score, attribution_details, is_critical, is_resolved
    ) VALUES 
    (
      'PROD-001',
      NOW() - INTERVAL '2 hours',
      121.5654,
      25.0330,
      'speed_violation',
      'medium',
      'Vehicle exceeded speed limit by 15 km/h in urban area',
      'open',
      'DRV001',
      'telemetry_lookup',
      1.0,
      '{"method": "exact_time_match", "confidence": "high", "speed_limit": 50, "actual_speed": 65}',
      false,
      false
    ),
    (
      'TEST-001',
      NOW() - INTERVAL '1 hour',
      121.5680,
      25.0340,
      'engine_temperature',
      'high',
      'Engine temperature exceeded normal operating range',
      'acknowledged',
      'DRV002',
      'telemetry_lookup',
      0.95,
      '{"method": "nearest_neighbor", "confidence": "high", "normal_range": "70-85", "actual_temp": 95}',
      true,
      false
    )
    ON CONFLICT (license_plate, time, anomaly_id) DO NOTHING;
  `);

  // ========================================
  // Seed Data 4: Test Device Status Data
  // ========================================
  
  pgm.sql(`
    INSERT INTO telemetry.device_status (
      imei, time, imsi, license_plate, battery_level, battery_voltage, 
      temperature, csq, network_type, network_operator, memory_usage, 
      storage_usage, health_score, needs_attention, maintenance_due, 
      last_maintenance, next_maintenance, raw_status
    ) VALUES 
    (
      '860123456789012',
      NOW(),
      '460001234567890',
      'PROD-001',
      95,
      12.8,
      35.2,
      25,
      '4G',
      'Chunghwa Telecom',
      45,
      20,
      0.95,
      false,
      false,
      NOW() - INTERVAL '30 days',
      NOW() + INTERVAL '60 days',
      '{"firmware_version": "v2.1.3", "signal_strength": "excellent", "gps_module": "active", "storage_health": "good"}'
    ),
    (
      '860123456789013',
      NOW() - INTERVAL '5 minutes',
      '460001234567891',
      'TEST-001',
      78,
      12.5,
      42.1,
      22,
      '4G',
      'Taiwan Mobile',
      62,
      35,
      0.85,
      true,
      false,
      NOW() - INTERVAL '45 days',
      NOW() + INTERVAL '15 days',
      '{"firmware_version": "v2.0.8", "signal_strength": "good", "gps_module": "active", "storage_health": "warning"}'
    ),
    (
      '860123456789014',
      NOW() - INTERVAL '10 minutes',
      '460001234567892',
      'DEV-001',
      88,
      12.9,
      28.7,
      28,
      '4G',
      'FarEasTone',
      38,
      15,
      0.92,
      false,
      true,
      NOW() - INTERVAL '75 days',
      NOW() + INTERVAL '5 days',
      '{"firmware_version": "v2.1.1", "signal_strength": "excellent", "gps_module": "active", "storage_health": "excellent"}'
    )
    ON CONFLICT (imei, time) DO NOTHING;
  `);

  // ========================================
  // Seed Data 5: Update Geospatial Fields (Trigger existing data)
  // ========================================
  
  pgm.sql(`
    -- Ensure all existing data has correct geospatial fields
    UPDATE telemetry.vehicle_telemetry 
    SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326),
        geog = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
    WHERE longitude IS NOT NULL 
      AND latitude IS NOT NULL 
      AND (geom IS NULL OR geog IS NULL);
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  // Clean up seed data (reverse order)
  
  pgm.sql(`DELETE FROM telemetry.device_status WHERE imei LIKE '86012345678901%';`);
  pgm.sql(`DELETE FROM telemetry.vehicle_anomalies WHERE license_plate IN ('PROD-001', 'TEST-001', 'DEV-001');`);
  pgm.sql(`DELETE FROM telemetry.vehicle_telemetry WHERE license_plate IN ('PROD-001', 'TEST-001', 'DEV-001');`);
  pgm.sql(`DELETE FROM config.retention_policies WHERE tenant_id IN ('default', 'enterprise', 'government');`);
};