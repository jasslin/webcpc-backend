# Database Schema Reference for External Development Teams

## Overview

This document provides comprehensive database schema information specifically designed for external development teams and contractors. It includes table structures, relationships, performance considerations, and business logic explanations.

## Database Structure

### Schema Organization

```sql
-- Core Schemas
telemetry.*     -- Vehicle telemetry data (main business data)
config.*        -- System configuration and policies  
analytics.*     -- Pre-computed views and summaries
monitoring.*    -- System health and performance metrics
```

## Core Tables

### 1. telemetry.vehicle_telemetry

**Purpose**: Main table storing vehicle telemetry data with TimescaleDB optimization for high-frequency inserts.

**Business Context**: 
- Receives 10,000+ records/second from vehicle IoT devices
- Primary data source for fleet management, driver behavior analysis, and operational insights
- Optimized for time-series queries and geospatial analysis

#### Table Structure
```sql
CREATE TABLE telemetry.vehicle_telemetry (
    -- Primary Keys (Optimized Order)
    license_plate VARCHAR(20) NOT NULL,  -- Vehicle identifier (partition key)
    time TIMESTAMPTZ NOT NULL,           -- Data timestamp (time key)
    
    -- Device Information
    imei VARCHAR(15),                    -- Device IMEI for hardware tracking
    imsi VARCHAR(15),                    -- SIM card ID for network analytics
    
    -- Location Data (High-frequency query fields)
    longitude DECIMAL(10,7),             -- GPS longitude (-180 to 180)
    latitude DECIMAL(10,7),              -- GPS latitude (-90 to 90) 
    altitude DECIMAL(8,2),               -- Meters above sea level
    
    -- Movement Data
    speed DECIMAL(5,2) CHECK (speed >= 0 AND speed <= 300),
    gps_speed DECIMAL(5,2),              -- GPS-calculated speed (may differ from vehicle speed)
    direction DECIMAL(5,2) CHECK (direction >= 0 AND direction < 360),
    mileage DECIMAL(10,2),               -- Total vehicle mileage
    rpm INTEGER CHECK (rpm >= 0 AND rpm <= 10000),
    
    -- GPS Quality Indicators
    gps_status CHAR(1) CHECK (gps_status IN ('A', 'V')), -- A=Active, V=Void
    gps_satellite_count INTEGER CHECK (gps_satellite_count >= 0 AND gps_satellite_count <= 50),
    
    -- Computed Status Fields
    is_moving BOOLEAN DEFAULT false,      -- Computed from speed > threshold
    is_speeding BOOLEAN DEFAULT false,    -- Computed from speed > speed_limit
    csq INTEGER CHECK (csq BETWEEN 0 AND 31), -- Signal quality (0=poor, 31=excellent)
    
    -- Driver Information
    driver_id VARCHAR(20),               -- Driver ID when available
    
    -- Legacy System Compatibility
    log_sequence INTEGER,                -- Packet sequence for integrity verification
    crc_checksum VARCHAR(100),          -- Original packet checksum
    
    -- IO Status (Flattened from bit strings for performance)
    ignition BOOLEAN,                   -- ACC status
    engine_on BOOLEAN,                  -- Engine running status
    door_open BOOLEAN,                  -- Any door open
    brake_signal BOOLEAN,               -- Brake pedal pressed
    
    -- Device Status (Flattened for performance)
    fuel_level INTEGER CHECK (fuel_level >= 0 AND fuel_level <= 100),
    battery_voltage DECIMAL(4,2) CHECK (battery_voltage >= 0 AND battery_voltage <= 50),
    engine_temperature DECIMAL(5,2) CHECK (engine_temperature >= -50 AND engine_temperature <= 200),
    
    -- Raw Data Storage (Complete original data preservation)
    raw_data JSONB,                     -- Complete raw payload from device
    
    -- Generated Geospatial Columns (Automatic computation)
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
    data_source VARCHAR(50) DEFAULT 'vehicle_device',
    
    -- Primary Key (Order optimized for production performance)
    CONSTRAINT pk_vehicle_telemetry PRIMARY KEY (license_plate, time)
);

-- TimescaleDB Hypertable Configuration
SELECT create_hypertable('telemetry.vehicle_telemetry', 'time', 
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);
```

#### Performance Indexes
```sql
-- Primary composite index (automatic with PK)
-- idx_vehicle_telemetry_pkey ON (license_plate, time DESC)

-- Geospatial index for location-based queries
CREATE INDEX idx_vehicle_telemetry_geom ON telemetry.vehicle_telemetry USING GIST (geom);

-- Time-range index for large time-series scans
CREATE INDEX idx_vehicle_telemetry_time_brin ON telemetry.vehicle_telemetry USING BRIN (time);

-- Driver analysis index
CREATE INDEX idx_vehicle_telemetry_driver ON telemetry.vehicle_telemetry (driver_id, time DESC) 
WHERE driver_id IS NOT NULL;
```

#### Data Volume & Performance
- **Expected Volume**: 10M+ records/day
- **Retention**: 2 years (configurable per tenant)
- **Compression**: Automatic after 7 days (3:1 ratio expected)
- **Query Performance**: <100ms for recent data (last 24h)

#### Common Query Patterns
```sql
-- 1. Vehicle track for specific time range
SELECT license_plate, time, longitude, latitude, speed
FROM telemetry.vehicle_telemetry
WHERE license_plate = 'ABC-1234'
  AND time >= NOW() - INTERVAL '24 hours'
ORDER BY time DESC;

-- 2. Vehicles near location
SELECT license_plate, ST_Distance(geog, ST_Point(121.5654, 25.0330)::geography) as distance_meters
FROM telemetry.vehicle_telemetry
WHERE ST_DWithin(geog, ST_Point(121.5654, 25.0330)::geography, 1000)
  AND time >= NOW() - INTERVAL '1 hour'
ORDER BY distance_meters;

-- 3. Speed violations in area
SELECT license_plate, time, speed, longitude, latitude
FROM telemetry.vehicle_telemetry
WHERE speed > 80
  AND time >= CURRENT_DATE
  AND ST_Within(geom, ST_GeomFromText('POLYGON((...))'));
```

### 2. telemetry.vehicle_anomalies

**Purpose**: Stores detected anomaly events and driver attribution for compliance and analysis.

#### Table Structure
```sql
CREATE TABLE telemetry.vehicle_anomalies (
    -- Primary Keys
    license_plate VARCHAR(20) NOT NULL,
    time TIMESTAMPTZ NOT NULL,
    anomaly_id SERIAL,
    
    -- Location (at time of anomaly)
    longitude DECIMAL(10,7),
    latitude DECIMAL(10,7),
    
    -- Anomaly Classification
    anomaly_type VARCHAR(50) NOT NULL,  -- 'speed_violation', 'harsh_braking', 'rapid_acceleration', etc.
    severity VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
    description TEXT,
    status VARCHAR(20) DEFAULT 'open',  -- 'open', 'investigating', 'resolved', 'false_positive'
    
    -- Driver Attribution
    driver_id VARCHAR(20),
    driver_attribution_method VARCHAR(50), -- 'rfid_card', 'facial_recognition', 'manual_assignment'
    driver_confidence_score DECIMAL(3,2) CHECK (driver_confidence_score >= 0 AND driver_confidence_score <= 1),
    attribution_details JSONB,
    
    -- Status Flags
    is_critical BOOLEAN DEFAULT false,
    is_resolved BOOLEAN DEFAULT false,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    
    -- Primary Key
    CONSTRAINT pk_vehicle_anomalies PRIMARY KEY (license_plate, time, anomaly_id)
);
```

### 3. config.retention_policies

**Purpose**: Configurable data retention policies for compliance and storage management.

#### Table Structure
```sql
CREATE TABLE config.retention_policies (
    -- Policy Identification
    tenant_id VARCHAR(50) NOT NULL,
    data_type VARCHAR(50) NOT NULL,
    
    -- Retention Configuration
    retention_days INTEGER NOT NULL CHECK (retention_days > 0),
    compression_days INTEGER DEFAULT 7 CHECK (compression_days >= 1),
    
    -- Compliance Information
    regulatory_requirement VARCHAR(100),
    policy_description TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Primary Key
    CONSTRAINT pk_retention_policies PRIMARY KEY (tenant_id, data_type)
);
```

## Analytics Views

### 1. analytics.v_daily_vehicle_summary

**Purpose**: Pre-computed daily statistics per vehicle for dashboard and reporting.

```sql
CREATE VIEW analytics.v_daily_vehicle_summary AS
SELECT 
    DATE(time) as date,
    license_plate,
    COUNT(*) as total_records,
    AVG(speed) as avg_speed,
    MAX(speed) as max_speed,
    MIN(speed) as min_speed,
    AVG(rpm) as avg_rpm,
    COUNT(*) FILTER (WHERE speed > 80) as speeding_incidents,
    COUNT(*) FILTER (WHERE is_moving = true) as moving_records,
    ST_Centroid(ST_Union(geom)) as center_point,
    SUM(
        CASE 
            WHEN LAG(geom) OVER (PARTITION BY license_plate ORDER BY time) IS NOT NULL
            THEN ST_Distance(geom::geography, LAG(geom) OVER (PARTITION BY license_plate ORDER BY time)::geography)
            ELSE 0 
        END
    ) as total_distance_meters
FROM telemetry.vehicle_telemetry
WHERE time >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(time), license_plate;
```

## Data Types and Constraints

### Geospatial Data
- **GEOMETRY**: For planar calculations, faster for local area analysis
- **GEOGRAPHY**: For accurate earth-surface calculations, required for distance measurements
- **SRID 4326**: WGS84 coordinate system (standard GPS coordinates)

### Time-Series Optimization
- **TIMESTAMPTZ**: Always use timezone-aware timestamps
- **Hypertable Chunking**: 1-day chunks for optimal performance
- **BRIN Indexes**: For time-range queries on large datasets

### JSON Data Storage
- **JSONB**: Binary JSON for better performance and indexing
- **GIN Indexes**: For JSON field queries (add as needed)

## Performance Considerations

### Write Performance
- **Batch Inserts**: Use bulk insert functions for >100 records
- **Primary Key Order**: (license_plate, time) distributes writes across partitions
- **Avoid Triggers**: Use generated columns instead where possible

### Read Performance  
- **Time Bounds**: Always include time constraints in queries
- **Spatial Indexes**: Use GIST indexes for geospatial queries
- **Compression**: Older data automatically compressed (read-only)

### Query Optimization
```sql
-- Good: Uses partition pruning and indexes
SELECT * FROM telemetry.vehicle_telemetry 
WHERE license_plate = 'ABC-1234' 
  AND time >= NOW() - INTERVAL '24 hours';

-- Bad: Full table scan
SELECT * FROM telemetry.vehicle_telemetry 
WHERE speed > 100;

-- Better: With time bounds
SELECT * FROM telemetry.vehicle_telemetry 
WHERE speed > 100 
  AND time >= NOW() - INTERVAL '1 hour';
```

## Business Rules

### Data Validation
- **Speed Limits**: 0-300 km/h (physical limits)
- **GPS Coordinates**: Validate longitude/latitude ranges
- **Signal Quality**: CSQ 0-31 (GSM standard)
- **Time Constraints**: Future timestamps rejected

### Data Quality
- **Duplicate Prevention**: Primary key prevents exact duplicates
- **Null Handling**: GPS coordinates can be null (indoor/tunnel scenarios)
- **Outlier Detection**: Speed/location validation in application layer

### Compliance Requirements
- **Data Retention**: Configurable per tenant (default 2 years)
- **Privacy**: Driver data anonymization for non-authorized queries
- **Audit Trail**: All anomaly status changes logged

## Integration Points

### Data Ingestion
- **Bulk Insert Function**: `bulk_insert_telemetry_simple(JSONB)`
- **Real-time Streaming**: Supports high-frequency device data
- **Error Handling**: Invalid records logged but don't block batch

### Data Export
- **Time-range Exports**: Efficient for compliance reporting
- **Geospatial Exports**: GeoJSON format support
- **Analytics Exports**: Pre-computed summaries for BI tools

## Development Guidelines

### For External Teams

#### Database Connections
```javascript
// Use connection pooling
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Maximum pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

#### Query Patterns
```javascript
// Always use parameterized queries
const result = await pool.query(
  'SELECT * FROM telemetry.vehicle_telemetry WHERE license_plate = $1 AND time >= $2',
  [licensePlate, startTime]
);

// Use transactions for multi-table operations
const client = await pool.connect();
try {
  await client.query('BEGIN');
  // ... multiple queries ...
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
```

#### Error Handling
```javascript
// Handle TimescaleDB specific errors
try {
  await insertTelemetry(data);
} catch (error) {
  if (error.code === '23505') {
    // Duplicate key - log and continue
    console.warn('Duplicate telemetry record ignored');
  } else if (error.code === '23514') {
    // Check constraint violation - data validation error
    throw new ValidationError('Invalid telemetry data', error.detail);
  } else {
    // Other errors - escalate
    throw error;
  }
}
```

## Testing Data

### Sample Records
```sql
-- Insert test data
INSERT INTO telemetry.vehicle_telemetry (
    license_plate, time, longitude, latitude, speed, driver_id
) VALUES 
    ('TEST-001', NOW(), 121.5654, 25.0330, 45.2, 'DRIVER001'),
    ('TEST-002', NOW() - INTERVAL '1 minute', 121.5660, 25.0335, 52.8, 'DRIVER002');
```

### Performance Testing
```sql
-- Generate bulk test data
SELECT bulk_insert_telemetry_simple(
  jsonb_build_array(
    jsonb_build_object(
      'license_plate', 'PERF-' || generate_series,
      'time', NOW() - (generate_series || ' minutes')::INTERVAL,
      'longitude', 121.5 + random() * 0.1,
      'latitude', 25.0 + random() * 0.1,
      'speed', random() * 100
    )
  )
) FROM generate_series(1, 10000);
```

## Troubleshooting

### Common Issues

#### High Memory Usage
```sql
-- Check chunk sizes
SELECT chunk_schema, chunk_name, table_bytes, index_bytes, toast_bytes
FROM timescaledb_information.chunks
WHERE hypertable_name = 'vehicle_telemetry'
ORDER BY table_bytes DESC;
```

#### Slow Queries
```sql
-- Enable query logging
SET log_min_duration_statement = 1000; -- Log queries > 1 second

-- Check query plans
EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM telemetry.vehicle_telemetry 
WHERE license_plate = 'ABC-1234' AND time >= NOW() - INTERVAL '1 hour';
```

#### Index Usage
```sql
-- Check index usage statistics
SELECT schemaname, tablename, indexname, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes 
WHERE schemaname = 'telemetry'
ORDER BY idx_tup_read DESC;
```

## Migration Considerations

### From Legacy Systems
- **Field Mapping**: See `LEGACY_MIGRATION_GUIDE.md` for complete mapping
- **Data Types**: Automatic conversion handled by migration scripts
- **Batch Processing**: Migrate in time-based chunks to avoid locks

### Schema Updates
- **Additive Changes**: Add new columns with defaults
- **Breaking Changes**: Require application coordination
- **Index Changes**: Plan for maintenance windows

---

**Note**: This document should be updated with any schema changes. External teams should always verify current schema with `\d+ telemetry.vehicle_telemetry` in psql.

## Usage Guidance

### telemetry.vehicle_telemetry
- Purpose: Primary time-series + geospatial store for vehicle data; optimized for high-frequency writes and time-window reads.
- Write:
  - Use API `POST /api/telemetry/batch`; batch, parameterized; avoid direct DB writes.
  - PK `(license_plate, time)` requires `time` present and deduplicates exact duplicates.
- Read:
  - Always include a time range; paginate results for lists.
  - Radius queries: use `geog + ST_DWithin` for meters-accurate distance.
  - Polygon/zone queries: use `geom + ST_Within/ST_Intersects`.
  - Prefer flattened hot fields for filters; use `raw_data` for supplementary info only.
- Indexes in play: PK (license_plate, time desc), `GIST(geom)`, `BRIN(time)`.
- Query templates:
```sql
-- Track for a vehicle (last 24h)
SELECT license_plate, time, longitude, latitude, speed
FROM telemetry.vehicle_telemetry
WHERE license_plate = $1
  AND time >= NOW() - INTERVAL '24 hours'
ORDER BY time DESC
LIMIT 1000;

-- Nearby vehicles (1km, last 1h)
SELECT license_plate,
       ST_Distance(geog, ST_Point($1,$2)::geography) AS distance_meters,
       time, speed
FROM telemetry.vehicle_telemetry
WHERE ST_DWithin(geog, ST_Point($1,$2)::geography, 1000)
  AND time >= NOW() - INTERVAL '1 hour'
ORDER BY distance_meters
LIMIT 200;
```
- Anti-patterns:
  - Full scans without time bounds
  - Heavy filtering on `raw_data` JSONB
  - Long-window aggregations (prefer analytics views)

### telemetry.vehicle_anomalies
- Purpose: Discrete anomaly events (speeding, harsh braking, etc.) and driver attribution for auditing and alerts.
- Write: Inserted by back-office detection/ETL; avoid public API direct writes.
- Read: Filter by date/license_plate/severity; join to driver if needed.
- Template:
```sql
SELECT time, license_plate, anomaly_type, severity, status
FROM telemetry.vehicle_anomalies
WHERE time::date = $1::date
  AND (license_plate = $2 OR $2 IS NULL)
  AND (severity = $3 OR $3 IS NULL)
ORDER BY time DESC
LIMIT 1000;
```

### config.retention_policies
- Purpose: Per-tenant retention/compression policy that controls cost and compliance.
- Ops-only: Changes require maintenance window and announcement.
- Templates:
```sql
-- Read policy
SELECT * FROM config.retention_policies
WHERE tenant_id = $1 ORDER BY data_type;

-- Update policy (post-approval)
UPDATE config.retention_policies
SET retention_days = 1095, compression_days = 14, updated_at = NOW()
WHERE tenant_id = $1 AND data_type = 'telemetry';
```

### analytics.* views
- Purpose: Dashboards/reports; avoid heavy aggregations on base tables.
- Guidance: Prefer `v_daily_*` and `v_vehicle_track_summary` for common KPIs; layer custom aggregates on top of these views.
- Template:
```sql
SELECT * FROM analytics.v_daily_vehicle_summary
WHERE date BETWEEN $1 AND $2
  AND (license_plate = $3 OR $3 IS NULL)
ORDER BY date, license_plate
LIMIT 1000;
```

### Cross-cutting rules
- Time bounds: Mandatory on all fact-table queries; use views for long windows.
- Spatial:
  - Distance/radius: `geog + ST_DWithin`
  - Region/polygon: `geom + ST_Within/ST_Intersects`
- JSONB: Keep hot fields flattened; add GIN indexes only if necessary.
- Performance:
  - Batch writes; avoid per-row transactions
  - Validate plans with `EXPLAIN ANALYZE`; expect PK/BRIN/GIST usage
- Data quality:
  - Validate gps ranges, speed limits; allow null coords (indoor/tunnel)
- Access control:
  - App read: read-only role (`telemetry.*`, `analytics.*`)
  - Writes: API/ETL service accounts only
  - Ops: may alter `config.*` and run maintenance
