export interface WeightMeasurement {
  id: string;
  weightKg: number;
  measuredAt: string;
}

export interface SystemMetrics {
  temperatureC: number | null;
  fanRpm: number | null;
  cpuUsagePercent: number;
  loadAverage: number;
  memory: {
    usedMb: number;
    totalMb: number;
    availableMb: number;
    usagePercent: number;
  };
  disk: {
    usedGb: number;
    totalGb: number;
    usagePercent: number;
  };
  throttled: boolean | null;
  throttleCode: string | null;
  uptimeSeconds: number;
  collectedAt: string;
}

export interface NetworkMetrics {
  hostname: string;
  interfaceName: string | null;
  ipv4Address: string | null;
  connected: boolean;
  receivedBytes: number | null;
  transmittedBytes: number | null;
  downloadBytesPerSecond: number | null;
  uploadBytesPerSecond: number | null;
  collectedAt: string;
}

export type LanNeighborState = "reachable" | "stale" | "unknown";

export interface LanNeighborObservation {
  ipAddress: string;
  macAddress: string;
  interfaceName: string;
  state: LanNeighborState;
}

export interface StorageMetrics {
  devicePath: string;
  drivePath: string;
  model: string | null;
  transport: string | null;
  filesystem: string;
  mountPoint: string;
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  usagePercent: number;
  collectedAt: string;
}
