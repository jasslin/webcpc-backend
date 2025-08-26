# VDRS Production Environment Optimization Guide

## Production Risk Assessment and Fine-tuning Recommendations

Based on actual deployment experience, this guide provides key optimization strategies and risk mitigation measures for the VDRS telemetry system in production environments.

---

## Indexing Strategy: Progressive Enablement

### Initial "Essential" Indexes (Phase 1)
```sql
-- Core query index: Vehicle time series query
CREATE INDEX idx_telemetry_license_time_essential 
ON telemetry.vehicle_telemetry (license_plate, time DESC);

-- Geospatial query (only geom, avoid double calculation cost)
CREATE INDEX idx_telemetry_geom_essential 
ON telemetry.vehicle_telemetry USING GIST (geom) 
WHERE geom IS NOT NULL;

-- Time range query (BRIN low maintenance cost)
CREATE INDEX idx_telemetry_time_brin_essential 
ON telemetry.vehicle_telemetry USING BRIN (time) 
WITH (pages_per_range = 128);

-- Status filtering index
CREATE INDEX idx_telemetry_gps_status_essential 
ON telemetry.vehicle_telemetry (gps_status, time DESC) 
WHERE gps_status = 'A';
```

### Observation Period Index Decision Matrix
| Query Pattern | Hit Rate Threshold | Consider Adding Index | Risk Assessment |
|---------|-----------|-------------|----------|
| Speed filtering query | > 10% | `(speed, time DESC)` | Medium write impact |
| Driver performance query | > 5% | `(driver_id, time DESC)` | High selectivity, recommended |
| Area heatmap | > 3% | `GIST (geog)` | **Only consider for large radius queries** |
| Device status monitoring | > 15% | `(needs_attention, time DESC)` | Low risk |

### Index Monitoring Queries
```sql
-- Index usage rate monitoring
SELECT 
    schemaname, 
    tablename, 
    indexname, 
    idx_scan,
    idx_tup_read,
    idx_tup_fetch,
    idx_scan::float / NULLIF(seq_scan + idx_scan, 0) AS idx_usage_ratio
FROM pg_stat_user_indexes 
WHERE schemaname = 'telemetry'
ORDER BY idx_usage_ratio DESC;

-- Index size and maintenance cost
SELECT 
    indexname,
    pg_size_pretty(pg_relation_size(indexname::regclass)) as size,
    pg_stat_get_tuples_inserted(c.oid) as inserts_since_analyze
FROM pg_indexes i
JOIN pg_class c ON c.relname = i.indexname
WHERE schemaname = 'telemetry';
```

---

## CAGG Progressive Deployment Strategy

### Phase 1: Hourly Aggregation (Minimum Risk)
```sql
-- Only enable hourly vehicle summary
CREATE MATERIALIZED VIEW analytics.cagg_vehicle_hourly_basic
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', time) as hour,
    license_plate,
    COUNT(*) as record_count,
    AVG(speed) FILTER (WHERE speed > 0) as avg_speed,
    MAX(speed) as max_speed,
    LAST(longitude, time) as last_longitude,
    LAST(latitude, time) as last_latitude,
    LAST(is_moving, time) as is_moving
FROM telemetry.vehicle_telemetry
WHERE time > NOW() - INTERVAL '7 days'  -- Limit initial data volume
GROUP BY hour, license_plate;

-- Conservative refresh strategy
SELECT add_continuous_aggregate_policy('analytics.cagg_vehicle_hourly_basic',
    start_offset => INTERVAL '2 hours',
    end_offset => INTERVAL '30 minutes',
    schedule_interval => INTERVAL '30 minutes');
```

### CAGG Performance Monitoring
```sql
-- Background worker load monitoring
SELECT 
    job_id,
    application_name,
    scheduled,
    started,
    finished,
    succeeded,
    proc_pid,
    timeout_at - now() as time_remaining
FROM timescaledb_information.job_stats
WHERE job_type = 'continuous_aggregate';

-- CAGG refresh cost analysis
SELECT 
    view_name,
    completed_threshold,
    last_run_duration,
    total_runs,
    total_failures
FROM timescaledb_information.continuous_aggregate_stats;
```

### Phase 2 Expansion Decision Criteria
- **CPU Usage** < 70% sustained for 1 week
- **Background job delay** < 5 minutes
- **Disk I/O wait** < 10%
- **Memory usage** < 80%

---

## Field Design Optimization

### geom vs geog Strategy Selection
```sql
-- Option A: Keep only geom (recommended for initial phase)
ALTER TABLE telemetry.vehicle_telemetry 
DROP COLUMN IF EXISTS geog;

-- Temporary conversion for geographic distance queries
SELECT 
    license_plate,
    ST_Distance(geom::geography, ST_Point(121.5654, 25.0330)::geography) as distance_m
FROM telemetry.vehicle_telemetry
WHERE ST_DWithin(geom::geography, ST_Point(121.5654, 25.0330)::geography, 1000);

-- Option B: Keep both columns, but add trigger optimization
CREATE OR REPLACE FUNCTION update_geog_column()
RETURNS TRIGGER AS $$
BEGIN
    -- Only update geog when longitude/latitude changes
    IF OLD.longitude IS DISTINCT FROM NEW.longitude 
       OR OLD.latitude IS DISTINCT FROM NEW.latitude THEN
        NEW.geog := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### raw_data JSONB Optimization Strategy
```sql
-- Layered storage strategy: Hot data field flattening
ALTER TABLE telemetry.vehicle_telemetry 
ADD COLUMN ignition BOOLEAN,
ADD COLUMN engine_on BOOLEAN,
ADD COLUMN fuel_level INTEGER,
ADD COLUMN battery_voltage DECIMAL(4,2);

-- Large payload external storage trigger
CREATE OR REPLACE FUNCTION archive_large_payloads()
RETURNS TRIGGER AS $$
BEGIN
    -- Move raw_data exceeding 8KB to object storage
    IF pg_column_size(NEW.raw_data) > 8192 THEN
        -- Call external API to store in S3/MinIO
        -- NEW.raw_data := jsonb_build_object('archived_url', upload_to_s3(NEW.raw_data));
        RAISE WARNING 'Large payload detected for vehicle %, consider archiving', NEW.license_plate;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## Primary Key and Upsert Optimization

### Primary Key Order Adjustment (Recommended)
```sql
-- Original design: (time, license_plate) - may cause hotspots
-- Optimized to: (license_plate, time) - better matches query patterns

-- New table design
CREATE TABLE telemetry.vehicle_telemetry_v2 (
    license_plate VARCHAR(20) NOT NULL,
    time TIMESTAMPTZ NOT NULL,
    -- ... other fields
    PRIMARY KEY (license_plate, time)
);

-- Migration strategy (progressive)
-- 1. Create new table
-- 2. Dual write (application layer)
-- 3. Data synchronization verification
-- 4. Switch reads
-- 5. Stop old table writes
```

### Batch Upsert Conflict Handling
```sql
-- Optimized batch insert function
CREATE OR REPLACE FUNCTION bulk_insert_telemetry_optimized(
    p_data JSONB,
    p_batch_size INTEGER DEFAULT 500  -- Reduce batch size to minimize conflicts
)
RETURNS TABLE (
    inserted_count INTEGER,
    conflict_count INTEGER,
    error_count INTEGER
) AS $$
DECLARE
    batch_start INTEGER := 0;
    batch_end INTEGER;
    current_batch JSONB;
    insert_result RECORD;
BEGIN
    inserted_count := 0;
    conflict_count := 0;
    error_count := 0;
    
    WHILE batch_start < jsonb_array_length(p_data) LOOP
        batch_end := LEAST(batch_start + p_batch_size, jsonb_array_length(p_data));
        current_batch := jsonb_path_query_array(p_data, '$[' || batch_start || ' to ' || (batch_end - 1) || ']');
        
        BEGIN
            WITH inserted AS (
                INSERT INTO telemetry.vehicle_telemetry (...)
                SELECT ... FROM jsonb_array_elements(current_batch)
                ON CONFLICT (license_plate, time) DO UPDATE SET
                    longitude = EXCLUDED.longitude,
                    latitude = EXCLUDED.latitude,
                    -- Only update key fields, reduce WAL load
                    raw_data = EXCLUDED.raw_data
                RETURNING xmax
            )
            SELECT 
                COUNT(*) FILTER (WHERE xmax = 0) as new_rows,
                COUNT(*) FILTER (WHERE xmax > 0) as updated_rows
            INTO insert_result
            FROM inserted;
            
            inserted_count := inserted_count + COALESCE(insert_result.new_rows, 0);
            conflict_count := conflict_count + COALESCE(insert_result.updated_rows, 0);
            
        EXCEPTION WHEN OTHERS THEN
            error_count := error_count + (batch_end - batch_start);
            RAISE WARNING 'Batch insert failed: %', SQLERRM;
        END;
        
        batch_start := batch_end;
    END LOOP;
    
    RETURN QUERY SELECT inserted_count, conflict_count, error_count;
END;
$$ LANGUAGE plpgsql;
```

---

## Compliance-Driven Data Lifecycle

### Multi-tenant Retention Strategy
```sql
-- Compliance policy table
CREATE TABLE config.retention_policies (
    tenant_id VARCHAR(50),
    data_type VARCHAR(50),
    retention_days INTEGER,
    compression_days INTEGER,
    regulatory_requirement TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Example policies
INSERT INTO config.retention_policies VALUES
('client_a', 'vehicle_telemetry', 2555, 30, 'EU GDPR - 7 years'),
('client_b', 'vehicle_telemetry', 1095, 7, 'Local regulation - 3 years'),
('government', 'vehicle_telemetry', 3650, 90, 'National security - 10 years');

-- Dynamic retention policy function
CREATE OR REPLACE FUNCTION apply_tenant_retention_policy(p_tenant_id VARCHAR)
RETURNS VOID AS $$
DECLARE
    policy RECORD;
BEGIN
    SELECT * INTO policy 
    FROM config.retention_policies 
    WHERE tenant_id = p_tenant_id AND data_type = 'vehicle_telemetry';
    
    IF FOUND THEN
        -- Dynamically adjust TimescaleDB policies
        PERFORM remove_retention_policy('telemetry.vehicle_telemetry');
        PERFORM add_retention_policy('telemetry.vehicle_telemetry', 
                                   INTERVAL '1 day' * policy.retention_days);
        
        PERFORM remove_compression_policy('telemetry.vehicle_telemetry');
        PERFORM add_compression_policy('telemetry.vehicle_telemetry', 
                                     INTERVAL '1 day' * policy.compression_days);
    END IF;
END;
$$ LANGUAGE plpgsql;
```

---

## Operations Scheduling and Monitoring

### Intelligent Maintenance Windows
```sql
-- Business load pattern analysis
CREATE MATERIALIZED VIEW analytics.traffic_patterns AS
SELECT 
    EXTRACT(hour FROM time) as hour_of_day,
    EXTRACT(dow FROM time) as day_of_week,
    COUNT(*) as record_count,
    AVG(COUNT(*)) OVER (
        PARTITION BY EXTRACT(hour FROM time)
        ORDER BY EXTRACT(dow FROM time)
        ROWS BETWEEN 2 PRECEDING AND 2 FOLLOWING
    ) as smoothed_avg
FROM telemetry.vehicle_telemetry
WHERE time >= NOW() - INTERVAL '30 days'
GROUP BY hour_of_day, day_of_week;

-- Dynamic maintenance window selection
CREATE OR REPLACE FUNCTION get_optimal_maintenance_window()
RETURNS TABLE (
    recommended_hour INTEGER,
    recommended_dow INTEGER,
    load_factor DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        hour_of_day::INTEGER,
        day_of_week::INTEGER,
        (record_count::DECIMAL / MAX(record_count) OVER ()) as load_factor
    FROM analytics.traffic_patterns
    ORDER BY load_factor
    LIMIT 3;
END;
$$ LANGUAGE plpgsql;
```

### Adaptive Alert Thresholds
```sql
-- Dynamic threshold calculation
CREATE OR REPLACE FUNCTION calculate_adaptive_thresholds()
RETURNS TABLE (
    metric_name TEXT,
    baseline_value DECIMAL,
    warning_threshold DECIMAL,
    critical_threshold DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    WITH recent_metrics AS (
        SELECT 
            'ingestion_rate' as metric,
            AVG(record_count) as avg_value,
            STDDEV(record_count) as stddev_value
        FROM (
            SELECT 
                DATE_TRUNC('minute', time) as minute,
                COUNT(*) as record_count
            FROM telemetry.vehicle_telemetry
            WHERE time >= NOW() - INTERVAL '7 days'
            GROUP BY minute
        ) t
    )
    SELECT 
        metric::TEXT,
        avg_value,
        (avg_value - 2 * stddev_value) as warning_threshold,
        (avg_value - 3 * stddev_value) as critical_threshold
    FROM recent_metrics;
END;
$$ LANGUAGE plpgsql;
```

---

## Performance Testing Recommendations

### Write Performance Benchmark Testing
```bash
#!/bin/bash
# Telemetry data stress testing script

# Test parameters
CONCURRENT_CONNECTIONS=50
RECORDS_PER_BATCH=1000
TEST_DURATION=300  # 5 minutes

# Create test data
cat > test_telemetry_batch.json << EOF
[
  {
    "time": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)",
    "license_plate": "TEST-$(shuf -i 1000-9999 -n 1)",
    "longitude": $(echo "scale=7; 121.5 + ($(shuf -i 0-1000 -n 1) / 10000)" | bc),
    "latitude": $(echo "scale=7; 25.0 + ($(shuf -i 0-1000 -n 1) / 10000)" | bc),
    "speed": $(shuf -i 0-120 -n 1),
    "gps_speed": $(shuf -i 0-120 -n 1),
    "raw_data": {
      "io": {
        "ignition": $([ $((RANDOM % 2)) -eq 0 ] && echo "true" || echo "false")
      }
    }
  }
]
EOF

# Execute stress test
for i in $(seq 1 $CONCURRENT_CONNECTIONS); do
  {
    for j in $(seq 1 $((TEST_DURATION / 10))); do
      curl -X POST http://localhost:3000/api/telemetry/batch \
           -H "Content-Type: application/json" \
           -d @test_telemetry_batch.json \
           -w "%{time_total}s\n" -s -o /dev/null
      sleep 10
    done
  } &
done

wait
```

### Key Performance Indicator Monitoring
```sql
-- Monitoring queries during stress testing
SELECT 
    'insert_tps' as metric,
    COUNT(*) / 60.0 as value,
    NOW() as timestamp
FROM telemetry.vehicle_telemetry 
WHERE created_at >= NOW() - INTERVAL '1 minute'

UNION ALL

SELECT 
    'wal_size_mb' as metric,
    pg_wal_lsn_diff(pg_current_wal_lsn(), '0/0') / 1024 / 1024 as value,
    NOW() as timestamp

UNION ALL

SELECT 
    'active_connections' as metric,
    COUNT(*) as value,
    NOW() as timestamp
FROM pg_stat_activity 
WHERE state = 'active';
```

---

## Production Checklist

### Pre-deployment Verification
- [ ] **Index Strategy**: Enable only Phase 1 necessary indexes
- [ ] **CAGG Strategy**: Enable only hourly aggregation
- [ ] **Primary Key Order**: Confirm (license_plate, time) configuration
- [ ] **Batch Size**: Set ≤ 500 records/batch
- [ ] **Retention Policy**: Configure per customer compliance requirements
- [ ] **Connection Pool**: Set appropriate max_connections
- [ ] **Alert Thresholds**: Set based on benchmark test data

### Operations Monitoring Points
- [ ] **Write Latency**: P95 < 100ms
- [ ] **Query Response**: Recent data queries < 50ms  
- [ ] **Compression Ratio**: > 70% after 7 days
- [ ] **Background Job Health**: No accumulated delays
- [ ] **Disk Space**: Maintain > 20% available space
- [ ] **WAL Growth Rate**: Stable in reasonable range

These optimization strategies will ensure the stability and performance of the VDRS system in production environments!
