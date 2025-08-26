'use strict';

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  
  // ========================================
  // Phase 1: Basic Setup - Extensions and Schemas
  // ========================================
  
  pgm.sql(`
    -- Enable necessary PostgreSQL extensions
    CREATE EXTENSION IF NOT EXISTS "timescaledb";
    CREATE EXTENSION IF NOT EXISTS "postgis";
    CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
    
    -- Create all necessary schemas
    CREATE SCHEMA IF NOT EXISTS "analytics";
    CREATE SCHEMA IF NOT EXISTS "monitoring";
    CREATE SCHEMA IF NOT EXISTS "config";
    CREATE SCHEMA IF NOT EXISTS "telemetry";
  `);

  // ========================================
  // Phase 2: Table Structure Creation
  // ========================================
  
  // 2.1 Configuration management table
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS config.retention_policies (
      tenant_id VARCHAR(50) NOT NULL,
      data_type VARCHAR(50) NOT NULL,
      retention_days INTEGER NOT NULL,
      compression_days INTEGER NOT NULL,
      regulatory_requirement TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (tenant_id, data_type)
    );
  `);

  // 2.2 Main telemetry table
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS telemetry.vehicle_telemetry (
      -- Optimized primary key order: license_plate first, distributes hotspots
      license_plate VARCHAR(20) NOT NULL,
      time TIMESTAMPTZ NOT NULL,
      
      -- Basic device information
      imei VARCHAR(15),
      imsi VARCHAR(15),
      
      -- Location data
      longitude DECIMAL(10,7),
      latitude DECIMAL(10,7),
      altitude DECIMAL(8,2),
      
      -- Movement data (including reinforced rpm)
      speed DECIMAL(5,2) CHECK (speed >= 0),
      gps_speed DECIMAL(5,2) CHECK (gps_speed >= 0 AND gps_speed <= 300),
      direction DECIMAL(5,2) CHECK (direction >= 0 AND direction < 360),
      mileage DECIMAL(10,2),
      rpm INTEGER CHECK (rpm >= 0 AND rpm <= 10000), -- Reinforced field
      
      -- Status and quality (including reinforced gps_satellite_count)
      gps_status CHAR(1) CHECK (gps_status IN ('A', 'V')),
      gps_satellite_count INTEGER CHECK (gps_satellite_count >= 0), -- Reinforced field
      is_moving BOOLEAN DEFAULT false,
      is_speeding BOOLEAN DEFAULT false,
      csq INTEGER CHECK (csq BETWEEN 0 AND 31),
      
      -- Driver information
      driver_id VARCHAR(20),
      
      -- Reinforced missing key fields
      log_sequence INTEGER, -- Corresponds to old system log_count
      crc_checksum VARCHAR(100), -- Original packet integrity verification
      
      -- Hot data field flattening - IO status (NOTE: These are temporary definitions, will be expanded based on actual requirements)
      ignition BOOLEAN,
      engine_on BOOLEAN,
      door_open BOOLEAN,
      brake_signal BOOLEAN,
      
      -- Hot data field flattening - Device status (NOTE: These are temporary definitions, will be expanded based on actual requirements)
      fuel_level INTEGER CHECK (fuel_level BETWEEN 0 AND 100),
      battery_voltage DECIMAL(4,2),
      engine_temperature DECIMAL(5,2),
      
      -- Complete original data preservation
      raw_data JSONB, -- Main original data (contains io sub-fields)
      raw_log_data JSONB, -- Complete log_data
      raw_device_status JSONB, -- Device status
      raw_io_extended JSONB, -- Extended IO status
      
      -- Geospatial columns
      geom GEOMETRY(POINT, 4326),
      geog GEOGRAPHY(POINT, 4326),
      
      -- Metadata
      created_at TIMESTAMPTZ DEFAULT NOW(),
      data_source VARCHAR(50) DEFAULT 'api_ingestion',
      
      -- Optimized primary key
      PRIMARY KEY (license_plate, time)
    );
  `);

  // 2.3 Anomaly detection table
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS telemetry.vehicle_anomalies (
      license_plate VARCHAR(20) NOT NULL,
      time TIMESTAMPTZ NOT NULL,
      anomaly_id SERIAL,
      
      longitude DECIMAL(10,7),
      latitude DECIMAL(10,7),
      
      anomaly_type VARCHAR(50) NOT NULL,
      severity VARCHAR(20) CHECK (severity IN ('low', 'medium', 'high', 'critical')),
      description TEXT,
      status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'false_positive')),
      
      driver_id VARCHAR(20),
      driver_attribution_method VARCHAR(30) DEFAULT 'telemetry_lookup',
      driver_confidence_score DECIMAL(3,2) DEFAULT 1.0 CHECK (driver_confidence_score BETWEEN 0.0 AND 1.0),
      attribution_details JSONB,
      
      is_critical BOOLEAN DEFAULT false,
      is_resolved BOOLEAN DEFAULT false,
      
      created_at TIMESTAMPTZ DEFAULT NOW(),
      resolved_at TIMESTAMPTZ,
      
      PRIMARY KEY (license_plate, time, anomaly_id)
    );
  `);

  // 2.4 Device status table
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS telemetry.device_status (
      imei VARCHAR(15) NOT NULL,
      time TIMESTAMPTZ NOT NULL,
      imsi VARCHAR(15),
      license_plate VARCHAR(20),
      
      battery_level INTEGER CHECK (battery_level BETWEEN 0 AND 100),
      battery_voltage DECIMAL(4,2),
      temperature DECIMAL(5,2),
      
      csq INTEGER CHECK (csq BETWEEN 0 AND 31),
      network_type VARCHAR(10),
      network_operator VARCHAR(50),
      
      memory_usage INTEGER,
      storage_usage INTEGER,
      
      health_score DECIMAL(3,2) CHECK (health_score BETWEEN 0.0 AND 1.0),
      needs_attention BOOLEAN DEFAULT false,
      maintenance_due BOOLEAN DEFAULT false,
      last_maintenance TIMESTAMPTZ,
      next_maintenance TIMESTAMPTZ,
      
      raw_status JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      
      PRIMARY KEY (imei, time)
    );
  `);

  // ========================================
  // Phase 3: TimescaleDB Optimization
  // ========================================
  
  pgm.sql(`
    -- Convert tables to Hypertables
    SELECT create_hypertable('telemetry.vehicle_telemetry', 'time', 
      chunk_time_interval => INTERVAL '1 day',
      migrate_data => TRUE,
      if_not_exists => TRUE
    );
    
    SELECT create_hypertable('telemetry.vehicle_anomalies', 'time',
      chunk_time_interval => INTERVAL '1 week',
      migrate_data => TRUE,
      if_not_exists => TRUE
    );
    
    SELECT create_hypertable('telemetry.device_status', 'time',
      chunk_time_interval => INTERVAL '1 day',
      migrate_data => TRUE,
      if_not_exists => TRUE
    );
  `);

  pgm.sql(`
    -- Enable compression strategy
    ALTER TABLE telemetry.vehicle_telemetry SET (
      timescaledb.compress,
      timescaledb.compress_segmentby = 'license_plate',
      timescaledb.compress_orderby = 'time DESC'
    );
    SELECT add_compression_policy('telemetry.vehicle_telemetry', INTERVAL '7 days');
    
    ALTER TABLE telemetry.vehicle_anomalies SET (
      timescaledb.compress,
      timescaledb.compress_segmentby = 'license_plate, anomaly_id',
      timescaledb.compress_orderby = 'time DESC'
    );
    SELECT add_compression_policy('telemetry.vehicle_anomalies', INTERVAL '30 days');
    
    ALTER TABLE telemetry.device_status SET (
      timescaledb.compress,
      timescaledb.compress_segmentby = 'imei',
      timescaledb.compress_orderby = 'time DESC'
    );
    SELECT add_compression_policy('telemetry.device_status', INTERVAL '3 days');
  `);

  pgm.sql(`
    -- Set retention policies
    SELECT add_retention_policy('telemetry.vehicle_telemetry', INTERVAL '2 years');
    SELECT add_retention_policy('telemetry.vehicle_anomalies', INTERVAL '5 years');
    SELECT add_retention_policy('telemetry.device_status', INTERVAL '1 year');
  `);

  // ========================================
  // Phase 4: Index Creation
  // ========================================
  
  pgm.sql(`
    -- Core query indexes
    CREATE INDEX IF NOT EXISTS idx_vehicle_telemetry_license_time 
    ON telemetry.vehicle_telemetry (license_plate, time DESC);
    
    -- GPS status filtering index
    CREATE INDEX IF NOT EXISTS idx_vehicle_telemetry_gps_status 
    ON telemetry.vehicle_telemetry (gps_status, time DESC) 
    WHERE gps_status = 'A';
    
    -- Geospatial index
    CREATE INDEX IF NOT EXISTS idx_vehicle_telemetry_geom 
    ON telemetry.vehicle_telemetry USING GIST (geom) 
    WHERE geom IS NOT NULL;
    
    -- Time range index (BRIN low maintenance cost)
    CREATE INDEX IF NOT EXISTS idx_vehicle_telemetry_time_brin 
    ON telemetry.vehicle_telemetry USING BRIN (time) 
    WITH (pages_per_range = 128);
    
    -- Anomaly table indexes
    CREATE INDEX IF NOT EXISTS idx_vehicle_anomalies_type 
    ON telemetry.vehicle_anomalies (anomaly_type);
    
    CREATE INDEX IF NOT EXISTS idx_vehicle_anomalies_status 
    ON telemetry.vehicle_anomalies (status) 
    WHERE status IN ('open', 'acknowledged');
    
    -- Device status indexes
    CREATE INDEX IF NOT EXISTS idx_device_status_attention 
    ON telemetry.device_status (needs_attention) 
    WHERE needs_attention = true;
  `);

  // ========================================
  // Phase 5: Triggers and Functions
  // ========================================
  
  pgm.sql(`
    -- Geospatial automatic calculation trigger
    CREATE OR REPLACE FUNCTION update_vehicle_telemetry_geom()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.longitude IS NOT NULL AND NEW.latitude IS NOT NULL THEN
        NEW.geom := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
        NEW.geog := NEW.geom::geography;
      ELSE
        NEW.geom := NULL;
        NEW.geog := NULL;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    
    DROP TRIGGER IF EXISTS trigger_update_geom ON telemetry.vehicle_telemetry;
    CREATE TRIGGER trigger_update_geom
      BEFORE INSERT OR UPDATE ON telemetry.vehicle_telemetry
      FOR EACH ROW
      EXECUTE FUNCTION update_vehicle_telemetry_geom();
  `);

  pgm.sql(`
    -- High-performance bulk insert function (simplified version)
    CREATE OR REPLACE FUNCTION bulk_insert_telemetry_simple(
      p_data JSONB
    )
    RETURNS INTEGER AS $$
    DECLARE
      insert_count INTEGER := 0;
      rec JSONB;
    BEGIN
      FOR rec IN SELECT * FROM jsonb_array_elements(p_data) LOOP
        INSERT INTO telemetry.vehicle_telemetry (
          license_plate, time, imei, imsi, longitude, latitude, altitude,
          speed, gps_speed, direction, mileage, rpm, gps_status, 
          gps_satellite_count, is_moving, is_speeding, csq, driver_id,
          log_sequence, crc_checksum, ignition, engine_on, door_open, 
          brake_signal, fuel_level, battery_voltage, engine_temperature,
          raw_data, raw_log_data, raw_device_status, raw_io_extended, data_source
        )
        VALUES (
          rec->>'license_plate',
          (rec->>'time')::TIMESTAMPTZ,
          rec->>'imei',
          rec->>'imsi',
          (rec->>'longitude')::DECIMAL(10,7),
          (rec->>'latitude')::DECIMAL(10,7),
          (rec->>'altitude')::DECIMAL(8,2),
          (rec->>'speed')::DECIMAL(5,2),
          (rec->>'gps_speed')::DECIMAL(5,2),
          (rec->>'direction')::DECIMAL(5,2),
          (rec->>'mileage')::DECIMAL(10,2),
          (rec->>'rpm')::INTEGER,
          rec->>'gps_status',
          (rec->>'gps_satellite_count')::INTEGER,
          (rec->>'is_moving')::BOOLEAN,
          (rec->>'is_speeding')::BOOLEAN,
          (rec->>'csq')::INTEGER,
          rec->>'driver_id',
          (rec->>'log_sequence')::INTEGER,
          rec->>'crc_checksum',
          (rec->>'ignition')::BOOLEAN,
          (rec->>'engine_on')::BOOLEAN,
          (rec->>'door_open')::BOOLEAN,
          (rec->>'brake_signal')::BOOLEAN,
          (rec->>'fuel_level')::INTEGER,
          (rec->>'battery_voltage')::DECIMAL(4,2),
          (rec->>'engine_temperature')::DECIMAL(5,2),
          rec->'raw_data',
          rec->'raw_log_data',
          rec->'raw_device_status',
          rec->'raw_io_extended',
          COALESCE(rec->>'data_source', 'api_ingestion')
        )
        ON CONFLICT (license_plate, time) DO UPDATE SET
          longitude = EXCLUDED.longitude,
          latitude = EXCLUDED.latitude,
          speed = EXCLUDED.speed,
          raw_data = EXCLUDED.raw_data;
        
        insert_count := insert_count + 1;
      END LOOP;
      
      RETURN insert_count;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // ========================================
  // Phase 6: Monitoring Views
  // ========================================
  
  pgm.sql(`
    -- Performance monitoring view
    CREATE OR REPLACE VIEW monitoring.v_telemetry_performance AS
    SELECT
      'telemetry_ingestion_rate' as metric_name,
      COUNT(*) as value,
      'records_per_minute' as unit,
      NOW() as timestamp
    FROM telemetry.vehicle_telemetry
    WHERE time >= NOW() - INTERVAL '1 minute'
    
    UNION ALL
    
    SELECT
      'telemetry_storage_size' as metric_name,
      pg_total_relation_size('telemetry.vehicle_telemetry') / 1024 / 1024 as value,
      'MB' as unit,
      NOW() as timestamp
    
    UNION ALL
    
    SELECT
      'active_vehicles_last_hour' as metric_name,
      COUNT(DISTINCT license_plate) as value,
      'vehicles' as unit,
      NOW() as timestamp
    FROM telemetry.vehicle_telemetry
    WHERE time >= NOW() - INTERVAL '1 hour';
  `);

  pgm.sql(`
    -- TimescaleDB status check function  
    CREATE OR REPLACE FUNCTION check_timescaledb_status()
    RETURNS TABLE (
      hypertable_name TEXT,
      num_chunks INTEGER,
      compression_enabled BOOLEAN,
      total_size_mb DECIMAL(10,2)
    ) AS $$
    BEGIN
      RETURN QUERY
      SELECT 
        h.table_name::TEXT,
        h.num_chunks::INTEGER,
        h.compression_enabled::BOOLEAN,
        ROUND(pg_total_relation_size(format('%s.%s', h.schema_name, h.table_name)) / 1024 / 1024, 2) as total_size_mb
      FROM timescaledb_information.hypertables h
      WHERE h.schema_name = 'telemetry';
    END;
    $$ LANGUAGE plpgsql;
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  // Cleanup order: Reverse operations
  
  // Remove functions and views
  pgm.sql(`DROP FUNCTION IF EXISTS check_timescaledb_status();`);
  pgm.sql(`DROP VIEW IF EXISTS monitoring.v_telemetry_performance;`);
  pgm.sql(`DROP FUNCTION IF EXISTS bulk_insert_telemetry_simple(JSONB);`);
  pgm.sql(`DROP TRIGGER IF EXISTS trigger_update_geom ON telemetry.vehicle_telemetry;`);
  pgm.sql(`DROP FUNCTION IF EXISTS update_vehicle_telemetry_geom();`);
  
  // Remove policies (if supported)
  pgm.sql(`SELECT remove_retention_policy('telemetry.vehicle_telemetry', true);`);
  pgm.sql(`SELECT remove_retention_policy('telemetry.vehicle_anomalies', true);`);
  pgm.sql(`SELECT remove_retention_policy('telemetry.device_status', true);`);
  
  pgm.sql(`SELECT remove_compression_policy('telemetry.vehicle_telemetry', true);`);
  pgm.sql(`SELECT remove_compression_policy('telemetry.vehicle_anomalies', true);`);
  pgm.sql(`SELECT remove_compression_policy('telemetry.device_status', true);`);
  
  // Drop tables
  pgm.sql(`DROP TABLE IF EXISTS telemetry.device_status CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS telemetry.vehicle_telemetry CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS telemetry.vehicle_anomalies CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS config.retention_policies CASCADE;`);
  
  // Drop schemas
  pgm.sql(`DROP SCHEMA IF EXISTS telemetry CASCADE;`);
  pgm.sql(`DROP SCHEMA IF EXISTS config CASCADE;`);
  pgm.sql(`DROP SCHEMA IF EXISTS monitoring CASCADE;`);
  pgm.sql(`DROP SCHEMA IF EXISTS analytics CASCADE;`);
};