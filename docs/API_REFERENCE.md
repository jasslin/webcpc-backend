# VDRS Telemetry System - API Reference

## Overview

This document provides comprehensive API reference for the VDRS Telemetry System. All endpoints return JSON responses and use standard HTTP status codes.

## Base Information

- **Base URL**: `http://localhost:3000/api`
- **Content-Type**: `application/json`
- **Authentication**: Currently not implemented (planned for future versions)

## HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `404` - Not Found
- `500` - Internal Server Error

## Common Response Format

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation completed successfully"
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": { ... }
  }
}
```

## Endpoints

### Health Check

#### GET `/api/health`
Check system health status.

**Response:**
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

### Telemetry Data

#### POST `/api/telemetry/batch`
Bulk insert telemetry data records.

**Request Body:**
```json
[
  {
    "time": "2024-01-15T10:30:00Z",
    "license_plate": "ABC-1234",
    "longitude": 121.5654,
    "latitude": 25.0330,
    "altitude": 15.5,
    "speed": 45.2,
    "gps_speed": 44.8,
    "direction": 180.0,
    "mileage": 125000.5,
    "rpm": 2500,
    "gps_status": "A",
    "gps_satellite_count": 8,
    "is_moving": true,
    "is_speeding": false,
    "csq": 25,
    "driver_id": "DRIVER001",
    "log_sequence": 12345,
    "crc_checksum": "ABCD1234",
    "ignition": true,
    "engine_on": true,
    "door_open": false,
    "brake_signal": false,
    "fuel_level": 75,
    "battery_voltage": 12.6,
    "engine_temperature": 85.5,
    "raw_data": {
      "io": {
        "ignition": true,
        "engine_on": true,
        "accelerator": 35,
        "brake_pedal": false,
        "clutch": false,
        "gear_position": 4
      },
      "deviceStatus": {
        "battery_voltage": 12.6,
        "temperature": 28.5,
        "humidity": 65,
        "signal_strength": 85
      },
      "sensors": {
        "accelerometer_x": 0.1,
        "accelerometer_y": 0.2,
        "accelerometer_z": 9.8,
        "gyroscope_x": 0.01,
        "gyroscope_y": 0.02,
        "gyroscope_z": 0.03
      }
    },
    "raw_log_data": {
      "log_level": "INFO",
      "log_message": "Vehicle telemetry data collected",
      "log_timestamp": "2024-01-15T10:30:00Z"
    },
    "raw_device_status": {
      "device_id": "DEVICE001",
      "firmware_version": "1.2.3",
      "last_maintenance": "2024-01-01T00:00:00Z"
    },
    "raw_io_extended": {
      "additional_io": {
        "aux_input_1": false,
        "aux_input_2": true,
        "aux_output_1": false,
        "aux_output_2": true
      }
    }
  }
]
```

**Response:**
```json
{
  "success": true,
  "data": {
    "inserted_count": 1,
    "processed_count": 1,
    "errors": []
  },
  "message": "Telemetry data inserted successfully"
}
```

**Validation Rules:**
- `time`: Required, ISO 8601 timestamp
- `license_plate`: Required, string (max 20 chars)
- `longitude`: Optional, numeric (-180 to 180)
- `latitude`: Optional, numeric (-90 to 90)
- `speed`: Optional, numeric (0 to 300)
- `rpm`: Optional, integer (0 to 10000)

#### GET `/api/telemetry/vehicle/:id/track`
Get vehicle track data for a specific time period.

**Path Parameters:**
- `id`: Vehicle license plate

**Query Parameters:**
- `start_time` (optional): ISO 8601 timestamp, default: 24 hours ago
- `end_time` (optional): ISO 8601 timestamp, default: now
- `limit` (optional): Number of records, default: 100, max: 1000

**Example Request:**
```
GET /api/telemetry/vehicle/ABC-1234/track?start_time=2024-01-15T00:00:00Z&end_time=2024-01-15T23:59:59Z&limit=500
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "time": "2024-01-15T10:30:00Z",
      "license_plate": "ABC-1234",
      "longitude": 121.5654,
      "latitude": 25.0330,
      "altitude": 15.5,
      "speed": 45.2,
      "direction": 180.0,
      "geom": "POINT(121.5654 25.0330)",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "total": 500,
    "limit": 500,
    "offset": 0,
    "has_more": false
  }
}
```

#### GET `/api/telemetry/nearby`
Find vehicles near a specific location.

**Query Parameters:**
- `longitude`: Required, numeric (-180 to 180)
- `latitude`: Required, numeric (-90 to 90)
- `radius_meters` (optional): Search radius in meters, default: 1000, max: 10000
- `limit` (optional): Number of vehicles, default: 50, max: 200

**Example Request:**
```
GET /api/telemetry/nearby?longitude=121.5654&latitude=25.0330&radius_meters=2000&limit=100
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "license_plate": "ABC-1234",
      "longitude": 121.5654,
      "latitude": 25.0330,
      "distance_meters": 0.0,
      "speed": 45.2,
      "last_seen": "2024-01-15T10:30:00Z",
      "driver_id": "DRIVER001"
    }
  ],
  "search_center": {
    "longitude": 121.5654,
    "latitude": 25.0330
  },
  "search_radius_meters": 2000
}
```

#### GET `/api/telemetry/realtime-summary`
Get real-time system summary and statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "system_status": "operational",
    "total_vehicles": 150,
    "active_vehicles_last_hour": 45,
    "total_records_today": 125000,
    "ingestion_rate_per_minute": 87,
    "storage_usage_mb": 2048,
    "compression_ratio": 3.2,
    "last_data_received": "2024-01-15T10:30:00Z",
    "system_uptime_hours": 168.5
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Analytics

#### GET `/api/analytics/daily-vehicle-summary`
Get daily aggregated statistics per vehicle.

**Query Parameters:**
- `date` (optional): Date in YYYY-MM-DD format, default: today
- `license_plate` (optional): Filter by specific vehicle
- `limit` (optional): Number of records, default: 100, max: 1000

**Example Request:**
```
GET /api/analytics/daily-vehicle-summary?date=2024-01-15&limit=50
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "date": "2024-01-15T00:00:00Z",
      "license_plate": "ABC-1234",
      "total_records": 1440,
      "avg_speed": 42.5,
      "max_speed": 85.0,
      "min_speed": 0.0,
      "avg_rpm": 2200,
      "speeding_incidents": 3,
      "moving_records": 1200,
      "center_point": "POINT(121.5654 25.0330)",
      "total_distance_meters": 125000
    }
  ],
  "summary": {
    "total_vehicles": 50,
    "total_records": 72000,
    "avg_speeding_incidents": 2.5
  }
}
```

#### GET `/api/analytics/daily-driver-summary`
Get daily aggregated statistics per driver.

**Query Parameters:**
- `date` (optional): Date in YYYY-MM-DD format, default: today
- `driver_id` (optional): Filter by specific driver
- `limit` (optional): Number of records, default: 100, max: 1000

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "date": "2024-01-15T00:00:00Z",
      "driver_id": "DRIVER001",
      "vehicles_assigned": 3,
      "total_records": 4320,
      "avg_speed": 38.2,
      "max_speed": 75.0,
      "speeding_incidents": 2,
      "moving_records": 3600,
      "avg_battery_voltage": 12.4,
      "avg_engine_temperature": 82.1
    }
  ]
}
```

#### GET `/api/analytics/vehicle-track-summary`
Get hourly vehicle track summaries with spatial analysis.

**Query Parameters:**
- `license_plate` (optional): Filter by specific vehicle
- `start_time` (optional): ISO 8601 timestamp, default: 24 hours ago
- `end_time` (optional): ISO 8601 timestamp, default: now
- `limit` (optional): Number of records, default: 100, max: 1000

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "license_plate": "ABC-1234",
      "hour_bucket": "2024-01-15T10:00:00Z",
      "records_count": 60,
      "start_time": "2024-01-15T10:00:00Z",
      "end_time": "2024-01-15T10:59:59Z",
      "avg_speed": 45.2,
      "max_speed": 65.0,
      "start_point": "POINT(121.5600 25.0300)",
      "end_point": "POINT(121.5700 25.0360)",
      "distance_meters": 1250,
      "center_point": "POINT(121.5650 25.0330)"
    }
  ]
}
```

#### GET `/api/analytics/performance/metrics`
Get system performance monitoring metrics.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "metric_category": "data_ingestion",
      "metric_name": "records_per_second",
      "metric_value": 87.5,
      "unit": "records/sec",
      "calculated_at": "2024-01-15T10:30:00Z"
    },
    {
      "metric_category": "storage_efficiency",
      "metric_name": "compression_ratio",
      "metric_value": 3.2,
      "unit": "ratio",
      "calculated_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

#### GET `/api/analytics/anomaly-summary`
Get daily anomaly event statistics.

**Query Parameters:**
- `date` (optional): Date in YYYY-MM-DD format, default: today
- `anomaly_type` (optional): Filter by anomaly type
- `severity` (optional): Filter by severity level
- `limit` (optional): Number of records, default: 100, max: 1000

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "date": "2024-01-15T00:00:00Z",
      "anomaly_type": "speed_violation",
      "severity": "medium",
      "occurrence_count": 15,
      "affected_vehicles": 12,
      "affected_drivers": 10,
      "critical_ratio": 0.0,
      "resolution_ratio": 0.8
    }
  ]
}
```

#### GET `/api/analytics/device-health-summary`
Get device health monitoring summary.

**Query Parameters:**
- `start_time` (optional): ISO 8601 timestamp, default: 24 hours ago
- `end_time` (optional): ISO 8601 timestamp, default: now
- `limit` (optional): Number of records, default: 100, max: 1000

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "hour_bucket": "2024-01-15T10:00:00Z",
      "total_devices": 150,
      "devices_needing_attention": 3,
      "healthy_devices": 147,
      "health_percentage": 98.0
    }
  ]
}
```

### Performance Monitoring

#### GET `/api/performance/alerts`
Get system performance alerts and warnings.

**Query Parameters:**
- `severity` (optional): Filter by alert severity (low, medium, high, critical)
- `status` (optional): Filter by alert status (active, acknowledged, resolved)
- `limit` (optional): Number of alerts, default: 50, max: 200

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "alert_id": "ALERT001",
      "severity": "medium",
      "category": "performance",
      "title": "High CPU Usage",
      "description": "CPU usage exceeded 80% threshold",
      "status": "active",
      "created_at": "2024-01-15T10:25:00Z",
      "acknowledged_at": null,
      "resolved_at": null,
      "affected_components": ["database", "api_server"],
      "recommended_actions": [
        "Check database query performance",
        "Monitor API response times"
      ]
    }
  ]
}
```

## Error Handling

### Common Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `VALIDATION_ERROR` | Input validation failed | 400 |
| `VEHICLE_NOT_FOUND` | Vehicle not found | 404 |
| `INVALID_COORDINATES` | Invalid geographic coordinates | 400 |
| `DATABASE_ERROR` | Database operation failed | 500 |
| `RATE_LIMIT_EXCEEDED` | Too many requests | 429 |

### Error Response Examples

#### Validation Error
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": {
      "longitude": "Must be between -180 and 180",
      "speed": "Must be a positive number"
    }
  }
}
```

#### Not Found Error
```json
{
  "success": false,
  "error": {
    "code": "VEHICLE_NOT_FOUND",
    "message": "Vehicle with license plate ABC-1234 not found",
    "details": {
      "license_plate": "ABC-1234",
      "searched_at": "2024-01-15T10:30:00Z"
    }
  }
}
```

## Rate Limiting

Currently, the API does not implement rate limiting. This will be added in future versions to prevent abuse and ensure system stability.

## Pagination

Endpoints that return lists support pagination using `limit` and `offset` parameters.

**Pagination Response Format:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "total": 1000,
    "limit": 100,
    "offset": 0,
    "has_more": true,
    "next_offset": 100
  }
}
```

## Data Formats

### Timestamps
All timestamps are in ISO 8601 format: `YYYY-MM-DDTHH:mm:ss.sssZ`

### Geographic Coordinates
- **Longitude**: Decimal degrees (-180 to 180)
- **Latitude**: Decimal degrees (-90 to 90)
- **Altitude**: Meters above sea level
- **Distance**: Meters

### Speed and Distance
- **Speed**: Kilometers per hour (km/h)
- **Distance**: Meters
- **Time**: Seconds

## Testing

### Test Endpoints
Use the health check endpoint to verify system status:
```
GET /api/health
```

### Sample Data
The system includes sample data for testing. You can use the following license plates:
- `DEV-001` - Development test vehicle
- `PROD-001` - Production test vehicle
- `BULK-001` - Bulk data test vehicle

## Future Enhancements

Planned features for upcoming versions:
- Authentication and authorization
- Rate limiting
- WebSocket support for real-time updates
- Advanced filtering and search
- Data export functionality
- Custom alert rules
- Dashboard configuration API

---

**Note**: This API reference is version 1.0.0. Check the repository for the latest updates and breaking changes.
