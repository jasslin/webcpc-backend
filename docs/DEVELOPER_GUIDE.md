# VDRS Telemetry System - Developer Guide

## Overview

The VDRS Telemetry System is a high-performance vehicle telemetry data collection and analytics platform built with Node.js, TypeScript, Express, and TimescaleDB. This guide provides comprehensive information for developers to understand, develop, and maintain the system.

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Development Environment Setup](#development-environment-setup)
3. [Database Schema](#database-schema)
4. [API Endpoints](#api-endpoints)
5. [Data Models](#data-models)
6. [Development Workflow](#development-workflow)
7. [Testing](#testing)
8. [Performance Optimization](#performance-optimization)
9. [Troubleshooting](#troubleshooting)

## System Architecture

### Technology Stack
- **Backend**: Node.js + TypeScript + Express
- **Database**: PostgreSQL + TimescaleDB + PostGIS
- **Development**: Docker + Docker Compose
- **Code Quality**: ESLint + Prettier + Jest
- **CI/CD**: GitHub Actions + SonarCloud

### System Components
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client Apps   │    │   API Gateway   │    │  Telemetry DB   │
│                 │◄──►│                 │◄──►│                 │
│ - Web Dashboard │    │ - Express API   │    │ - TimescaleDB   │
│ - Mobile Apps  │    │ - TypeScript    │    │ - PostGIS       │
│ - IoT Devices  │    │ - Validation    │    │ - Hypertables   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Development Environment Setup

### Prerequisites
- Docker and Docker Compose
- Node.js 18+
- Git
- VS Code (recommended)

### Quick Start
```bash
# Clone repository
git clone <repository-url>
cd webcpc-backend

# Copy environment file
cp .env.example .env

# Start development environment
docker-compose up -d

# Install dependencies
docker-compose exec app npm install

# Run database migrations
docker-compose exec app npm run db:migrate up

# Start development server
docker-compose exec app npm run dev
```

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

## Database Schema

### Core Tables

#### `telemetry.vehicle_telemetry`
Main table for vehicle telemetry data with TimescaleDB hypertable optimization.

**Key Fields:**
- `license_plate` + `time` (Primary Key)
- `geom`, `geog` (PostGIS geometry)
- `speed`, `rpm`, `direction` (Vehicle metrics)
- `raw_data` (JSONB for flexible data)

**Indexes:**
- `idx_vehicle_telemetry_license_time` (license_plate, time DESC)
- `idx_vehicle_telemetry_geom` (GIST for spatial queries)
- `idx_vehicle_telemetry_time_brin` (BRIN for time range queries)

#### `telemetry.vehicle_anomalies`
Stores vehicle anomaly events and driver attribution.

**Key Fields:**
- `license_plate` + `time` + `anomaly_id` (Primary Key)
- `anomaly_type`, `severity`, `status`
- `driver_attribution_method`, `driver_confidence_score`

#### `config.retention_policies`
Configurable data retention policies for compliance.

**Key Fields:**
- `tenant_id` + `data_type` (Primary Key)
- `retention_days`, `compression_days`
- `regulatory_requirement`

### Analytics Views

#### `analytics.v_daily_vehicle_summary`
Daily aggregated statistics per vehicle.

#### `analytics.v_daily_driver_summary`
Daily aggregated statistics per driver.

#### `analytics.v_vehicle_track_summary`
Hourly vehicle track summaries with spatial analysis.

#### `analytics.v_performance_metrics`
System performance monitoring metrics.

#### `analytics.v_anomaly_summary`
Daily anomaly event statistics.

#### `analytics.v_device_health_summary`
Device health monitoring summary.

## API Endpoints

### Base URL
```
http://localhost:3000/api
```

### Telemetry Endpoints

#### POST `/api/telemetry/batch`
Bulk insert telemetry data.

**Request Body:**
```json
[
  {
    "time": "2024-01-15T10:30:00Z",
    "license_plate": "ABC-1234",
    "longitude": 121.5654,
    "latitude": 25.0330,
    "speed": 45.2,
    "driver_id": "DRIVER001",
    "raw_data": {
      "io": {
        "ignition": true,
        "engine_on": true
      },
      "deviceStatus": {
        "battery_voltage": 12.6
      }
    }
  }
]
```

#### GET `/api/telemetry/vehicle/:id/track`
Get vehicle track data.

**Query Parameters:**
- `start_time`: ISO timestamp
- `end_time`: ISO timestamp
- `limit`: Number of records (default: 100)

#### GET `/api/telemetry/nearby`
Find vehicles near a location.

**Query Parameters:**
- `longitude`: Longitude coordinate
- `latitude`: Latitude coordinate
- `radius_meters`: Search radius (default: 1000)

#### GET `/api/telemetry/realtime-summary`
Get real-time system summary.

### Analytics Endpoints

#### GET `/api/analytics/daily-vehicle-summary`
Get daily vehicle summary statistics.

#### GET `/api/analytics/daily-driver-summary`
Get daily driver summary statistics.

#### GET `/api/analytics/performance/metrics`
Get system performance metrics.

#### GET `/api/analytics/performance/alerts`
Get performance alerts.

## Data Models

### TypeScript Interfaces

#### `VehicleTelemetry`
```typescript
interface VehicleTelemetry {
  license_plate: string;
  time: Date;
  imei?: string;
  imsi?: string;
  longitude?: number;
  latitude?: number;
  altitude?: number;
  speed?: number;
  gps_speed?: number;
  direction?: number;
  mileage?: number;
  rpm?: number;
  gps_status?: string;
  gps_satellite_count?: number;
  is_moving?: boolean;
  is_speeding?: boolean;
  csq?: number;
  driver_id?: string;
  log_sequence?: number;
  crc_checksum?: string;
  ignition?: boolean;
  engine_on?: boolean;
  door_open?: boolean;
  brake_signal?: boolean;
  fuel_level?: number;
  battery_voltage?: number;
  engine_temperature?: number;
  raw_data?: Record<string, unknown>;
  raw_log_data?: Record<string, unknown>;
  raw_device_status?: Record<string, unknown>;
  raw_io_extended?: Record<string, unknown>;
  geom?: any; // PostGIS Point
  geog?: any; // PostGIS Geography
  created_at?: Date;
  data_source?: string;
}
```

#### `VehicleAnomaly`
```typescript
interface VehicleAnomaly {
  license_plate: string;
  time: Date;
  anomaly_id: number;
  longitude?: number;
  latitude?: number;
  anomaly_type: string;
  severity?: string;
  description?: string;
  status?: string;
  driver_id?: string;
  driver_attribution_method?: string;
  driver_confidence_score?: number;
  attribution_details?: Record<string, unknown>;
  is_critical?: boolean;
  is_resolved?: boolean;
  created_at?: Date;
  resolved_at?: Date;
}
```

## Development Workflow

### 1. Feature Development
```bash
# Create feature branch
git checkout -b feature/new-telemetry-endpoint

# Make changes
# ... edit files ...

# Run tests
npm test

# Check code quality
npm run lint
npm run format:check

# Commit changes
git add .
git commit -m "feat: add new telemetry endpoint"

# Push and create PR
git push origin feature/new-telemetry-endpoint
```

### 2. Database Changes
```bash
# Create migration
npm run db:migrate:create -- add_new_table

# Edit migration file
# ... add table creation logic ...

# Run migration
npm run db:migrate up

# Test migration
npm run db:migrate down
npm run db:migrate up
```

### 3. API Development
```typescript
// 1. Define interface in src/types/
interface NewTelemetryData {
  // ... interface definition
}

// 2. Add service method in src/modules/telemetry/telemetry.service.ts
async createNewTelemetry(data: NewTelemetryData): Promise<void> {
  // ... implementation
}

// 3. Add controller method in src/modules/telemetry/telemetry.controller.ts
async createNewTelemetry(req: Request, res: Response): Promise<void> {
  // ... implementation
}

// 4. Add route in src/modules/telemetry/telemetry.router.ts
router.post('/new', telemetryController.createNewTelemetry);
```

## Testing

### Running Tests
```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- telemetry.test.ts

# Watch mode
npm test -- --watch
```

### Test Structure
```
src/
├── __tests__/
│   ├── unit/
│   │   ├── telemetry.service.test.ts
│   │   └── telemetry.controller.test.ts
│   ├── integration/
│   │   └── telemetry.api.test.ts
│   └── fixtures/
│       └── telemetry-data.ts
```

### Writing Tests
```typescript
import { TelemetryService } from '../telemetry.service';

describe('TelemetryService', () => {
  let service: TelemetryService;

  beforeEach(() => {
    service = new TelemetryService();
  });

  describe('createTelemetry', () => {
    it('should create telemetry record successfully', async () => {
      const data = {
        license_plate: 'TEST-001',
        time: new Date(),
        speed: 50
      };

      const result = await service.createTelemetry(data);
      expect(result).toBeDefined();
      expect(result.license_plate).toBe(data.license_plate);
    });
  });
});
```

## Performance Optimization

### Database Optimization
1. **Use TimescaleDB Hypertables**: Automatic time-based partitioning
2. **Leverage BRIN Indexes**: For time-range queries on large datasets
3. **Utilize GIST Indexes**: For spatial queries
4. **Implement Compression**: Automatic data compression after 7 days

### Query Optimization
```sql
-- Use time ranges for better performance
SELECT * FROM telemetry.vehicle_telemetry 
WHERE time >= NOW() - INTERVAL '24 hours'
AND license_plate = 'ABC-1234';

-- Use spatial functions efficiently
SELECT * FROM telemetry.vehicle_telemetry 
WHERE ST_DWithin(geom, ST_Point(121.5654, 25.0330), 1000)
AND time >= NOW() - INTERVAL '1 hour';
```

### API Optimization
1. **Implement Pagination**: For large result sets
2. **Use Caching**: Redis for frequently accessed data
3. **Batch Operations**: For bulk data operations
4. **Async Processing**: For non-critical operations

## Troubleshooting

### Common Issues

#### Database Connection Issues
```bash
# Check database status
docker-compose ps db

# Check database logs
docker-compose logs db

# Test connection
docker-compose exec app npm run db:migrate up
```

#### Migration Issues
```bash
# Check migration status
docker-compose exec db psql -U user -d mydatabase -c "SELECT * FROM pgmigrations;"

# Reset migrations (CAUTION: This will drop all data)
docker-compose exec db psql -U user -d mydatabase -c "DELETE FROM pgmigrations;"
```

#### Performance Issues
```sql
-- Check slow queries
SELECT query, mean_exec_time, calls 
FROM pg_stat_statements 
WHERE mean_exec_time > 100 
ORDER BY mean_exec_time DESC;

-- Check table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname IN ('telemetry', 'config', 'analytics')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Debug Mode
```bash
# Enable debug logging
NODE_ENV=development DEBUG=* npm run dev

# Check API logs
docker-compose logs app -f
```

## Best Practices

### Code Quality
1. **Follow TypeScript Best Practices**: Use strict mode, proper typing
2. **Implement Error Handling**: Use try-catch blocks, proper error responses
3. **Write Documentation**: JSDoc comments for all public methods
4. **Follow Naming Conventions**: camelCase for variables, PascalCase for classes

### Database
1. **Use Transactions**: For multi-table operations
2. **Implement Proper Indexing**: Based on query patterns
3. **Monitor Query Performance**: Use EXPLAIN ANALYZE
4. **Regular Maintenance**: VACUUM, ANALYZE, REINDEX

### Security
1. **Input Validation**: Validate all user inputs
2. **SQL Injection Prevention**: Use parameterized queries
3. **Authentication**: Implement proper authentication middleware
4. **Rate Limiting**: Prevent API abuse

## Resources

### Documentation
- [TimescaleDB Documentation](https://docs.timescale.com/)
- [PostGIS Documentation](https://postgis.net/documentation/)
- [Express.js Documentation](https://expressjs.com/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)

### Tools
- [Adminer](http://localhost:8080) - Database management
- [PostgreSQL](http://localhost:5433) - Direct database access
- [API Testing](http://localhost:3000/api/health) - Health check endpoint

### Support
- Check existing issues in the repository
- Create new issues with detailed descriptions
- Follow the contribution guidelines in CONTRIBUTING.md

---

**Note**: This guide is a living document. Please update it as the system evolves and new features are added.
