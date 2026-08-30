export interface HealthStatus {
  status: 'ok'
  database: 'connected'
}

export interface WeightMeasurement {
  id: string
  weightKg: number
  measuredAt: string
}

export interface SystemMetrics {
  temperatureC: number | null
  fanRpm: number | null
  cpuUsagePercent: number
  loadAverage: number
  memory: {
    usedMb: number
    totalMb: number
    availableMb: number
    usagePercent: number
  }
  disk: {
    usedGb: number
    totalGb: number
    usagePercent: number
  }
  throttled: boolean | null
  throttleCode: string | null
  uptimeSeconds: number
  collectedAt: string
}

export interface DashboardData {
  health: HealthStatus
  latest: WeightMeasurement | null
  measurements: WeightMeasurement[]
  chartMeasurements: WeightMeasurement[]
  system: SystemMetrics
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`)
  }

  return response.json() as Promise<T>
}

async function getLatestWeight(): Promise<WeightMeasurement | null> {
  const response = await fetch('/api/weights/latest')

  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(`Latest weight request failed with status ${response.status}`)
  }

  return response.json() as Promise<WeightMeasurement>
}

export async function getDashboardData(): Promise<DashboardData> {
  const [health, latest, measurements, chartMeasurements, system] = await Promise.all([
    fetchJson<HealthStatus>('/health'),
    getLatestWeight(),
    fetchJson<WeightMeasurement[]>('/api/weights?limit=7'),
    fetchJson<WeightMeasurement[]>('/api/weights?limit=30'),
    fetchJson<SystemMetrics>('/api/system/metrics'),
  ])

  return { health, latest, measurements, chartMeasurements, system }
}
