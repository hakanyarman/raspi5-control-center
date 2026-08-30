export interface HealthStatus {
  status: 'ok'
  database: 'connected'
}

export interface WeightMeasurement {
  id: string
  weightKg: number
  measuredAt: string
}

export interface DashboardData {
  health: HealthStatus
  latest: WeightMeasurement | null
  measurements: WeightMeasurement[]
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
  const [health, latest, measurements] = await Promise.all([
    fetchJson<HealthStatus>('/health'),
    getLatestWeight(),
    fetchJson<WeightMeasurement[]>('/api/weights?limit=7'),
  ])

  return { health, latest, measurements }
}
