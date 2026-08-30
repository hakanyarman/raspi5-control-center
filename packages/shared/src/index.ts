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

export interface StorageVolume {
  path: string;
  filesystem: string | null;
  mountPoint: string | null;
  partitionSizeBytes: number;
  totalBytes: number | null;
  usedBytes: number | null;
  availableBytes: number | null;
  usagePercent: number | null;
}

export interface StorageDevice {
  path: string;
  model: string | null;
  transport: string | null;
  sizeBytes: number;
  removable: boolean;
  readOnly: boolean;
  isRoot: boolean;
  isExternal: boolean;
  volumes: StorageVolume[];
}

export interface StorageInventory {
  devices: StorageDevice[];
  externalDriveConnected: boolean;
  collectedAt: string;
}

export interface DockerContainerStatus {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  health: "healthy" | "unhealthy" | "starting" | "none" | "unknown";
  runningFor: string;
  ports: string | null;
  cpuPercent: number | null;
  memoryUsage: string | null;
  memoryPercent: number | null;
  networkIo: string | null;
  blockIo: string | null;
  pids: number | null;
  restartCount: number | null;
}

export interface ProcessServiceStatus {
  id: "api" | "web" | "scale";
  label: string;
  active: boolean;
  state: string;
  detail: string;
  pid: number | null;
  startedAt: string | null;
  uptimeSeconds: number | null;
  restarts: number | null;
}

export interface ServicesStatus {
  dockerAvailable: boolean;
  containers: DockerContainerStatus[];
  processes: ProcessServiceStatus[];
  collectedAt: string;
}
