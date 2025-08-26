// VDRS Telemetry Type Definitions

export interface VehicleTelemetry {
  // Basic identification fields
  time: Date;
  license_plate: string;
  imei?: string;
  imsi?: string;

  // Location data
  longitude?: number;
  latitude?: number;
  altitude?: number;

  // Movement data
  speed?: number;
  gps_speed?: number;
  direction?: number;
  mileage?: number;
  rpm?: number;

  // Status and quality
  gps_status?: 'A' | 'V';
  gps_satellite_count?: number;
  is_moving?: boolean;
  is_speeding?: boolean;
  csq?: number;

  // Driver information
  driver_id?: string;

  // Key reinforced fields
  log_sequence?: number;
  crc_checksum?: string;

  // Hot data field flattening - IO status
  ignition?: boolean;
  engine_on?: boolean;
  door_open?: boolean;
  brake_signal?: boolean;

  // Hot data field flattening - Device status
  fuel_level?: number;
  battery_voltage?: number;
  engine_temperature?: number;

  // Raw data storage
  raw_data?: Record<string, unknown>;

  // Metadata
  created_at?: Date;
  data_source?: string;
}

export interface TelemetryBatchResponse {
  success: boolean;
  message: string;
  count: number;
}

export interface VehicleTrackResponse {
  success: boolean;
  data: VehicleTelemetry[];
  count: number;
}

export interface NearbyVehiclesResponse {
  success: boolean;
  data: VehicleTelemetry[];
  count: number;
}

export interface RealtimeSummaryResponse {
  success: boolean;
  data: Record<string, unknown>[];
  count: number;
}
