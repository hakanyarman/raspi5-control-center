import type {
  NetworkMetrics,
  LanNeighborObservation,
  StorageMetrics,
  StorageInventory,
  ServicesStatus,
  SystemMetrics,
  WeightMeasurement,
  CalorieEntry,
  CalorieSummary,
  DailyCalorieTotal,
  UserProfile,
} from '@raspi5-control-center/shared'

export type {
  NetworkMetrics,
  LanNeighborObservation,
  StorageMetrics,
  StorageInventory,
  ServicesStatus,
  SystemMetrics,
  WeightMeasurement,
  CalorieEntry,
  CalorieSummary,
  DailyCalorieTotal,
  UserProfile,
} from '@raspi5-control-center/shared'

export interface HealthStatus {
  status: 'ok'
  database: 'connected'
}

export interface DashboardData {
  health: HealthStatus
  latest: WeightMeasurement | null
  measurements: WeightMeasurement[]
  chartMeasurements: WeightMeasurement[]
  system: SystemMetrics
  network: NetworkMetrics
  neighbors: LanNeighborObservation[]
  storage: StorageMetrics | null
  storageInventory: StorageInventory | null
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
  const [health, latest, measurements, chartMeasurements, system, network, neighbors, storage, storageInventory] = await Promise.all([
    fetchJson<HealthStatus>('/health'),
    getLatestWeight(),
    fetchJson<WeightMeasurement[]>('/api/weights?limit=7'),
    fetchJson<WeightMeasurement[]>('/api/weights?limit=30'),
    fetchJson<SystemMetrics>('/api/system/metrics'),
    fetchJson<NetworkMetrics>('/api/network/metrics'),
    fetchJson<{ devices: LanNeighborObservation[] }>('/api/network/neighbors'),
    fetchJson<StorageMetrics>('/api/storage/metrics').catch(() => null),
    getStorageInventory().catch(() => null),
  ])

  return { health, latest, measurements, chartMeasurements, system, network, neighbors: neighbors.devices, storage, storageInventory }
}

export function getServicesStatus(): Promise<ServicesStatus> {
  return fetchJson<ServicesStatus>('/api/services/status')
}

export function getStorageInventory(): Promise<StorageInventory> {
  return fetchJson<StorageInventory>('/api/storage/devices')
}

export function getCalorieSummary(date: string): Promise<CalorieSummary> {
  return fetchJson<CalorieSummary>(`/api/calories/summary?date=${encodeURIComponent(date)}`)
}

export function getCalorieEntries(from: string, to: string): Promise<CalorieEntry[]> {
  return fetchJson<CalorieEntry[]>(`/api/calories/entries?from=${from}&to=${to}`)
}

export function getCalorieHistory(from: string, to: string): Promise<DailyCalorieTotal[]> {
  return fetchJson<DailyCalorieTotal[]>(`/api/calories/history?from=${from}&to=${to}`)
}

export function getProfile(): Promise<UserProfile | null> {
  return fetchJson<UserProfile | null>('/api/calories/profile')
}

export async function saveProfile(profile: UserProfile): Promise<UserProfile> {
  const response = await fetch('/api/calories/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) })
  if (!response.ok) throw new Error(`Profile request failed with status ${response.status}`)
  return response.json() as Promise<UserProfile>
}

export async function createCalorieEntry(entry: Omit<CalorieEntry, 'id'>): Promise<CalorieEntry> {
  const response = await fetch('/api/calories/entries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) })
  if (!response.ok) throw new Error(`Calorie entry request failed with status ${response.status}`)
  return response.json() as Promise<CalorieEntry>
}

export async function deleteCalorieEntry(id: string): Promise<void> {
  const response = await fetch(`/api/calories/entries/${id}`, { method: 'DELETE' })
  if (!response.ok) throw new Error(`Calorie delete request failed with status ${response.status}`)
}
