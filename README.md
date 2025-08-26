# VDRS Telemetry Backend

A high-performance vehicle telemetry data collection and analytics system built with Node.js, TypeScript, Express, and TimescaleDB.

## Features

- **High-Performance Data Ingestion**: 10,000+ records/second with optimized bulk insert
- **Time-Series Storage**: TimescaleDB with 80%+ compression for efficient storage
- **Geospatial Analytics**: PostGIS integration for location-based queries
- **Real-Time Analytics**: Continuous aggregation for dashboard performance
- **Performance Monitoring**: Built-in metrics and alerting system
- **Type-Safe**: Full TypeScript implementation with comprehensive type definitions

## Architecture

This system implements the **VDRS Telemetry Optimized Architecture** with:

- **TimescaleDB Hypertables**: Automatic time-based partitioning
- **Continuous Aggregates**: Pre-computed summaries for fast analytics
- **Geospatial Indexing**: GIST indexes for location-based queries
- **Compression Policies**: Automatic data compression after 7 days
- **Retention Policies**: Configurable data lifecycle management

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development)

### Using Docker Compose (Recommended)

1. **Clone and setup**:
   ```bash
   git clone <repository>
   cd webcpc-backend
   cp .env.example .env
   ```

2. **Start all services**:
   ```bash
   docker-compose up -d
   ```

3. **Run database migrations**:
   ```bash
   docker-compose exec app npm run db:migrate up
   ```

4. **Access services**:
   - API: http://localhost:3000
   - Database Admin: http://localhost:8080
   - PostgreSQL: localhost:5432

### Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Setup database** (ensure PostgreSQL with TimescaleDB is running):
   ```bash
   npm run db:migrate up
   ```

3. **Start development server**:
   ```bash
   npm run dev
   ```

## API Documentation

### Telemetry Data Ingestion

#### Bulk Insert Telemetry Data
```http
POST /api/telemetry/batch
Content-Type: application/json

[
  {
    "time": "2024-01-15T10:30:00Z",
    "license_plate": "ABC-1234",
    "longitude": 121.5654,
    "latitude": 25.0330,
    "speed": 45.2,
    "gps_speed": 44.8,
    "driver_id": "DRIVER001",
    "raw_data": {
      "io": {
        "ignition": true,
        "engine_on": true,
        "accelerator": 35
      },
      "deviceStatus": {
        "battery_voltage": 12.6,
        "temperature": 28.5
      }
    }
  }
]
```

### Vehicle Tracking

#### Get Vehicle Track
```http
GET /api/telemetry/vehicle/ABC-1234/track?startTime=2024-01-15T00:00:00Z&endTime=2024-01-15T23:59:59Z&limit=1000
```

#### Find Nearby Vehicles
```http
GET /api/telemetry/nearby?longitude=121.5654&latitude=25.0330&radius=1000&timeWindow=15
```

### Real-Time Data

#### Get Real-Time Vehicle Summary
```http
GET /api/telemetry/realtime-summary
```

### Analytics

#### Vehicle Daily Summary
```http
GET /api/telemetry/analytics/vehicle-daily?startDate=2024-01-01&endDate=2024-01-31&licensePlate=ABC-1234
```

#### Driver Performance Analysis
```http
GET /api/telemetry/analytics/driver-daily?startDate=2024-01-01&endDate=2024-01-31&driverId=DRIVER001
```

### Performance Monitoring

#### Get Performance Metrics
```http
GET /api/telemetry/performance/metrics
```

#### Check Performance Alerts
```http
GET /api/telemetry/performance/alerts
```

## Database Schema

### Core Tables

- **`telemetry.vehicle_telemetry`**: Main telemetry data (TimescaleDB hypertable)
- **`telemetry.vehicle_anomalies`**: Anomaly detection results
- **`telemetry.device_status`**: Device health monitoring

### Analytics Views

- **`analytics.mv_vehicle_realtime_summary`**: Real-time vehicle status
- **`analytics.cagg_vehicle_daily_summary`**: Daily vehicle statistics
- **`analytics.cagg_driver_daily_summary`**: Driver performance metrics
- **`analytics.cagg_anomaly_daily_summary`**: Anomaly trends

### Key Functions

- **`bulk_insert_telemetry(jsonb)`**: High-performance bulk insert
- **`get_vehicle_track_by_license_plate(...)`**: Vehicle track retrieval
- **`get_nearby_vehicles(...)`**: Geospatial proximity search
- **`check_telemetry_performance()`**: Performance monitoring

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Data Ingestion | 10,000+ records/sec | Bulk insert with batching |
| Query Response | <100ms | Recent data queries |
| Storage Efficiency | 80%+ compression | TimescaleDB compression |
| Availability | 99.9% uptime | Health monitoring |

## Configuration

### Environment Variables

```bash
# Application
PORT=3000
NODE_ENV=development

# Database
POSTGRES_USER=user
POSTGRES_PASSWORD=password
POSTGRES_DB=mydatabase
DATABASE_URL=postgres://user:password@db:5432/mydatabase
```

### TimescaleDB Configuration

- **Chunk Interval**: 1 day for optimal performance
- **Compression**: Automatic after 7 days (80%+ space savings)
- **Retention**: 2 years for telemetry, 5 years for anomalies
- **Indexes**: Optimized for time-series and geospatial queries

## Testing

### Run Tests
```bash
npm test                # Unit tests
npm run test:coverage   # With coverage report
```

### Sample Data
Use the provided sample data for testing:
```typescript
import { sampleTelemetryData } from './src/examples/sample-telemetry-data';
```

## Monitoring

### Health Check
```http
GET /health
```

### Performance Metrics
Monitor key metrics through the `/api/telemetry/performance/*` endpoints:
- Ingestion rate
- Storage usage
- Compression ratio
- Query performance

### Alerts
Automatic alerting for:
- Low ingestion rates
- High GPS error rates
- Poor device connectivity
- Storage issues

## Production Deployment

### Production Environment Risk Assessment and Optimization Strategy

Based on actual deployment experience, here are key production optimization recommendations:

#### Progressive Indexing Strategy
```bash
# Phase 1: Enable only necessary indexes (avoid maintenance cost and write slowdown)
- (license_plate, time DESC) - Core query index
- GIST (geom) - Geospatial query (only geom, avoid double calculation cost)
- BRIN (time) - Time range query (low maintenance cost)
- (gps_status, time) WHERE gps_status='A' - Status filtering

# Phase 2: Add based on actual query hit rate
- Speed filtering query (hit rate > 10%)
- Driver performance query (hit rate > 5%)  
- Geospatial distance query (large radius query > 3%)
```

#### CAGG Deployment Strategy
```bash
# Start with hourly level, observe refresh cost
- Initial: Only hourly vehicle summary
- Observe: Background workers pressure
- Expansion criteria: CPU < 70%, job delay < 5 minutes

# Avoid background workers pressure
- Conservative refresh interval: 30 minutes
- Limit initial data volume: 7-day window
```

#### Field Design Trade-offs
```typescript
// geom + geog coexistence increases write calculation cost
// Recommendation: Keep only geom initially, cast when geographic distance needed
geom: GEOMETRY(POINT, 4326)  // Recommended
// geog: GEOGRAPHY(POINT, 4326)  // Temporarily omitted

// raw_data JSONB can grow large
// Put high-variance/rarely-queried fields in JSONB, flatten frequently-queried fields
ignition: BOOLEAN           // Frequently queried fields flattened
engine_on: BOOLEAN          // Frequently queried fields flattened  
fuel_level: INTEGER         // Frequently queried fields flattened
raw_data_summary: JSONB     // Cold data preserved in JSONB
```

#### Primary Key Optimization
```sql
-- Original design: (time, license_plate) - High concurrency upsert creates hotspots
-- Recommendation: (license_plate, time) - Matches query pattern, distributes hotspots
PRIMARY KEY (license_plate, time)  -- Production recommended

-- Batch write strategy optimization
- Batch size: ≤ 500 records/batch (reduce conflict rate)
- Connection pool control: Avoid WAL output pressure
- Conflict handling: Optimize UPSERT strategy
```

#### Compliance Retention Strategy
```sql
-- Compression/retention strategy must align with business compliance
default:    7-day compression, 2-year retention   -- Standard customers
enterprise: 30-day compression, 7-year retention  -- Enterprise customers  
government: 90-day compression, 10-year retention -- Government projects

-- Make configurable per tenant
CREATE TABLE config.retention_policies (
    tenant_id VARCHAR(50),
    retention_days INTEGER,
    compression_days INTEGER,
    regulatory_requirement TEXT
);
```

#### Operations Scheduling Optimization
```bash
# Routine maintenance must control time windows, avoid peak periods
- Intelligent window selection: Based on business load pattern analysis
- Adaptive alert thresholds: Dynamically adjust based on historical data
- Performance monitoring: Index usage rate, compression ratio, Background job health

# Alert thresholds aligned with actual SLO
- Ingestion rate: Configure based on actual vehicle count/frequency
- Response time: P95 < 100ms (Recent data queries)
- Success rate: > 95%
- WAL growth rate: Monitor and maintain reasonable range
```

### Production Checklist

#### Pre-deployment Verification
- [ ] **Index Strategy**: Enable only Phase 1 necessary indexes
- [ ] **CAGG Strategy**: Enable only hourly aggregation  
- [ ] **Primary Key Order**: Confirm (license_plate, time) configuration
- [ ] **Batch Size**: Set ≤ 500 records/batch
- [ ] **Retention Policy**: Configure per customer compliance requirements
- [ ] **Connection Pool**: Set appropriate max_connections
- [ ] **Alert Thresholds**: Set based on benchmark test data

#### Operations Monitoring Points  
- [ ] **Write Latency**: P95 < 100ms
- [ ] **Query Response**: Recent data queries < 50ms
- [ ] **Compression Ratio**: > 70% after 7 days
- [ ] **Background Job Health**: No accumulated delays
- [ ] **Disk Space**: Maintain > 20% available space
- [ ] **WAL Growth Rate**: Stable in reasonable range

### Performance Testing

Use provided testing script to validate production configuration:

```bash
# Execute performance testing (based on production recommendation parameters)
./scripts/performance-test.sh 20 500 120

# Parameter explanation:
# 20  - Concurrent connections (based on connection pool recommendation)
# 500 - Records per batch (based on batch size recommendation)  
# 120 - Test duration (seconds)
```

### Legacy System Migration

For key risks in migrating from old `f_log_data_*` tables, we have completed field mapping analysis and reinforcement:

#### Resolved Missing Risks
- **`log_count`** → **`log_sequence`** - Original packet sequence verification
- **`crc_checksum`** → **`crc_checksum`** - Original packet integrity verification  
- **`deviceStatus`** → Split into hot fields + **`raw_device_status`** - Complete device status preservation
- **Complete `log_data`** → **`raw_log_data`** - Ensure audit/comparison integrity

#### Field Strategy
```sql
-- Hot data field flattening (high-frequency queries)
ignition, engine_on, door_open, brake_signal  -- IO status
fuel_level, battery_voltage, engine_temperature -- Device status

-- Cold data JSONB preservation (integrity)  
raw_log_data      -- Complete original log_data
raw_device_status -- Unflattened device status
raw_io_extended   -- Unflattened IO status
```

### Detailed Guides

- **[VDRS Production Environment Optimization Guide](./docs/VDRS_PRODUCTION_OPTIMIZATION_GUIDE.md)** - Complete risk assessment and optimization strategy
- **[VDRS Telemetry Optimized Architecture](./docs/VDRS_TELEMETRY_OPTIMIZED_ARCHITECTURE.md)** - Technical architecture documentation
- **[Legacy System Migration Guide](./docs/LEGACY_MIGRATION_GUIDE.md)** - Complete field mapping and migration scripts
- **[Production Configuration Recommendations](./src/config/production-recommendations.ts)** - TypeScript configuration reference

## Contributing

1. Follow TypeScript best practices
2. Ensure all migrations are reversible
3. Add tests for new functionality
4. Update documentation for API changes
5. Run quality gates: `npm run lint && npm run format:check && npm test`

## License

[License information]

## Support

For issues and questions:
1. Check the API documentation
2. Review performance monitoring endpoints
3. Examine database logs for migration issues
4. Contact the development team

---

**Built for high-performance vehicle telemetry analytics**
