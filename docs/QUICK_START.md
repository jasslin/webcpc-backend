# VDRS Telemetry System - Quick Start Guide

## Get Up and Running in 5 Minutes

This guide will help you get the VDRS Telemetry System running on your local machine quickly.

## Prerequisites

- **Docker & Docker Compose** - [Install Docker](https://docs.docker.com/get-docker/)
- **Git** - [Install Git](https://git-scm.com/downloads)
- **Node.js 18+** (optional, for local development) - [Install Node.js](https://nodejs.org/)

## Step 1: Clone and Setup

```bash
# Clone the repository
git clone <repository-url>
cd webcpc-backend

# Copy environment file
cp .env.example .env
```

## Step 2: Start the System

```bash
# Start all services (database, API, admin tools)
docker-compose up -d

# Verify services are running
docker-compose ps
```

You should see:
- ✅ `app` - API server (port 3000)
- ✅ `db` - TimescaleDB database (port 5433)
- ✅ `adminer` - Database admin tool (port 8080)

## Step 3: Setup Database

```bash
# Run database migrations
docker-compose exec app npm run db:migrate up

# Verify database setup
docker-compose exec db psql -U user -d mydatabase -c "SELECT COUNT(*) FROM telemetry.vehicle_telemetry;"
```

Expected output: `count: 4` (sample data)

## Step 4: Test the System

### Test API Health
```bash
curl http://localhost:3000/api/health
```

Expected response:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-15T10:30:00Z",
    "version": "1.0.0",
    "database": "connected"
  }
}
```

### Test Telemetry Data
```bash
curl http://localhost:3000/api/telemetry/realtime-summary
```

### Test Analytics
```bash
curl "http://localhost:3000/api/analytics/daily-vehicle-summary?limit=3"
```

## Step 5: Access Admin Tools

### Database Management
- **Adminer**: http://localhost:8080
  - System: `PostgreSQL`
  - Server: `db`
  - Username: `user`
  - Password: `password`
  - Database: `mydatabase`

### Direct Database Access
```bash
# Connect to database
docker-compose exec db psql -U user -d mydatabase

# List tables
\dt

# List schemas
\dn

# Exit
\q
```

## Step 6: Development Workflow

### Start Development Server
```bash
# Install dependencies
docker-compose exec app npm install

# Start development server with hot reload
docker-compose exec app npm run dev
```

### Make Code Changes
The source code is mounted as a volume, so changes are reflected immediately.

### Run Tests
```bash
# Run all tests
docker-compose exec app npm test

# Run with coverage
docker-compose exec app npm run test:coverage
```

### Code Quality
```bash
# Check code style
docker-compose exec app npm run lint

# Format code
docker-compose exec app npm run format
```

## Common Commands

### Database Operations
```bash
# Create new migration
docker-compose exec app npm run db:migrate:create -- add_new_feature

# Run migrations
docker-compose exec app npm run db:migrate up

# Rollback migration
docker-compose exec app npm run db:migrate down

# Check migration status
docker-compose exec db psql -U user -d mydatabase -c "SELECT * FROM pgmigrations;"
```

### Container Management
```bash
# View logs
docker-compose logs app -f
docker-compose logs db -f

# Restart services
docker-compose restart app
docker-compose restart db

# Stop all services
docker-compose down

# Stop and remove volumes (WARNING: This will delete all data)
docker-compose down -v
```

### Development Tools
```bash
# Access container shell
docker-compose exec app sh
docker-compose exec db psql -U user -d mydatabase

# Check container status
docker-compose ps
docker-compose top
```

## Sample Data

The system comes with sample data for testing:

### Test Vehicles
- `DEV-001` - Development test vehicle
- `PROD-001` - Production test vehicle  
- `BULK-001` - Bulk data test vehicle

### Sample API Calls
```bash
# Get vehicle track
curl "http://localhost:3000/api/telemetry/vehicle/DEV-001/track?limit=10"

# Find nearby vehicles
curl "http://localhost:3000/api/telemetry/nearby?longitude=121.5654&latitude=25.0330&radius_meters=1000"

# Get daily summary
curl "http://localhost:3000/api/analytics/daily-vehicle-summary?date=2024-08-26"
```

## Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Check what's using the port
lsof -i :3000
lsof -i :5433
lsof -i :8080

# Kill the process or change ports in docker-compose.yml
```

#### Database Connection Issues
```bash
# Check database status
docker-compose ps db

# Check database logs
docker-compose logs db

# Restart database
docker-compose restart db
```

#### Migration Issues
```bash
# Check migration status
docker-compose exec db psql -U user -d mydatabase -c "SELECT * FROM pgmigrations;"

# Reset migrations (CAUTION: This will delete all data)
docker-compose exec db psql -U user -d mydatabase -c "DELETE FROM pgmigrations;"
docker-compose exec app npm run db:migrate up
```

#### Permission Issues
```bash
# Fix Docker permissions (Linux/macOS)
sudo chown -R $USER:$USER .

# Or run with sudo (not recommended for production)
sudo docker-compose up -d
```

### Performance Issues

#### Check System Resources
```bash
# Check container resource usage
docker-compose top

# Check database performance
docker-compose exec db psql -U user -d mydatabase -c "SELECT * FROM analytics.v_performance_metrics;"
```

#### Database Optimization
```bash
# Check table sizes
docker-compose exec db psql -U user -d mydatabase -c "
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname IN ('telemetry', 'config', 'analytics')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
"
```

## Next Steps

### Explore the System
1. **Browse the API**: Use the endpoints in `docs/API_REFERENCE.md`
2. **Check the Database**: Use Adminer to explore the schema
3. **Review the Code**: Start with `src/app.ts` and follow the flow

### Learn More
- **Developer Guide**: `docs/DEVELOPER_GUIDE.md`
- **API Reference**: `docs/API_REFERENCE.md`
- **Architecture**: `docs/VDRS_TELEMETRY_OPTIMIZED_ARCHITECTURE.md`

### Start Developing
1. **Add New Endpoints**: Follow the pattern in `src/modules/telemetry/`
2. **Modify Database**: Create new migrations
3. **Add Tests**: Extend the test suite
4. **Improve Performance**: Optimize queries and add indexes

## Support

### Getting Help
- Check existing issues in the repository
- Create new issues with detailed descriptions
- Follow the contribution guidelines in `CONTRIBUTING.md`

### Useful Resources
- [TimescaleDB Documentation](https://docs.timescale.com/)
- [PostGIS Documentation](https://postgis.net/documentation/)
- [Express.js Documentation](https://expressjs.com/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)

---

**Congratulations!** 🎉 You now have a fully functional VDRS Telemetry System running locally. 

The system includes:
- ✅ High-performance TimescaleDB database
- ✅ RESTful API with TypeScript
- ✅ Real-time analytics views
- ✅ Sample data for testing
- ✅ Development environment with hot reload
- ✅ Complete testing and quality tools

Happy coding! 🚀
