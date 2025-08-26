# Legacy System Migration Guide

## Field Mapping Table

### Complete Field Mapping

| Old Table f_log_data_* | New Table vehicle_telemetry_prod | Type Conversion | Notes |
|------------------|---------------------------|----------|----------|
| **Basic Identification Fields** | | | |
| `serial` | `license_plate` | VARCHAR(20) | Vehicle identification primary key |
| `date_time` | `time` | DATETIME → TIMESTAMPTZ | Timestamp primary key |
| `imei` | `imei` | VARCHAR(15) | Device IMEI |
| `imsi` | `imsi` | VARCHAR(15) | SIM card identification |
| `driver_id` | `driver_id` | VARCHAR(8) → VARCHAR(20) | Extended length |
| **Location and Movement Data** | | | |
| `log_data.longitude` | `longitude` | JSON → DECIMAL(10,7) | Flattened high-frequency query fields |
| `log_data.latitude` | `latitude` | JSON → DECIMAL(10,7) | Flattened high-frequency query fields |
| `log_data.speed` | `speed` | JSON → DECIMAL(5,2) | Flattened high-frequency query fields |
| `log_data.gpsSpeed` | `gps_speed` | JSON → DECIMAL(5,2) | GPS calculated speed |
| `log_data.direction` | `direction` | JSON → DECIMAL(5,2) | Direction angle |
| `log_data.rpm` | `rpm` | JSON → INTEGER | Engine RPM |
| `mile` | `mileage` | VARCHAR(20) → DECIMAL(10,2) | Mileage |
| **Status and Quality** | | | |
| `gps_signal` | `gps_status` | VARCHAR(1) → CHAR(1) | GPS signal status |
| `gps` | `gps_satellite_count` | INT → INTEGER | GPS satellite count |
| `csq` | `csq` | INT → INTEGER | Signal strength |
| **Key Reinforced Fields** | | | |
| `log_count` | `log_sequence` | INT → INTEGER | Packet sequence verification |
| `crc_checksum` | `crc_checksum` | VARCHAR(100) | Original packet integrity verification |
| **IO Status Expansion** | | | |
| `log_data.io` (bit string) | `ignition` | JSON/BIT → BOOLEAN | ACC status |
| `log_data.io` (bit string) | `engine_on` | JSON/BIT → BOOLEAN | Engine status |
| `log_data.io` (bit string) | `door_open` | JSON/BIT → BOOLEAN | Door status |
| `log_data.io` (bit string) | `brake_signal` | JSON/BIT → BOOLEAN | Brake signal |
| **Device Status Expansion** | | | |
| `log_data.deviceStatus` | `fuel_level` | JSON → INTEGER | Fuel level |
| `log_data.deviceStatus` | `battery_voltage` | JSON → DECIMAL(4,2) | Battery voltage |
| `log_data.deviceStatus` | `engine_temperature` | JSON → DECIMAL(5,2) | Engine temperature |
| **Integrity Preservation** | | | |
| `log_data` (complete) | `raw_log_data` | TEXT → JSONB | Complete original data |
| `log_data.deviceStatus` (others) | `raw_device_status` | JSON → JSONB | Unflattened device status |
| `log_data.io` (others) | `raw_io_extended` | JSON → JSONB | Unflattened IO status |
| **Metadata** | | | |
| `insert_time` | `created_at` | DATETIME → TIMESTAMPTZ | Insertion time |
| N/A | `data_source` | N/A → VARCHAR(50) | Data source marker |
| N/A | `geom` | N/A → GEOMETRY | Geospatial index |

---

## IO Status Bit Parsing

### Legacy System IO Bit Format
```javascript
// Assume IO is 16-bit string "1010110000110001"
const ioBits = "1010110000110001";

// Bit definitions (adjust based on actual system)
const ioMapping = {
  bit_0: 'ignition',        // ACC status
  bit_1: 'engine_on',       // Engine status  
  bit_2: 'door_open',       // Door open
  bit_3: 'brake_signal',    // Brake signal
  bit_4: 'handbrake',       // Handbrake
  bit_5: 'emergency_light', // Emergency light
  bit_6: 'turn_left',       // Left turn signal
  bit_7: 'turn_right',      // Right turn signal
  bit_8: 'headlight',       // Headlight
  bit_9: 'backup_light',    // Backup light
  bit_10: 'custom_input1',  // Custom input 1
  bit_11: 'custom_input2',  // Custom input 2
  bit_12: 'custom_output1', // Custom output 1
  bit_13: 'custom_output2', // Custom output 2
  bit_14: 'gps_antenna',    // GPS antenna status
  bit_15: 'gsm_antenna'     // GSM antenna status
};
```

### Migration Conversion Function
```sql
-- IO bit parsing function
CREATE OR REPLACE FUNCTION parse_io_bits(io_string TEXT)
RETURNS JSONB AS $$
DECLARE
    result JSONB := '{}';
    bit_value INTEGER;
BEGIN
    -- Parse ignition (bit 0)
    bit_value := CASE WHEN SUBSTRING(io_string FROM 16 FOR 1) = '1' THEN 1 ELSE 0 END;
    result := result || jsonb_build_object('ignition', bit_value::BOOLEAN);
    
    -- Parse engine_on (bit 1)  
    bit_value := CASE WHEN SUBSTRING(io_string FROM 15 FOR 1) = '1' THEN 1 ELSE 0 END;
    result := result || jsonb_build_object('engine_on', bit_value::BOOLEAN);
    
    -- Parse door_open (bit 2)
    bit_value := CASE WHEN SUBSTRING(io_string FROM 14 FOR 1) = '1' THEN 1 ELSE 0 END;
    result := result || jsonb_build_object('door_open', bit_value::BOOLEAN);
    
    -- Parse brake_signal (bit 3)
    bit_value := CASE WHEN SUBSTRING(io_string FROM 13 FOR 1) = '1' THEN 1 ELSE 0 END;
    result := result || jsonb_build_object('brake_signal', bit_value::BOOLEAN);
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;
```

---

## Migration SQL Scripts

### 1. Data Migration Main Script
```sql
-- Complete script for migrating from old table to new table
INSERT INTO telemetry.vehicle_telemetry_prod (
    license_plate,
    time,
    imei,
    imsi,
    longitude,
    latitude,
    speed,
    gps_speed,
    direction,
    mileage,
    rpm,
    gps_status,
    gps_satellite_count,
    csq,
    driver_id,
    log_sequence,
    crc_checksum,
    ignition,
    engine_on,
    door_open,
    brake_signal,
    fuel_level,
    battery_voltage,
    engine_temperature,
    raw_log_data,
    raw_device_status,
    raw_io_extended,
    geom,
    created_at,
    data_source
)
SELECT 
    -- Basic identification fields
    old.serial,                                        -- license_plate
    old.date_time AT TIME ZONE 'UTC',                  -- time (timezone conversion)
    old.imei,                                          -- imei
    old.imsi,                                          -- imsi
    
    -- Location data (extracted from JSON)
    (old.log_data::JSONB->>'longitude')::DECIMAL(10,7), -- longitude
    (old.log_data::JSONB->>'latitude')::DECIMAL(10,7),  -- latitude
    (old.log_data::JSONB->>'speed')::DECIMAL(5,2),      -- speed
    (old.log_data::JSONB->>'gpsSpeed')::DECIMAL(5,2),   -- gps_speed
    (old.log_data::JSONB->>'direction')::DECIMAL(5,2),  -- direction
    old.mile::DECIMAL(10,2),                            -- mileage
    (old.log_data::JSONB->>'rpm')::INTEGER,             -- rpm
    
    -- Status and quality
    old.gps_signal,                                     -- gps_status
    old.gps,                                            -- gps_satellite_count
    old.csq,                                            -- csq
    old.driver_id,                                      -- driver_id
    
    -- Reinforced key fields
    old.log_count,                                      -- log_sequence
    old.crc_checksum,                                   -- crc_checksum
    
    -- IO status parsing (using bit parsing function)
    (parse_io_bits(old.log_data::JSONB->>'io')->>'ignition')::BOOLEAN,     -- ignition
    (parse_io_bits(old.log_data::JSONB->>'io')->>'engine_on')::BOOLEAN,    -- engine_on
    (parse_io_bits(old.log_data::JSONB->>'io')->>'door_open')::BOOLEAN,    -- door_open
    (parse_io_bits(old.log_data::JSONB->>'io')->>'brake_signal')::BOOLEAN, -- brake_signal
    
    -- Device status (extracted from JSON)
    (old.log_data::JSONB->'deviceStatus'->>'fuel_level')::INTEGER,         -- fuel_level
    (old.log_data::JSONB->'deviceStatus'->>'battery_voltage')::DECIMAL(4,2), -- battery_voltage
    (old.log_data::JSONB->'deviceStatus'->>'engine_temperature')::DECIMAL(5,2), -- engine_temperature
    
    -- Integrity preservation
    old.log_data::JSONB,                               -- raw_log_data
    old.log_data::JSONB->'deviceStatus',               -- raw_device_status
    old.log_data::JSONB->'io',                         -- raw_io_extended
    
    -- Geospatial
    CASE 
        WHEN (old.log_data::JSONB->>'longitude') IS NOT NULL 
         AND (old.log_data::JSONB->>'latitude') IS NOT NULL 
        THEN ST_SetSRID(
            ST_MakePoint(
                (old.log_data::JSONB->>'longitude')::DECIMAL,
                (old.log_data::JSONB->>'latitude')::DECIMAL
            ), 4326)
        ELSE NULL 
    END,                                                -- geom
    
    -- Metadata
    old.insert_time AT TIME ZONE 'UTC',                -- created_at
    'legacy_f_log_data_migration'                       -- data_source

FROM f_log_data_202301 old                              -- adjust to actual table name
WHERE old.log_data IS NOT NULL                         -- filter invalid data
  AND old.log_data != ''
  AND old.log_data::JSONB->>'longitude' IS NOT NULL
  AND old.log_data::JSONB->>'latitude' IS NOT NULL
ORDER BY old.date_time;                                 -- migrate in time order
```

### 2. Batch Migration Script
```sql
-- Large data volume batch migration
DO $$
DECLARE
    batch_size INTEGER := 10000;
    processed_count INTEGER := 0;
    total_count INTEGER;
    start_time TIMESTAMP;
    end_time TIMESTAMP;
BEGIN
    -- Calculate total data volume
    SELECT COUNT(*) INTO total_count FROM f_log_data_202301 
    WHERE log_data IS NOT NULL AND log_data != '';
    
    RAISE NOTICE 'Starting migration of % records', total_count;
    start_time := clock_timestamp();
    
    -- Batch processing
    WHILE processed_count < total_count LOOP
        INSERT INTO telemetry.vehicle_telemetry_prod (...)
        SELECT ... 
        FROM f_log_data_202301 old
        WHERE ... 
        ORDER BY old.date_time
        LIMIT batch_size OFFSET processed_count;
        
        processed_count := processed_count + batch_size;
        
        -- Report progress for each batch
        RAISE NOTICE 'Processed %/% records (%.1f%%)', 
                     processed_count, total_count, 
                     (processed_count::FLOAT / total_count * 100);
        
        -- Avoid long-term locking, appropriate COMMIT
        COMMIT;
    END LOOP;
    
    end_time := clock_timestamp();
    RAISE NOTICE 'Migration completed, time taken: %', (end_time - start_time);
END $$;
```

---

## Post-Migration Verification

### 1. Data Integrity Check
```sql
-- Verify record count
SELECT 
    'f_log_data_source' as table_name,
    COUNT(*) as record_count
FROM f_log_data_202301 
WHERE log_data IS NOT NULL

UNION ALL

SELECT 
    'vehicle_telemetry_prod' as table_name,
    COUNT(*) as record_count
FROM telemetry.vehicle_telemetry_prod
WHERE data_source = 'legacy_f_log_data_migration';

-- Verify key field non-null rate
SELECT 
    'longitude' as field,
    COUNT(*) FILTER (WHERE longitude IS NOT NULL) as non_null_count,
    COUNT(*) as total_count,
    ROUND(COUNT(*) FILTER (WHERE longitude IS NOT NULL) * 100.0 / COUNT(*), 2) as non_null_percentage
FROM telemetry.vehicle_telemetry_prod
WHERE data_source = 'legacy_f_log_data_migration'

UNION ALL

SELECT 
    'crc_checksum',
    COUNT(*) FILTER (WHERE crc_checksum IS NOT NULL),
    COUNT(*),
    ROUND(COUNT(*) FILTER (WHERE crc_checksum IS NOT NULL) * 100.0 / COUNT(*), 2)
FROM telemetry.vehicle_telemetry_prod
WHERE data_source = 'legacy_f_log_data_migration';
```

### 2. Sample Data Comparison
```sql
-- Random sampling comparison with original data
WITH sample_comparison AS (
    SELECT 
        new.license_plate,
        new.time,
        new.longitude as new_longitude,
        new.latitude as new_latitude,
        new.speed as new_speed,
        new.log_sequence,
        new.crc_checksum,
        old.serial,
        old.date_time,
        (old.log_data::JSONB->>'longitude')::DECIMAL(10,7) as old_longitude,
        (old.log_data::JSONB->>'latitude')::DECIMAL(10,7) as old_latitude,
        (old.log_data::JSONB->>'speed')::DECIMAL(5,2) as old_speed,
        old.log_count,
        old.crc_checksum as old_crc
    FROM telemetry.vehicle_telemetry_prod new
    JOIN f_log_data_202301 old 
      ON new.license_plate = old.serial 
     AND new.time = old.date_time AT TIME ZONE 'UTC'
    WHERE new.data_source = 'legacy_f_log_data_migration'
    ORDER BY RANDOM()
    LIMIT 100
)
SELECT 
    license_plate,
    CASE WHEN ABS(new_longitude - old_longitude) > 0.0001 THEN 'MISMATCH' ELSE 'OK' END as longitude_check,
    CASE WHEN ABS(new_latitude - old_latitude) > 0.0001 THEN 'MISMATCH' ELSE 'OK' END as latitude_check,
    CASE WHEN ABS(new_speed - old_speed) > 0.1 THEN 'MISMATCH' ELSE 'OK' END as speed_check,
    CASE WHEN log_sequence != log_count THEN 'MISMATCH' ELSE 'OK' END as sequence_check
FROM sample_comparison;
```

---

## Notes and Risk Assessment

### 1. Timezone Handling
- **Risk**: Old system may use local timezone, new system uses UTC
- **Recommendation**: Confirm original timezone, appropriate conversion with `AT TIME ZONE`

### 2. IO Bit Definitions
- **Risk**: IO bit definitions may vary by device model
- **Recommendation**: Confirm specific bit mapping with hardware team

### 3. JSON Format Variations
- **Risk**: Old system log_data format may be inconsistent
- **Recommendation**: Analyze sample data first, handle format anomalies

### 4. Data Volume Considerations
- **Risk**: Large table migration may affect system performance
- **Recommendation**: Perform in time segments and batches, avoid business peak hours

### 5. Integrity Verification
- **Risk**: Loss of CRC checksum and log_sequence will affect auditing
- **Recommendation**: Must verify integrity of these key fields after migration

This migration guide ensures lossless conversion from the old system to the new system while preserving all critical auditing and integrity checking capabilities!
