# External Team Onboarding Guide

## Overview

This guide is specifically designed for external development teams, contractors, and new developers joining the VDRS Telemetry System project. It provides a structured path from zero to productive development.

## Prerequisites Checklist

### Required Software
- [ ] **Docker Desktop** (latest version)
- [ ] **Node.js** 18+ with npm
- [ ] **Git** with SSH key configured
- [ ] **VS Code** (recommended) with extensions:
  - [ ] Docker
  - [ ] PostgreSQL
  - [ ] TypeScript and JavaScript
  - [ ] ESLint
  - [ ] Prettier

### Required Access
- [ ] GitHub repository access
- [ ] Environment variables and secrets (from project manager)
- [ ] VPN access (if required for staging/production)

## Quick Start (30 minutes)

### Step 1: Repository Setup
```bash
# Clone the repository
git clone [REPOSITORY_URL]
cd webcpc-backend

# Copy environment template
cp .env.example .env

# Review and update .env file with provided credentials
nano .env
```

### Step 2: Environment Validation
```bash
# Verify Docker is running
docker --version
docker-compose --version

# Start the development environment
docker-compose up -d

# Check all services are running
docker-compose ps
```

Expected output:
```
NAME                COMMAND                  SERVICE             STATUS              PORTS
webcpc-backend-app-1   "docker-entrypoint.s…"   app                 running             0.0.0.0:3000->3000/tcp
webcpc-backend-db-1    "docker-entrypoint.s…"   db                  running             0.0.0.0:5433->5432/tcp
webcpc-backend-adminer-1 "entrypoint.sh docke…"   adminer             running             0.0.0.0:8080->8080/tcp
```

### Step 3: Database Setup
```bash
# Install dependencies
docker-compose exec app npm install

# Run database migrations
docker-compose exec app npm run db:migrate

# Verify database schema
docker-compose exec app npm run db:status
```

### Step 4: Application Test
```bash
# Start development server
docker-compose exec app npm run dev

# In another terminal, test the API
curl http://localhost:3000/api/health
```

Expected response:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-15T10:30:00Z",
    "database": "connected"
  }
}
```

## Development Environment

### Project Structure
```
webcpc-backend/
├── src/                    # Application source code
│   ├── modules/           # Feature modules (telemetry, analytics)
│   ├── types/             # TypeScript type definitions
│   ├── config/            # Configuration files
│   └── utils/             # Utility functions
├── migrations/            # Database migration files
├── docs/                  # Project documentation
├── docker-compose.yml     # Development environment
├── Dockerfile            # Production container
└── package.json          # Dependencies and scripts
```

### Key Configuration Files

#### `.env` Variables
```bash
# Application
PORT=3000
NODE_ENV=development

# Database (TimescaleDB)
POSTGRES_USER=your_username
POSTGRES_PASSWORD=your_password  
POSTGRES_DB=your_database
DATABASE_URL=postgres://user:password@db:5432/database

# Optional: External Services
REDIS_URL=redis://localhost:6379
SENTRY_DSN=your_sentry_dsn
```

#### `docker-compose.yml` Services
- **app**: Node.js application server
- **db**: TimescaleDB database with PostGIS
- **adminer**: Database management UI (http://localhost:8080)

### Development Workflow

#### Daily Development
```bash
# Start your development session
docker-compose up -d
docker-compose exec app npm run dev

# Make code changes...
# Tests run automatically on file changes

# Check code quality
docker-compose exec app npm run lint
docker-compose exec app npm run format:check

# Run tests
docker-compose exec app npm test
```

#### Database Changes
```bash
# Create a new migration
docker-compose exec app npm run db:migrate:create -- add_new_feature

# Edit the migration file in migrations/
# Run the migration
docker-compose exec app npm run db:migrate

# If you need to rollback
docker-compose exec app npm run db:migrate:down
```

#### Git Workflow
```bash
# Create feature branch
git checkout -b feature/your-feature-name

# Make commits with conventional commit messages
git commit -m "feat: add new telemetry endpoint"
git commit -m "fix: resolve database connection issue"
git commit -m "docs: update API documentation"

# Push and create PR
git push origin feature/your-feature-name
```

## Core Concepts

### TimescaleDB Hypertables
The main `telemetry.vehicle_telemetry` table is a TimescaleDB hypertable:
- **Automatic Partitioning**: Data is automatically partitioned by time (1-day chunks)
- **Compression**: Data older than 7 days is automatically compressed
- **Retention**: Data is automatically deleted after 2 years (configurable)

### Geospatial Data
PostGIS extension provides geospatial capabilities:
- **GEOMETRY**: For planar calculations (faster, local analysis)
- **GEOGRAPHY**: For spherical calculations (accurate earth distances)
- **Spatial Indexes**: GIST indexes for efficient location queries

### Data Flow
```
IoT Devices → API Endpoints → Validation → Database → Analytics Views
```

## Common Development Tasks

### Adding a New API Endpoint

#### 1. Define Types
```typescript
// src/types/telemetry.ts
export interface NewFeatureRequest {
  license_plate: string;
  feature_data: Record<string, unknown>;
}

export interface NewFeatureResponse {
  success: boolean;
  data: any;
}
```

#### 2. Create Service Method
```typescript
// src/modules/telemetry/telemetry.service.ts
async createNewFeature(data: NewFeatureRequest): Promise<void> {
  const query = `
    INSERT INTO telemetry.new_feature_table (license_plate, data, created_at)
    VALUES ($1, $2, NOW())
  `;
  await this.pool.query(query, [data.license_plate, data.feature_data]);
}
```

#### 3. Add Controller Method
```typescript
// src/modules/telemetry/telemetry.controller.ts
async createNewFeature(req: Request, res: Response): Promise<void> {
  try {
    const data = req.body as NewFeatureRequest;
    await this.telemetryService.createNewFeature(data);
    res.status(201).json({ success: true, message: 'Feature created' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}
```

#### 4. Add Route
```typescript
// src/modules/telemetry/telemetry.router.ts
router.post('/new-feature', telemetryController.createNewFeature);
```

### Database Queries

#### Common Query Patterns
```typescript
// Time-range query (always include time bounds)
const recentData = await pool.query(`
  SELECT license_plate, time, speed, longitude, latitude
  FROM telemetry.vehicle_telemetry
  WHERE time >= NOW() - INTERVAL '24 hours'
  ORDER BY time DESC
  LIMIT 1000
`);

// Geospatial query
const nearbyVehicles = await pool.query(`
  SELECT license_plate, 
         ST_Distance(geog, ST_Point($1, $2)::geography) as distance_meters
  FROM telemetry.vehicle_telemetry
  WHERE ST_DWithin(geog, ST_Point($1, $2)::geography, $3)
    AND time >= NOW() - INTERVAL '1 hour'
  ORDER BY distance_meters
`, [longitude, latitude, radiusMeters]);

// Aggregation query
const dailyStats = await pool.query(`
  SELECT DATE(time) as date,
         COUNT(*) as total_records,
         AVG(speed) as avg_speed,
         MAX(speed) as max_speed
  FROM telemetry.vehicle_telemetry
  WHERE license_plate = $1
    AND time >= CURRENT_DATE - INTERVAL '30 days'
  GROUP BY DATE(time)
  ORDER BY date
`, [licensePlate]);
```

### Testing

#### Unit Tests
```typescript
// src/__tests__/telemetry.service.test.ts
import { TelemetryService } from '../modules/telemetry/telemetry.service';

describe('TelemetryService', () => {
  let service: TelemetryService;

  beforeEach(() => {
    service = new TelemetryService();
  });

  it('should validate telemetry data', async () => {
    const validData = {
      license_plate: 'TEST-001',
      time: new Date(),
      speed: 50
    };

    expect(() => service.validateTelemetryData(validData)).not.toThrow();
  });
});
```

#### Integration Tests
```typescript
// src/__tests__/integration/telemetry.api.test.ts
import request from 'supertest';
import { app } from '../../app';

describe('Telemetry API', () => {
  it('should create telemetry records', async () => {
    const response = await request(app)
      .post('/api/telemetry/batch')
      .send([{
        license_plate: 'TEST-001',
        time: new Date(),
        longitude: 121.5654,
        latitude: 25.0330,
        speed: 45.2
      }]);

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });
});
```

## Debugging and Troubleshooting

### Common Issues

#### Database Connection Problems
```bash
# Check database status
docker-compose ps db

# Check database logs
docker-compose logs db

# Test connection manually
docker-compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB -c "SELECT NOW();"
```

#### Migration Issues
```bash
# Check migration status
docker-compose exec app npm run db:status

# View migration table
docker-compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB -c "SELECT * FROM pgmigrations ORDER BY run_on DESC;"

# Reset migrations (CAUTION: destroys data)
docker-compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB -c "DELETE FROM pgmigrations;"
```

#### Performance Issues
```bash
# Check slow queries
docker-compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB -c "
SELECT query, mean_exec_time, calls 
FROM pg_stat_statements 
WHERE mean_exec_time > 100 
ORDER BY mean_exec_time DESC LIMIT 10;
"

# Check table sizes
docker-compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB -c "
SELECT schemaname, tablename, 
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname IN ('telemetry', 'analytics')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
"
```

### Debugging Tools

#### Database Management
- **Adminer**: http://localhost:8080 (GUI database management)
- **psql**: Direct database command line access
- **pgAdmin**: Alternative GUI (can be added to docker-compose.yml)

#### Application Debugging
```typescript
// Enable debug logging
process.env.DEBUG = '*';

// Add debug statements
import debug from 'debug';
const log = debug('app:telemetry');

log('Processing telemetry data:', data);
```

#### API Testing
```bash
# Health check
curl http://localhost:3000/api/health

# Test telemetry endpoint
curl -X POST http://localhost:3000/api/telemetry/batch \
  -H "Content-Type: application/json" \
  -d '[{
    "license_plate": "TEST-001",
    "time": "2024-01-15T10:30:00Z",
    "longitude": 121.5654,
    "latitude": 25.0330,
    "speed": 45.2
  }]'
```

## Best Practices for External Teams

### Code Quality
1. **Follow TypeScript strict mode**: Enable all strict type checking
2. **Use ESLint and Prettier**: Maintain consistent code style
3. **Write tests**: Aim for >80% test coverage
4. **Document public APIs**: Use JSDoc for all public methods

### Database
1. **Always use time bounds**: Include time constraints in all queries
2. **Use parameterized queries**: Prevent SQL injection
3. **Batch operations**: Use bulk insert for >100 records
4. **Monitor query performance**: Use EXPLAIN ANALYZE for slow queries

### Security
1. **Validate all inputs**: Use TypeScript types and runtime validation
2. **Use environment variables**: Never hardcode secrets
3. **Implement rate limiting**: Prevent API abuse
4. **Log security events**: Monitor for suspicious activity

### Performance
1. **Use connection pooling**: Configure appropriate pool sizes
2. **Implement caching**: Cache frequently accessed data
3. **Optimize queries**: Use appropriate indexes and query patterns
4. **Monitor metrics**: Track API response times and database performance

## Support and Communication

### Documentation Resources
- **Database Schema**: `docs/DATABASE_SCHEMA_REFERENCE.md`
- **API Reference**: `docs/API_REFERENCE.md`
- **Developer Guide**: `docs/DEVELOPER_GUIDE.md`
- **Architecture Overview**: `docs/VDRS_TELEMETRY_OPTIMIZED_ARCHITECTURE.md`

### Getting Help
1. **Check existing documentation** first
2. **Search closed issues** in the repository
3. **Create detailed issue reports** with:
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details
   - Relevant logs/error messages

### Code Review Process
1. **Create feature branches** for all changes
2. **Write descriptive commit messages** using conventional commits
3. **Include tests** for new functionality
4. **Update documentation** for API changes
5. **Request review** from core team members

## Project-Specific Guidelines

### Telemetry Data Handling
- **Validate coordinates**: Longitude (-180 to 180), Latitude (-90 to 90)
- **Handle missing GPS**: Allow null coordinates for indoor/tunnel scenarios
- **Preserve raw data**: Always store complete original payload in `raw_data`
- **Use batch operations**: Process vehicle data in batches for efficiency

### Time-Series Best Practices
- **Use timezone-aware timestamps**: Always TIMESTAMPTZ
- **Query recent data first**: Most queries are for recent data
- **Leverage compression**: Older data is compressed and read-only
- **Plan for retention**: Data older than 2 years is automatically deleted

### Geospatial Considerations
- **Choose correct geometry type**: GEOMETRY for local, GEOGRAPHY for global
- **Use appropriate SRID**: 4326 for GPS coordinates
- **Index spatial columns**: GIST indexes for spatial queries
- **Validate spatial data**: Check for invalid geometries

---

**Welcome to the team! This guide should get you productive quickly. Don't hesitate to ask questions and suggest improvements to this documentation.**
