# VDRS Telemetry Optimized Architecture

## Overview

This document provides a focused, optimized architecture specifically for the **telemetry data layer** of the VDRS (Vehicle Data Recording System). It extracts and enhances the telemetry-specific components from the full FLEMACPC unified architecture, providing detailed guidance for high-performance vehicle data collection, storage, and analytics.

## Architecture Scope

**Focus Areas:**
- High-performance telemetry data ingestion
- Optimized time-series storage with TimescaleDB
- Geospatial data processing with PostGIS
- Real-time analytics and continuous aggregation
- Performance monitoring and optimization

**Key Performance Targets:**
- **Data Ingestion**: 10,000+ records/second
- **Query Response**: <100ms for recent data queries
- **Storage Efficiency**: 80%+ compression ratio
- **Availability**: 99.9% uptime

---

## Core Telemetry Schema

### 1. Primary Telemetry Table

```sql
-- Create telemetry schema
CREATE SCHEMA IF NOT EXISTS telemetry;

-- Main vehicle telemetry table (optimized for high-frequency inserts)
CREATE TABLE telemetry.vehicle_telemetry (
    -- Time and Identification (Primary Keys)
    time TIMESTAMPTZ NOT NULL,
    license_plate VARCHAR(20) NOT NULL,
    
    -- Device Information
    imei VARCHAR(15),
    imsi VARCHAR(15), -- SIM card identifier for network analytics
    
    -- Location Data (Core GPS fields)
    longitude DECIMAL(10,7),
    latitude DECIMAL(10,7),
    altitude DECIMAL(8,2),
    
    -- Movement Data
    speed DECIMAL(5,2) CHECK (speed >= 0),
    gps_speed DECIMAL(5,2) CHECK (gps_speed >= 0 AND gps_speed <= 300), -- GPS-calculated speed
    direction DECIMAL(5,2) CHECK (direction >= 0 AND direction < 360),
    mileage DECIMAL(10,2),
    
    -- Status and Quality
    gps_status CHAR(1) CHECK (gps_status IN ('A', 'V')), -- A=Active, V=Void
    is_moving BOOLEAN DEFAULT false,
    is_speeding BOOLEAN DEFAULT false,
    csq INTEGER CHECK (csq BETWEEN 0 AND 31), -- Signal quality
    
    -- Driver Information (when available)
    driver_id VARCHAR(20),
    
    -- Device and Sensor Data (simplified, optimized structure)
    raw_data JSONB, -- Contains: {"io": {"input1": true, "input2": false, ...}, "deviceStatus": {...}, "sensors": {...}}
    
    -- Generated Geospatial Columns (v1.1 Performance Enhancement)
    geom GEOMETRY(POINT, 4326) GENERATED ALWAYS AS (
        CASE 
            WHEN longitude IS NOT NULL AND latitude IS NOT NULL 
            THEN ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
            ELSE NULL 
        END
    ) STORED,
    
    geog GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (
        CASE 
            WHEN longitude IS NOT NULL AND latitude IS NOT NULL 
            THEN ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
        ELSE NULL 
        END
    ) STORED,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Primary key constraint (optimized order for production performance)
    CONSTRAINT pk_vehicle_telemetry PRIMARY KEY (license_plate, time)
);

-- Convert to TimescaleDB hypertable (1-day chunks for optimal performance)
SELECT create_hypertable('telemetry.vehicle_telemetry', 'time', 
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Example raw_data JSON structure:
/*
{
  "io": {
    "ignition": true,
    "door_open": false,
    "engine_on": true,
    "brake": false,
    "accelerator": 25,
    "input1": true,
    "input2": false,
    "output1": true
  },
  "deviceStatus": {
    "battery_voltage": 12.6,
    "internal_battery": 85,
    "temperature": 28.5,
    "gps_satellites": 8
  },
  "sensors": {
    "fuel_level": 75,
    "engine_temp": 90,
    "rpm": 1500,
    "acceleration_x": 0.2,
    "acceleration_y": -0.1,
    "acceleration_z": 9.8
  }
}
*/
```

### 2. Vehicle Anomalies Table

```sql
CREATE TABLE telemetry.vehicle_anomalies (
    -- Time and Identification
    time TIMESTAMPTZ NOT NULL,
    license_plate VARCHAR(20) NOT NULL,
    anomaly_id SERIAL,
    
    -- Location at anomaly time
    longitude DECIMAL(10,7),
    latitude DECIMAL(10,7),
    
    -- Anomaly Classification
    anomaly_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    description TEXT,
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'false_positive')),
    
    -- Driver Attribution (intelligent assignment)
    driver_id VARCHAR(20),
    driver_attribution_method VARCHAR(30) DEFAULT 'telemetry_lookup',
    driver_confidence_score DECIMAL(3,2) DEFAULT 1.0 CHECK (driver_confidence_score BETWEEN 0.0 AND 1.0),
    attribution_details JSONB,
    
    -- Anomaly Metrics
    is_critical BOOLEAN DEFAULT false,
    is_resolved BOOLEAN DEFAULT false,
    
    -- Generated geography column for spatial queries
    geog GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (
        CASE 
            WHEN longitude IS NOT NULL AND latitude IS NOT NULL 
            THEN ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
            ELSE NULL 
        END
    ) STORED,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    
    CONSTRAINT pk_vehicle_anomalies PRIMARY KEY (license_plate, time, anomaly_id)
);

-- Convert to hypertable
SELECT create_hypertable('telemetry.vehicle_anomalies', 'time',
    chunk_time_interval => INTERVAL '1 week',
    if_not_exists => TRUE
);
```

### 3. Device Status Table

```sql
CREATE TABLE telemetry.device_status (
    -- Time and Device Identification
    time TIMESTAMPTZ NOT NULL,
    imei VARCHAR(15) NOT NULL,
    imsi VARCHAR(15),
    license_plate VARCHAR(20),
    
    -- Device Health Metrics
    battery_level INTEGER CHECK (battery_level BETWEEN 0 AND 100),
    battery_voltage DECIMAL(4,2),
    temperature DECIMAL(5,2),
    
    -- Network and Signal
    csq INTEGER CHECK (csq BETWEEN 0 AND 31),
    network_type VARCHAR(10),
    network_operator VARCHAR(50),
    
    -- Memory and Storage
    memory_usage INTEGER,
    storage_usage INTEGER,
    
    -- Maintenance Indicators
    health_score DECIMAL(3,2) CHECK (health_score BETWEEN 0.0 AND 1.0),
    needs_attention BOOLEAN DEFAULT false,
    maintenance_due BOOLEAN DEFAULT false,
    last_maintenance TIMESTAMPTZ,
    next_maintenance TIMESTAMPTZ,
    
    -- Additional Status
    raw_status JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT pk_device_status PRIMARY KEY (time, imei)
);

-- Convert to hypertable
SELECT create_hypertable('telemetry.device_status', 'time',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);
```

---

## Performance Optimization

### 1. TimescaleDB Configuration

```sql
-- Enable compression for telemetry data (saves 70-85% storage)
ALTER TABLE telemetry.vehicle_telemetry SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'license_plate',
    timescaledb.compress_orderby = 'time DESC'
);

-- Auto-compress data older than 7 days
SELECT add_compression_policy('telemetry.vehicle_telemetry', INTERVAL '7 days');

-- Auto-delete data older than 2 years
SELECT add_retention_policy('telemetry.vehicle_telemetry', INTERVAL '2 years');

-- Configure anomaly table compression
ALTER TABLE telemetry.vehicle_anomalies SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'license_plate',
    timescaledb.compress_orderby = 'time DESC'
);

SELECT add_compression_policy('telemetry.vehicle_anomalies', INTERVAL '30 days');
SELECT add_retention_policy('telemetry.vehicle_anomalies', INTERVAL '5 years');

-- Configure device status compression
ALTER TABLE telemetry.device_status SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'imei',
    timescaledb.compress_orderby = 'time DESC'
);

SELECT add_compression_policy('telemetry.device_status', INTERVAL '3 days');
SELECT add_retention_policy('telemetry.device_status', INTERVAL '1 year');
```

### 2. Optimized Index Strategy

```sql
-- Core time-series indexes for telemetry
CREATE INDEX CONCURRENTLY idx_vehicle_telemetry_license_time 
ON telemetry.vehicle_telemetry (license_plate, time DESC) 
INCLUDE (longitude, latitude, speed, gps_speed);

-- Geospatial indexes (essential for location queries)
CREATE INDEX CONCURRENTLY idx_vehicle_telemetry_geom_gist
ON telemetry.vehicle_telemetry USING GIST (geom) 
WHERE geom IS NOT NULL;

CREATE INDEX CONCURRENTLY idx_vehicle_telemetry_geog_gist
ON telemetry.vehicle_telemetry USING GIST (geog) 
WHERE geog IS NOT NULL;

-- Performance indexes for common query patterns
CREATE INDEX CONCURRENTLY idx_vehicle_telemetry_status_time
ON telemetry.vehicle_telemetry (gps_status, time DESC)
WHERE gps_status IN ('A', 'V');

CREATE INDEX CONCURRENTLY idx_vehicle_telemetry_speed_time
ON telemetry.vehicle_telemetry (speed, time DESC)
WHERE speed > 0;

CREATE INDEX CONCURRENTLY idx_vehicle_telemetry_moving_time
ON telemetry.vehicle_telemetry (is_moving, time DESC)
WHERE is_moving = true;

-- BRIN indexes for time-based range queries (extremely efficient)
CREATE INDEX CONCURRENTLY idx_vehicle_telemetry_time_brin 
ON telemetry.vehicle_telemetry USING BRIN (time) 
WITH (pages_per_range = 128);

CREATE INDEX CONCURRENTLY idx_vehicle_telemetry_mileage_brin 
ON telemetry.vehicle_telemetry USING BRIN (mileage) 
WITH (pages_per_range = 64);

-- Partial indexes for active data only
CREATE INDEX CONCURRENTLY idx_vehicle_telemetry_recent_active 
ON telemetry.vehicle_telemetry (license_plate, time DESC) 
INCLUDE (longitude, latitude, speed, gps_speed, is_moving)
WHERE time >= NOW() - INTERVAL '7 days';

-- Anomaly table indexes
CREATE INDEX CONCURRENTLY idx_vehicle_anomalies_license_time
ON telemetry.vehicle_anomalies (license_plate, time DESC);

CREATE INDEX CONCURRENTLY idx_vehicle_anomalies_unresolved 
ON telemetry.vehicle_anomalies (time DESC, license_plate, severity)
WHERE status IN ('open', 'acknowledged');

CREATE INDEX CONCURRENTLY idx_vehicle_anomalies_geog_gist 
ON telemetry.vehicle_anomalies USING GIST (geog)
WHERE geog IS NOT NULL;

-- Device status indexes
CREATE INDEX CONCURRENTLY idx_device_status_imei_time
ON telemetry.device_status (imei, time DESC);

CREATE INDEX CONCURRENTLY idx_device_status_attention_needed
ON telemetry.device_status (needs_attention, time DESC)
WHERE needs_attention = true;
```

---

## Real-time Analytics & Continuous Aggregation

### 1. Real-time Summary Views

```sql
-- Real-time vehicle status (last hour data)
CREATE MATERIALIZED VIEW analytics.mv_vehicle_realtime_summary AS
SELECT 
    license_plate,
    LAST(time, time) as last_update,
    LAST(longitude, time) as current_longitude,
    LAST(latitude, time) as current_latitude,
    LAST(speed, time) as current_speed,
    LAST(gps_speed, time) as current_gps_speed,
    LAST(is_moving, time) as is_currently_moving,
    LAST(driver_id, time) as current_driver,
    COUNT(*) as records_last_hour,
    AVG(speed) FILTER (WHERE speed > 0) as avg_speed_last_hour,
    AVG(gps_speed) FILTER (WHERE gps_speed > 0) as avg_gps_speed_last_hour,
    AVG(csq) as avg_signal_quality
FROM telemetry.vehicle_telemetry 
WHERE time >= NOW() - INTERVAL '1 hour'
GROUP BY license_plate;

-- Create unique index for efficient updates
CREATE UNIQUE INDEX idx_mv_vehicle_realtime_summary_license
ON analytics.mv_vehicle_realtime_summary (license_plate);

-- Auto-refresh every 5 minutes
CREATE OR REPLACE FUNCTION refresh_realtime_summary()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_vehicle_realtime_summary;
END;
$$ LANGUAGE plpgsql;

-- Schedule automatic refresh
SELECT cron.schedule('refresh-realtime-summary', '*/5 * * * *', 'SELECT refresh_realtime_summary();');
```

### 2. Continuous Aggregates (CAGGs)

```sql
-- Daily vehicle summary with continuous aggregation
CREATE MATERIALIZED VIEW analytics.cagg_vehicle_daily_summary
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) as date,
    license_plate,
    COUNT(*) as total_records,
    AVG(speed) FILTER (WHERE speed > 0) as avg_speed,
    MAX(speed) as max_speed,
    AVG(gps_speed) FILTER (WHERE gps_speed > 0) as avg_gps_speed,
    MAX(gps_speed) as max_gps_speed,
    MIN(time) as first_seen,
    MAX(time) as last_seen,
    SUM(CASE WHEN is_moving THEN 1 ELSE 0 END) as moving_records,
    SUM(CASE WHEN is_speeding THEN 1 ELSE 0 END) as speeding_records,
    AVG(csq) as avg_signal_quality,
    COUNT(*) FILTER (WHERE gps_status = 'A') as valid_gps_records,
    COUNT(DISTINCT driver_id) FILTER (WHERE driver_id IS NOT NULL) as unique_drivers
FROM telemetry.vehicle_telemetry
GROUP BY date, license_plate;

-- Hourly vehicle summary for real-time analytics
CREATE MATERIALIZED VIEW analytics.cagg_vehicle_hourly_summary
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) as hour,
    license_plate,
    COUNT(*) as total_records,
    AVG(speed) FILTER (WHERE speed > 0) as avg_speed,
    MAX(speed) as max_speed,
    AVG(gps_speed) FILTER (WHERE gps_speed > 0) as avg_gps_speed,
    MAX(gps_speed) as max_gps_speed,
    LAST(longitude, time) as last_longitude,
    LAST(latitude, time) as last_latitude,
    LAST(speed, time) as current_speed,
    LAST(gps_speed, time) as current_gps_speed,
    LAST(is_moving, time) as is_currently_moving,
    LAST(driver_id, time) as current_driver,
    AVG(csq) as avg_signal_quality
FROM telemetry.vehicle_telemetry
GROUP BY hour, license_plate;

-- Driver daily summary
CREATE MATERIALIZED VIEW analytics.cagg_driver_daily_summary
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) as date,
    driver_id,
    COUNT(DISTINCT license_plate) as vehicles_driven,
    COUNT(*) as total_records,
    AVG(speed) FILTER (WHERE speed > 0) as avg_speed,
    MAX(speed) as max_speed,
    AVG(gps_speed) FILTER (WHERE gps_speed > 0) as avg_gps_speed,
    MAX(gps_speed) as max_gps_speed,
    SUM(CASE WHEN is_speeding THEN 1 ELSE 0 END) as speeding_incidents,
    MIN(time) as shift_start,
    MAX(time) as shift_end,
    MAX(time) - MIN(time) as total_driving_duration
FROM telemetry.vehicle_telemetry
WHERE driver_id IS NOT NULL AND driver_id != ''
GROUP BY date, driver_id;

-- Anomaly daily summary
CREATE MATERIALIZED VIEW analytics.cagg_anomaly_daily_summary
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', time) as date,
    license_plate,
    anomaly_type,
    severity,
    COUNT(*) as anomaly_count,
    COUNT(*) FILTER (WHERE is_critical) as critical_count,
    COUNT(*) FILTER (WHERE is_resolved) as resolved_count,
    AVG(driver_confidence_score) as avg_driver_confidence
FROM telemetry.vehicle_anomalies
GROUP BY date, license_plate, anomaly_type, severity;
```

### 3. Continuous Aggregate Refresh Policies

```sql
-- Set up automatic refresh policies for CAGGs
SELECT add_continuous_aggregate_policy('analytics.cagg_vehicle_daily_summary',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour');

SELECT add_continuous_aggregate_policy('analytics.cagg_vehicle_hourly_summary',
    start_offset => INTERVAL '4 hours',
    end_offset => INTERVAL '15 minutes',
    schedule_interval => INTERVAL '15 minutes');

SELECT add_continuous_aggregate_policy('analytics.cagg_driver_daily_summary',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour');

SELECT add_continuous_aggregate_policy('analytics.cagg_anomaly_daily_summary',
    start_offset => INTERVAL '7 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '2 hours');
```

---

## Essential Functions

### 1. Vehicle Track Retrieval Function

```sql
CREATE OR REPLACE FUNCTION get_vehicle_track_by_license_plate(
    p_license_plate VARCHAR(20),
    p_start_time TIMESTAMPTZ DEFAULT NOW() - INTERVAL '24 hours',
    p_end_time TIMESTAMPTZ DEFAULT NOW(),
    p_limit INTEGER DEFAULT 1000
)
RETURNS TABLE (
    time TIMESTAMPTZ,
    longitude DECIMAL(10,7),
    latitude DECIMAL(10,7),
    speed DECIMAL(5,2),
    gps_speed DECIMAL(5,2),
    direction DECIMAL(5,2),
    is_moving BOOLEAN,
    driver_id VARCHAR(20),
    gps_status CHAR(1),
    csq INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        vt.time,
        vt.longitude,
        vt.latitude,
        vt.speed,
        vt.gps_speed,
        vt.direction,
        vt.is_moving,
        vt.driver_id,
        vt.gps_status,
        vt.csq
    FROM telemetry.vehicle_telemetry vt
    WHERE vt.license_plate = p_license_plate
      AND vt.time BETWEEN p_start_time AND p_end_time
      AND vt.longitude IS NOT NULL 
      AND vt.latitude IS NOT NULL
    ORDER BY vt.time
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
```

### 2. Nearby Vehicles Function (Geospatial)

```sql
CREATE OR REPLACE FUNCTION get_nearby_vehicles(
    p_longitude DECIMAL(10,7),
    p_latitude DECIMAL(10,7),
    p_radius_meters INTEGER DEFAULT 1000,
    p_time_window INTERVAL DEFAULT INTERVAL '15 minutes'
)
RETURNS TABLE (
    license_plate VARCHAR(20),
    longitude DECIMAL(10,7),
    latitude DECIMAL(10,7),
    distance_meters DECIMAL(10,2),
    time TIMESTAMPTZ,
    speed DECIMAL(5,2),
    is_moving BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        vt.license_plate,
        vt.longitude,
        vt.latitude,
        ST_Distance(
            vt.geog,
            ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography
        ) as distance_meters,
        vt.time,
        vt.speed,
        vt.is_moving
    FROM telemetry.vehicle_telemetry vt
    WHERE vt.time >= NOW() - p_time_window
      AND vt.geog IS NOT NULL
      AND ST_DWithin(
          vt.geog,
          ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
          p_radius_meters
      )
    ORDER BY distance_meters
    LIMIT 50;
END;
$$ LANGUAGE plpgsql;
```

### 3. Driver Attribution Function (for Anomalies)

```sql
CREATE OR REPLACE FUNCTION get_driver_attribution_for_anomaly(
    p_license_plate VARCHAR(20),
    p_anomaly_time TIMESTAMPTZ,
    p_search_window_minutes INTEGER DEFAULT 10
)
RETURNS TABLE (
    driver_id VARCHAR(20),
    attribution_method VARCHAR(30),
    confidence_score DECIMAL(3,2),
    attribution_details JSONB
) AS $$
DECLARE
    search_start TIMESTAMPTZ := p_anomaly_time - INTERVAL '1 minute' * p_search_window_minutes;
    search_end TIMESTAMPTZ := p_anomaly_time + INTERVAL '1 minute' * p_search_window_minutes;
    exact_match RECORD;
    nearest_match RECORD;
BEGIN
    -- Try exact time match first
    SELECT vt.driver_id, vt.time
    INTO exact_match
    FROM telemetry.vehicle_telemetry vt
    WHERE vt.license_plate = p_license_plate
      AND vt.time = p_anomaly_time
      AND vt.driver_id IS NOT NULL 
      AND vt.driver_id != '';
    
    IF exact_match.driver_id IS NOT NULL THEN
        RETURN QUERY
        SELECT 
            exact_match.driver_id::VARCHAR(20),
            'telemetry_lookup'::VARCHAR(30),
            1.0::DECIMAL(3,2),
            jsonb_build_object(
                'method', 'exact_time_match',
                'telemetry_time', exact_match.time,
                'anomaly_time', p_anomaly_time,
                'time_difference_seconds', 0
            )::JSONB;
        RETURN;
    END IF;
    
    -- Find nearest record within search window
    SELECT 
        vt.driver_id,
        vt.time,
        ABS(EXTRACT(EPOCH FROM (vt.time - p_anomaly_time))) as time_diff_seconds
    INTO nearest_match
    FROM telemetry.vehicle_telemetry vt
    WHERE vt.license_plate = p_license_plate
      AND vt.time BETWEEN search_start AND search_end
      AND vt.driver_id IS NOT NULL 
      AND vt.driver_id != ''
    ORDER BY ABS(EXTRACT(EPOCH FROM (vt.time - p_anomaly_time)))
    LIMIT 1;
    
    IF nearest_match.driver_id IS NOT NULL THEN
        RETURN QUERY
        SELECT 
            nearest_match.driver_id::VARCHAR(20),
            'telemetry_lookup'::VARCHAR(30),
            CASE 
                WHEN nearest_match.time_diff_seconds <= 60 THEN 0.95
                WHEN nearest_match.time_diff_seconds <= 300 THEN 0.85
                WHEN nearest_match.time_diff_seconds <= 600 THEN 0.70
                ELSE 0.50
            END::DECIMAL(3,2),
            jsonb_build_object(
                'method', 'nearest_neighbor',
                'telemetry_time', nearest_match.time,
                'anomaly_time', p_anomaly_time,
                'time_difference_seconds', nearest_match.time_diff_seconds
            )::JSONB;
        RETURN;
    END IF;
    
    -- No driver found
    RETURN QUERY
    SELECT 
        NULL::VARCHAR(20),
        'unknown'::VARCHAR(30),
        0.0::DECIMAL(3,2),
        jsonb_build_object(
            'method', 'no_data_available',
            'anomaly_time', p_anomaly_time,
            'search_window_minutes', p_search_window_minutes,
            'reason', 'No driver information found in telemetry data within search window'
        )::JSONB;
    
END;
$$ LANGUAGE plpgsql;
```

---

## Performance Monitoring

### 1. Key Performance Metrics

```sql
-- Create monitoring views for telemetry performance
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
    'telemetry_compression_ratio' as metric_name,
    ROUND(
        (1 - (compressed_total_bytes::DECIMAL / uncompressed_total_bytes)) * 100, 2
    ) as value,
    'percentage' as unit,
    NOW() as timestamp
FROM timescaledb_information.compressed_chunk_stats
WHERE hypertable_name = 'vehicle_telemetry'
  AND compressed_total_bytes > 0
LIMIT 1;

-- Query performance monitoring
CREATE OR REPLACE VIEW monitoring.v_query_performance AS
SELECT
    query,
    calls,
    total_time,
    mean_time,
    min_time,
    max_time,
    stddev_time
FROM pg_stat_statements
WHERE query LIKE '%telemetry.vehicle_telemetry%'
ORDER BY total_time DESC
LIMIT 10;
```

### 2. Alerting Thresholds

```sql
-- Create alerting function for telemetry performance
CREATE OR REPLACE FUNCTION check_telemetry_performance()
RETURNS TABLE (
    alert_type VARCHAR(50),
    alert_level VARCHAR(20),
    message TEXT,
    value NUMERIC,
    threshold NUMERIC
) AS $$
BEGIN
    -- Check ingestion rate (should be > 100 records/minute normally)
    RETURN QUERY
    SELECT 
        'ingestion_rate'::VARCHAR(50),
        CASE 
            WHEN COUNT(*) < 10 THEN 'critical'
            WHEN COUNT(*) < 50 THEN 'warning'
            ELSE 'ok'
        END::VARCHAR(20),
        'Telemetry ingestion rate is low'::TEXT,
        COUNT(*)::NUMERIC,
        100::NUMERIC
    FROM telemetry.vehicle_telemetry
    WHERE time >= NOW() - INTERVAL '1 minute'
    HAVING COUNT(*) < 100;
    
    -- Check for GPS quality issues
    RETURN QUERY
    SELECT 
        'gps_quality'::VARCHAR(50),
        CASE 
            WHEN invalid_percentage > 50 THEN 'critical'
            WHEN invalid_percentage > 20 THEN 'warning'
            ELSE 'ok'
        END::VARCHAR(20),
        'High percentage of invalid GPS records'::TEXT,
        invalid_percentage,
        20::NUMERIC
    FROM (
        SELECT 
            COUNT(*) FILTER (WHERE gps_status = 'V') * 100.0 / COUNT(*) as invalid_percentage
        FROM telemetry.vehicle_telemetry
        WHERE time >= NOW() - INTERVAL '1 hour'
    ) stats
    WHERE invalid_percentage > 20;
    
    -- Check for device connectivity issues
    RETURN QUERY
    SELECT 
        'device_connectivity'::VARCHAR(50),
        'warning'::VARCHAR(20),
        'Devices with poor signal quality detected'::TEXT,
        COUNT(*)::NUMERIC,
        10::NUMERIC
    FROM telemetry.device_status
    WHERE time >= NOW() - INTERVAL '1 hour'
      AND csq < 10
    HAVING COUNT(*) > 10;
    
END;
$$ LANGUAGE plpgsql;
```

---

## High-Performance Data Ingestion

### 1. Optimized Batch Insert Strategy

```sql
-- Function for high-performance bulk telemetry insert
CREATE OR REPLACE FUNCTION bulk_insert_telemetry(
    p_data JSONB
)
RETURNS INTEGER AS $$
DECLARE
    insert_count INTEGER := 0;
    batch_size INTEGER := 1000;
    current_batch JSONB;
    batch_index INTEGER := 0;
BEGIN
    -- Process data in batches for optimal performance
    WHILE batch_index * batch_size < jsonb_array_length(p_data) LOOP
        current_batch := jsonb_path_query_array(
            p_data, 
            '$[' || batch_index * batch_size || ' to ' || 
            LEAST((batch_index + 1) * batch_size - 1, jsonb_array_length(p_data) - 1) || ']'
        );
        
        -- Use PostgreSQL COPY for maximum performance
        INSERT INTO telemetry.vehicle_telemetry (
            time, license_plate, imei, imsi, longitude, latitude, altitude,
            speed, gps_speed, direction, mileage, gps_status, is_moving, 
            is_speeding, csq, driver_id, raw_data
        )
        SELECT 
            (rec->>'time')::TIMESTAMPTZ,
            rec->>'license_plate',
            rec->>'imei',
            rec->>'imsi',
            (rec->>'longitude')::DECIMAL(10,7),
            (rec->>'latitude')::DECIMAL(10,7),
            (rec->>'altitude')::DECIMAL(8,2),
            (rec->>'speed')::DECIMAL(5,2),
            (rec->>'gps_speed')::DECIMAL(5,2),
            (rec->>'direction')::DECIMAL(5,2),
            (rec->>'mileage')::DECIMAL(10,2),
            rec->>'gps_status',
            (rec->>'is_moving')::BOOLEAN,
            (rec->>'is_speeding')::BOOLEAN,
            (rec->>'csq')::INTEGER,
            rec->>'driver_id',
            rec->'raw_data'
        FROM jsonb_array_elements(current_batch) AS rec
        ON CONFLICT (time, license_plate) DO UPDATE SET
            longitude = EXCLUDED.longitude,
            latitude = EXCLUDED.latitude,
            speed = EXCLUDED.speed,
            gps_speed = EXCLUDED.gps_speed,
            direction = EXCLUDED.direction,
            is_moving = EXCLUDED.is_moving,
            csq = EXCLUDED.csq,
            raw_data = EXCLUDED.raw_data;
        
        GET DIAGNOSTICS insert_count = ROW_COUNT;
        batch_index := batch_index + 1;
    END LOOP;
    
    RETURN insert_count;
END;
$$ LANGUAGE plpgsql;
```

### 2. Connection Pool Configuration

```sql
-- Recommended PostgreSQL settings for high-performance telemetry ingestion
-- (Add these to postgresql.conf)

/*
# Connection and Memory Settings
max_connections = 200
shared_buffers = 4GB              -- 25% of total RAM
effective_cache_size = 12GB       -- 75% of total RAM
work_mem = 64MB                   -- For complex queries
maintenance_work_mem = 1GB        -- For maintenance operations

# Write-Ahead Logging (WAL) for high-throughput writes
wal_buffers = 64MB
checkpoint_completion_target = 0.9
max_wal_size = 4GB
min_wal_size = 1GB

# Background Writer (for smooth write operations)
bgwriter_delay = 50ms
bgwriter_lru_maxpages = 1000
bgwriter_lru_multiplier = 10.0

# TimescaleDB specific settings
timescaledb.max_background_workers = 16
timescaledb.telemetry = off

# Query optimization
random_page_cost = 1.1            -- For SSD storage
effective_io_concurrency = 200    -- For SSD storage
*/
```

---

## Storage Optimization & Sizing

### 1. Storage Growth Estimates

```sql
-- Function to calculate telemetry storage requirements
CREATE OR REPLACE FUNCTION calculate_storage_requirements(
    p_vehicles_count INTEGER,
    p_records_per_vehicle_per_day INTEGER DEFAULT 1440, -- Every minute
    p_days INTEGER DEFAULT 730 -- 2 years retention
)
RETURNS TABLE (
    metric VARCHAR(50),
    value_gb DECIMAL(10,2),
    description TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        'raw_data_uncompressed'::VARCHAR(50),
        (p_vehicles_count * p_records_per_vehicle_per_day * p_days * 0.5 / 1024)::DECIMAL(10,2),
        'Estimated uncompressed telemetry data size'::TEXT
    
    UNION ALL
    
    SELECT 
        'raw_data_compressed'::VARCHAR(50),
        (p_vehicles_count * p_records_per_vehicle_per_day * p_days * 0.5 * 0.2 / 1024)::DECIMAL(10,2),
        'Estimated compressed telemetry data size (80% compression)'::TEXT
    
    UNION ALL
    
    SELECT 
        'indexes_overhead'::VARCHAR(50),
        (p_vehicles_count * p_records_per_vehicle_per_day * p_days * 0.5 * 0.2 * 0.3 / 1024)::DECIMAL(10,2),
        'Estimated index overhead (30% of compressed data)'::TEXT
    
    UNION ALL
    
    SELECT 
        'cagg_storage'::VARCHAR(50),
        (p_vehicles_count * p_days * 0.001 / 1024)::DECIMAL(10,2),
        'Estimated continuous aggregate storage'::TEXT
    
    UNION ALL
    
    SELECT 
        'total_storage_required'::VARCHAR(50),
        (p_vehicles_count * p_records_per_vehicle_per_day * p_days * 0.5 * 0.2 * 1.5 / 1024)::DECIMAL(10,2),
        'Total storage required including overhead'::TEXT;
    
END;
$$ LANGUAGE plpgsql;

-- Example usage for 1000 vehicles over 2 years:
-- SELECT * FROM calculate_storage_requirements(1000, 1440, 730);
```

### 2. Performance Benchmarks

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **Ingestion Rate** | 10,000+ records/sec | `SELECT COUNT(*) FROM telemetry.vehicle_telemetry WHERE time >= NOW() - INTERVAL '1 second'` |
| **Query Response Time** | < 100ms for recent data | `EXPLAIN ANALYZE SELECT * FROM telemetry.vehicle_telemetry WHERE license_plate = 'XXX' AND time >= NOW() - INTERVAL '1 hour'` |
| **Compression Ratio** | 70-85% | `SELECT * FROM timescaledb_information.compressed_chunk_stats WHERE hypertable_name = 'vehicle_telemetry'` |
| **Storage Growth** | < 500MB/day per 1000 vehicles | Monitor with `pg_total_relation_size()` |
| **Index Hit Ratio** | > 95% | `SELECT * FROM monitoring.v_telemetry_performance` |

---

## Maintenance & Operations

### 1. Daily Maintenance Tasks

```sql
-- Create maintenance procedures
CREATE OR REPLACE FUNCTION daily_telemetry_maintenance()
RETURNS TEXT AS $$
DECLARE
    result_msg TEXT := '';
    stats_record RECORD;
BEGIN
    -- Refresh materialized views
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_vehicle_realtime_summary;
    result_msg := result_msg || 'Refreshed realtime summary view. ';
    
    -- Update table statistics for query optimizer
    ANALYZE telemetry.vehicle_telemetry;
    ANALYZE telemetry.vehicle_anomalies;
    ANALYZE telemetry.device_status;
    result_msg := result_msg || 'Updated table statistics. ';
    
    -- Check compression job status
    SELECT INTO stats_record
        SUM(uncompressed_total_bytes) as uncompressed_total,
        SUM(compressed_total_bytes) as compressed_total
    FROM timescaledb_information.compressed_chunk_stats 
    WHERE hypertable_name = 'vehicle_telemetry';
    
    IF stats_record.compressed_total > 0 THEN
        result_msg := result_msg || 'Compression ratio: ' || 
            ROUND((1 - stats_record.compressed_total::DECIMAL / stats_record.uncompressed_total) * 100, 2) || '%. ';
    END IF;
    
    -- Check for performance issues
    IF EXISTS (SELECT 1 FROM check_telemetry_performance() WHERE alert_level IN ('critical', 'warning')) THEN
        result_msg := result_msg || 'ALERT: Performance issues detected. ';
    END IF;
    
    RETURN result_msg;
END;
$$ LANGUAGE plpgsql;

-- Schedule daily maintenance
SELECT cron.schedule('daily-telemetry-maintenance', '0 2 * * *', 'SELECT daily_telemetry_maintenance();');
```

### 2. Emergency Recovery Procedures

```sql
-- Emergency cleanup for storage issues
CREATE OR REPLACE FUNCTION emergency_cleanup_old_data(
    p_days_to_keep INTEGER DEFAULT 7
)
RETURNS TEXT AS $$
DECLARE
    cleanup_date TIMESTAMPTZ := NOW() - INTERVAL '1 day' * p_days_to_keep;
    deleted_count BIGINT;
BEGIN
    -- Delete old uncompressed telemetry data
    DELETE FROM telemetry.vehicle_telemetry 
    WHERE time < cleanup_date;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Vacuum to reclaim space
    VACUUM ANALYZE telemetry.vehicle_telemetry;
    
    RETURN 'Emergency cleanup completed. Deleted ' || deleted_count || ' records older than ' || cleanup_date;
END;
$$ LANGUAGE plpgsql;
```

---

## Usage Examples

### 1. Common Query Patterns

```sql
-- Get real-time vehicle locations
SELECT 
    license_plate,
    longitude,
    latitude,
    speed,
    gps_speed,
    is_moving,
    time
FROM telemetry.vehicle_telemetry 
WHERE time >= NOW() - INTERVAL '15 minutes'
  AND gps_status = 'A'
ORDER BY license_plate, time DESC;

-- Find speeding incidents
SELECT 
    license_plate,
    time,
    speed,
    gps_speed,
    longitude,
    latitude,
    driver_id
FROM telemetry.vehicle_telemetry 
WHERE is_speeding = true 
  AND time >= NOW() - INTERVAL '24 hours'
ORDER BY time DESC;

-- Vehicle utilization report
SELECT 
    date,
    license_plate,
    total_records,
    avg_speed,
    max_speed,
    moving_records,
    ROUND(moving_records * 100.0 / total_records, 2) as utilization_percentage
FROM analytics.cagg_vehicle_daily_summary
WHERE date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY date DESC, utilization_percentage DESC;

-- Driver performance analysis
SELECT 
    driver_id,
    date,
    vehicles_driven,
    avg_speed,
    max_speed,
    speeding_incidents,
    total_driving_duration
FROM analytics.cagg_driver_daily_summary
WHERE date >= CURRENT_DATE - INTERVAL '30 days'
  AND speeding_incidents > 0
ORDER BY speeding_incidents DESC;
```

### 2. Geospatial Queries

```sql
-- Find vehicles in a specific area
SELECT 
    license_plate,
    longitude,
    latitude,
    time,
    speed
FROM telemetry.vehicle_telemetry
WHERE time >= NOW() - INTERVAL '1 hour'
  AND ST_Within(
      geom,
      ST_MakeEnvelope(120.9, 23.5, 121.6, 25.3, 4326) -- Taiwan area example
  );

-- Calculate distance between consecutive points
SELECT 
    license_plate,
    time,
    longitude,
    latitude,
    LAG(geog) OVER (PARTITION BY license_plate ORDER BY time) as prev_location,
    CASE 
        WHEN LAG(geog) OVER (PARTITION BY license_plate ORDER BY time) IS NOT NULL 
        THEN ST_Distance(
            geog, 
            LAG(geog) OVER (PARTITION BY license_plate ORDER BY time)
        )
        ELSE 0 
    END as distance_meters
FROM telemetry.vehicle_telemetry
WHERE license_plate = 'ABC-1234'
  AND time >= NOW() - INTERVAL '24 hours'
ORDER BY time;
```

---

## 🎯 Best Practices Summary

### Performance Optimization
1. **Use TimescaleDB hypertables** with appropriate chunk intervals (1 day for high-frequency data)
2. **Enable compression** for data older than 7 days (70-85% space savings)
3. **Create targeted indexes** for common query patterns, especially geospatial indexes
4. **Use continuous aggregates** instead of real-time aggregation for dashboards
5. **Implement connection pooling** with appropriate worker limits

### Data Quality
1. **Validate GPS coordinates** before storing (range checks, null handling)
2. **Implement driver attribution logic** for accurate anomaly assignment
3. **Use generated columns** for geospatial data to ensure consistency
4. **Monitor signal quality** and data ingestion rates continuously
5. **Implement data retention policies** to manage storage growth

### Operational Excellence
1. **Monitor compression ratios** and query performance regularly
2. **Use BRIN indexes** for time-based range queries
3. **Implement automated maintenance** procedures and alerting
4. **Plan for storage growth** based on vehicle count and data frequency
5. **Regular backup and recovery testing** for critical telemetry data

This optimized telemetry architecture provides a solid foundation for high-performance vehicle data processing while maintaining data quality and operational efficiency.
