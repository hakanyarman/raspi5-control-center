import {
  Activity,
  ArrowDown,
  ArrowUp,
  Boxes,
  CircuitBoard,
  Cpu,
  Database,
  Gauge,
  HardDrive,
  LayoutDashboard,
  Moon,
  Network,
  RefreshCw,
  Scale,
  Server,
  Sun,
  Thermometer,
  Wind,
  Wifi,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  getDashboardData,
  type DashboardData,
  type LanNeighborObservation,
  type NetworkMetrics,
  type SystemMetrics,
  type WeightMeasurement,
} from '@/lib/api'
import { cn } from '@/lib/utils'

const navigation = [
  { label: 'Genel Bakış', icon: LayoutDashboard, active: true, available: true },
  { label: 'Sistem', icon: Gauge, available: true },
  { label: 'Ağ', icon: Network, available: true },
  { label: 'Depolama', icon: HardDrive, available: false },
  { label: 'Servisler', icon: Boxes, available: false },
]

const upcomingModules = [
  {
    title: 'Depolama',
    description: 'NVMe ve harici disk kapasitesi',
    icon: HardDrive,
  },
]

function formatMeasurementDate(value: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatWeight(value: number): string {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatBytes(value: number | null): string {
  if (value === null) return 'N/A'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let amount = value
  let unitIndex = 0
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024
    unitIndex += 1
  }
  const digits = amount >= 100 || unitIndex === 0 ? 0 : amount >= 10 ? 1 : 2
  return `${amount.toFixed(digits)} ${units[unitIndex]}`
}

function formatTransferRate(value: number | null): string {
  return value === null ? 'Hesaplanıyor' : `${formatBytes(value)}/s`
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  if (days > 0) return `${days} gün ${hours} saat`
  if (hours > 0) return `${hours} saat ${minutes} dk`
  return `${minutes} dk`
}

function getTemperatureStatus(temperatureC: number | null) {
  if (temperatureC === null) return { label: 'Okunamadı', className: 'text-muted-foreground' }
  if (temperatureC >= 80) return { label: 'Kritik', className: 'text-red-300' }
  if (temperatureC >= 65) return { label: 'Isınıyor', className: 'text-amber-300' }
  return { label: 'Normal', className: 'text-emerald-300' }
}

function MetricBar({ value, className }: { value: number; className: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
      <div className={cn('h-full rounded-full transition-all', className)} style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }} />
    </div>
  )
}

function getWeightDifference(measurements: WeightMeasurement[]): number | null {
  if (measurements.length < 2) return null
  return measurements[0].weightKg - measurements[1].weightKg
}

function compareMeasurementsNewestFirst(
  left: WeightMeasurement,
  right: WeightMeasurement,
): number {
  const timestampDifference = right.measuredAt.localeCompare(left.measuredAt)
  if (timestampDifference !== 0) return timestampDifference
  if (left.id.length !== right.id.length) return right.id.length - left.id.length
  return right.id.localeCompare(left.id)
}

function mergeMeasurement(
  measurements: WeightMeasurement[],
  incoming: WeightMeasurement,
  limit: number,
): WeightMeasurement[] {
  return [incoming, ...measurements.filter(({ id }) => id !== incoming.id)]
    .sort(compareMeasurementsNewestFirst)
    .slice(0, limit)
}

function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-white/6 bg-black/20 p-5 backdrop-blur-xl lg:flex lg:flex-col">
      <div className="flex items-center gap-3 px-2 py-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-400 text-emerald-950 shadow-[0_0_30px_rgba(52,211,153,0.24)]">
          <CircuitBoard className="size-5" />
        </div>
        <div>
          <p className="font-semibold tracking-tight">Raspi Center</p>
          <p className="text-xs text-muted-foreground">Personal infrastructure</p>
        </div>
      </div>

      <nav className="mt-8 space-y-1.5">
        {navigation.map(({ label, icon: Icon, active, available }) => (
          <button
            className={cn(
              'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
              active
                ? 'bg-white/8 text-foreground'
                : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
            )}
            key={label}
            type="button"
          >
            <Icon className={cn('size-4', active && 'text-emerald-400')} />
            <span>{label}</span>
            {!active && !available && (
              <span className="ml-auto text-[10px] uppercase tracking-widest text-muted-foreground/60">
                Yakında
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="mt-auto rounded-2xl border border-white/8 bg-white/[0.03] p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-400">
            <Server className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">Raspberry Pi 5</p>
            <p className="truncate text-xs text-muted-foreground">
              NVMe üzerinden çalışıyor
            </p>
          </div>
        </div>
      </div>
    </aside>
  )
}

function LoadingDashboard() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Skeleton className="h-72 rounded-3xl lg:col-span-2" />
      <Skeleton className="h-72 rounded-3xl" />
      <Skeleton className="h-80 rounded-3xl lg:col-span-2" />
      <Skeleton className="h-80 rounded-3xl" />
    </div>
  )
}

function StatusCard({
  data,
  streamConnected,
}: {
  data: DashboardData
  streamConnected: boolean
}) {
  return (
    <Card className="border-white/8 bg-card/60 shadow-none backdrop-blur-xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex size-10 items-center justify-center rounded-xl bg-sky-400/10 text-sky-400">
            <Activity className="size-5" />
          </div>
          <Badge
            className={cn(
              streamConnected
                ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
                : 'border-amber-400/20 bg-amber-400/10 text-amber-300',
            )}
            variant="outline"
          >
            <span
              className={cn(
                'mr-1.5 size-1.5 rounded-full',
                streamConnected
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                  : 'bg-amber-400',
              )}
            />
            {streamConnected ? 'Canlı' : 'Yeniden bağlanıyor'}
          </Badge>
        </div>
        <CardTitle className="mt-5">Altyapı durumu</CardTitle>
        <CardDescription>API ve veri katmanı sağlıklı.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between rounded-xl bg-white/[0.035] px-3 py-3">
          <div className="flex items-center gap-2.5 text-sm">
            <Server className="size-4 text-sky-400" />
            Express API
          </div>
          <span className="text-xs font-medium text-emerald-400">
            {data.health.status === 'ok' ? 'Çalışıyor' : 'Sorunlu'}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-white/[0.035] px-3 py-3">
          <div className="flex items-center gap-2.5 text-sm">
            <Database className="size-4 text-violet-400" />
            PostgreSQL
          </div>
          <span className="text-xs font-medium text-emerald-400">
            {data.health.database === 'connected' ? 'Bağlı' : 'Ulaşılamıyor'}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function WeightCard({ data }: { data: DashboardData }) {
  const difference = getWeightDifference(data.measurements)

  return (
    <Card className="relative overflow-hidden border-emerald-400/15 bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(10,15,22,0.72)_55%)] shadow-[0_24px_80px_rgba(0,0,0,0.22)] lg:col-span-2">
      <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-emerald-400/10 blur-3xl" />
      <CardHeader className="relative flex-row items-start justify-between">
        <div>
          <div className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-emerald-400 text-emerald-950 shadow-[0_0_35px_rgba(52,211,153,0.2)]">
            <Scale className="size-5" />
          </div>
          <CardDescription className="text-emerald-100/60">
            Son vücut ağırlığı
          </CardDescription>
        </div>
        <Badge
          className="border-white/10 bg-black/15 text-emerald-100"
          variant="outline"
        >
          BLE Scale
        </Badge>
      </CardHeader>
      <CardContent className="relative">
        {data.latest ? (
          <>
            <div className="flex items-end gap-2">
              <span className="text-6xl font-semibold tracking-[-0.06em] text-white sm:text-7xl">
                {formatWeight(data.latest.weightKg)}
              </span>
              <span className="mb-2 text-lg font-medium text-emerald-200/70">
                kg
              </span>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-emerald-50/60">
              <span>{formatMeasurementDate(data.latest.measuredAt)}</span>
              <span className="hidden size-1 rounded-full bg-emerald-300/40 sm:block" />
              <span>
                {difference === null
                  ? 'Karşılaştırma için ilk kayıt'
                  : `${difference > 0 ? '+' : ''}${formatWeight(difference)} kg önceki ölçüme göre`}
              </span>
            </div>
          </>
        ) : (
          <div className="py-7">
            <p className="text-xl font-medium">Henüz ölçüm yok</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Tartıya çıktığında ilk kayıt burada görünecek.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function HistoryCard({ measurements }: { measurements: WeightMeasurement[] }) {
  return (
    <Card className="border-white/8 bg-card/60 shadow-none backdrop-blur-xl lg:col-span-2">
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Ölçüm geçmişi</CardTitle>
          <CardDescription>En yeni kayıtlar önce gösterilir.</CardDescription>
        </div>
        <Badge variant="secondary">Son {measurements.length} kayıt</Badge>
      </CardHeader>
      <CardContent>
        {measurements.length > 0 ? (
          <div className="space-y-1">
            {measurements.map((measurement, index) => (
              <div key={measurement.id}>
                <div className="flex items-center gap-3 py-3">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-white/[0.045] text-muted-foreground">
                    <Scale className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {index === 0 ? 'Son ölçüm' : `${index + 1}. ölçüm`}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatMeasurementDate(measurement.measuredAt)}
                    </p>
                  </div>
                  <p className="text-base font-semibold tabular-nums">
                    {formatWeight(measurement.weightKg)}{' '}
                    <span className="text-xs font-normal text-muted-foreground">
                      kg
                    </span>
                  </p>
                </div>
                {index < measurements.length - 1 && <Separator />}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 py-12 text-center text-sm text-muted-foreground">
            Kayıtlı ölçüm bulunmuyor.
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface DailyWeight {
  date: string
  label: string
  weightKg: number
}

function getDailyWeights(measurements: WeightMeasurement[]): DailyWeight[] {
  const byDay = new Map<string, WeightMeasurement>()
  for (const measurement of measurements) {
    const date = new Date(measurement.measuredAt)
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    const previous = byDay.get(key)
    if (!previous || measurement.measuredAt > previous.measuredAt) {
      byDay.set(key, measurement)
    }
  }

  return [...byDay.values()]
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
    .map((measurement) => ({
      date: measurement.measuredAt,
      label: new Intl.DateTimeFormat('tr-TR', {
        day: 'numeric',
        month: 'short',
      }).format(new Date(measurement.measuredAt)),
      weightKg: measurement.weightKg,
    }))
}

function WeightTrendCard({ measurements }: { measurements: WeightMeasurement[] }) {
  const dailyWeights = getDailyWeights(measurements)

  return (
    <Card className="border-white/8 bg-card/60 shadow-none backdrop-blur-xl lg:col-span-2">
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle>Ağırlık trendi</CardTitle>
          <CardDescription>Son 30 günün günlük son ölçümleri.</CardDescription>
        </div>
        <Badge variant="secondary">{dailyWeights.length} gün</Badge>
      </CardHeader>
      <CardContent>
        {dailyWeights.length > 0 ? (
          <div className="h-64 w-full">
            <ResponsiveContainer height="100%" width="100%">
              <LineChart data={dailyWeights} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" vertical={false} />
                <XAxis axisLine={false} dataKey="label" tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }} tickLine={false} />
                <YAxis axisLine={false} domain={['auto', 'auto']} tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }} tickLine={false} width={42} />
                <Tooltip
                  contentStyle={{ background: '#10161d', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, color: '#fff' }}
                  formatter={(value) => [`${Number(value).toFixed(2)} kg`, 'Ağırlık']}
                  labelFormatter={(label) => `Tarih: ${label}`}
                />
                <Line activeDot={{ r: 5 }} dataKey="weightKg" dot={{ fill: '#34d399', r: 3, strokeWidth: 0 }} isAnimationActive={false} name="Ağırlık" stroke="#34d399" strokeWidth={3} type="monotone" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 py-12 text-center text-sm text-muted-foreground">
            Grafik için henüz yeterli ölçüm yok.
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function UpcomingCard() {
  return (
    <Card className="border-white/8 bg-card/60 shadow-none backdrop-blur-xl">
      <CardHeader>
        <CardTitle>Sıradaki modüller</CardTitle>
        <CardDescription>Altyapı hazır oldukça aktif olacak.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {upcomingModules.map(({ title, description, icon: Icon }) => (
          <div className="flex items-start gap-3" key={title}>
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.045] text-muted-foreground">
              <Icon className="size-3.5" />
            </div>
            <div>
              <p className="text-sm font-medium">{title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {description}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function SystemCard({ metrics }: { metrics: SystemMetrics }) {
  const temperatureStatus = getTemperatureStatus(metrics.temperatureC)
  return (
    <Card className="border-white/8 bg-card/60 shadow-none backdrop-blur-xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex size-10 items-center justify-center rounded-xl bg-violet-400/10 text-violet-300">
            <Cpu className="size-5" />
          </div>
          <Badge variant="outline" className={cn('border-white/10', temperatureStatus.className)}>
            {temperatureStatus.label}
          </Badge>
        </div>
        <CardTitle className="mt-5">Sistem</CardTitle>
        <CardDescription>Raspberry Pi anlık durumu</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 text-muted-foreground"><Thermometer className="size-4" /> Sıcaklık</span>
          <span className="font-medium tabular-nums">{metrics.temperatureC === null ? 'N/A' : `${metrics.temperatureC.toFixed(1)}°C`}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 text-muted-foreground"><Wind className="size-4" /> Fan</span>
          <span className="font-medium tabular-nums">{metrics.fanRpm === null ? 'N/A' : `${metrics.fanRpm} RPM`}</span>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">CPU kullanımı</span><span className="tabular-nums">{metrics.cpuUsagePercent}%</span></div>
          <MetricBar value={metrics.cpuUsagePercent} className="bg-sky-400" />
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">RAM</span><span className="tabular-nums">{metrics.memory.usedMb} / {metrics.memory.totalMb} MB</span></div>
          <MetricBar value={metrics.memory.usagePercent} className="bg-violet-400" />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Disk</span>
          <span className="tabular-nums">{metrics.disk.usedGb} / {metrics.disk.totalGb} GB ({metrics.disk.usagePercent}%)</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Uptime</span>
          <span>{formatUptime(metrics.uptimeSeconds)}</span>
        </div>
        <div className="flex items-center justify-between border-t border-white/8 pt-3 text-xs">
          <span className="text-muted-foreground">Power</span>
          <span className={cn(metrics.throttled === true ? 'text-red-300' : 'text-emerald-300')}>
            {metrics.throttleCode ?? 'N/A'}{metrics.throttled === true ? ' · Throttle' : ' · Normal'}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground">Güncellendi: {formatMeasurementDate(metrics.collectedAt)}</p>
      </CardContent>
    </Card>
  )
}

function NetworkCard({ metrics, neighbors }: { metrics: NetworkMetrics; neighbors: LanNeighborObservation[] }) {
  return (
    <Card className="border-white/8 bg-card/60 shadow-none backdrop-blur-xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex size-10 items-center justify-center rounded-xl bg-sky-400/10 text-sky-300">
            <Wifi className="size-5" />
          </div>
          <Badge
            className={cn(
              'border-white/10',
              metrics.connected ? 'text-emerald-300' : 'text-red-300',
            )}
            variant="outline"
          >
            {metrics.connected ? 'Bağlı' : 'Bağlantı yok'}
          </Badge>
        </div>
        <CardTitle className="mt-5">Ağ</CardTitle>
        <CardDescription>{metrics.hostname}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Arayüz</span>
          <span className="font-medium">{metrics.interfaceName ?? 'N/A'}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Yerel IPv4</span>
          <span className="font-mono text-xs">{metrics.ipv4Address ?? 'N/A'}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white/[0.035] p-3">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ArrowDown className="size-3.5 text-sky-300" /> İndirme
            </span>
            <p className="mt-2 text-sm font-semibold tabular-nums">
              {formatTransferRate(metrics.downloadBytesPerSecond)}
            </p>
          </div>
          <div className="rounded-xl bg-white/[0.035] p-3">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ArrowUp className="size-3.5 text-violet-300" /> Yükleme
            </span>
            <p className="mt-2 text-sm font-semibold tabular-nums">
              {formatTransferRate(metrics.uploadBytesPerSecond)}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-white/8 pt-3 text-xs text-muted-foreground">
          <span>Toplam ↓ {formatBytes(metrics.receivedBytes)}</span>
          <span>↑ {formatBytes(metrics.transmittedBytes)}</span>
        </div>
        <div className="border-t border-white/8 pt-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Yerel cihazlar</span>
            <span className="font-medium tabular-nums">{neighbors.length}</span>
          </div>
          {neighbors.length > 0 ? (
            <div className="mt-2 space-y-1.5">
              {neighbors.slice(0, 4).map((neighbor) => (
                <div className="flex items-center justify-between gap-3 text-xs" key={`${neighbor.ipAddress}-${neighbor.macAddress}`}>
                  <span className="truncate font-mono">{neighbor.ipAddress}</span>
                  <span className={cn('shrink-0', neighbor.state === 'reachable' ? 'text-emerald-300' : 'text-muted-foreground')}>
                    {neighbor.state === 'reachable' ? 'Ulaşılabilir' : neighbor.state === 'stale' ? 'Eski kayıt' : 'Bilinmiyor'}
                  </span>
                </div>
              ))}
              {neighbors.length > 4 && <p className="pt-1 text-[11px] text-muted-foreground">+{neighbors.length - 4} cihaz daha</p>}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">Komşu tablosunda cihaz gözlenmedi.</p>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Güncellendi: {formatMeasurementDate(metrics.collectedAt)}
        </p>
      </CardContent>
    </Card>
  )
}

function App() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDark, setIsDark] = useState(true)
  const [streamConnected, setStreamConnected] = useState(false)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      setData(await getDashboardData())
    } catch {
      setError('API bağlantısı kurulamadı. API servisinin çalıştığını kontrol et.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let isCurrent = true

    getDashboardData()
      .then((dashboardData) => {
        if (isCurrent) setData(dashboardData)
      })
      .catch(() => {
        if (isCurrent) {
          setError(
            'API bağlantısı kurulamadı. API servisinin çalıştığını kontrol et.',
          )
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false)
      })

    return () => {
      isCurrent = false
    }
  }, [])

  useEffect(() => {
    let isCurrent = true
    let hasConnectedOnce = false
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined
    let socket: WebSocket | undefined

    function connect() {
      if (!isCurrent) return
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      socket = new WebSocket(`${protocol}//${window.location.host}/ws`)
      socket.onopen = () => {
        if (!isCurrent) return
        setStreamConnected(true)
        const isReconnect = hasConnectedOnce
        hasConnectedOnce = true
        if (!isReconnect) return
        void getDashboardData()
          .then((dashboardData) => {
            if (!isCurrent) return
            setData(dashboardData)
            setError(null)
          })
          .catch(() => {
            // The stream can recover independently; keep the last good snapshot.
          })
      }
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as {
            type?: string
            data?: SystemMetrics | NetworkMetrics | WeightMeasurement
          }
          if (!message.data) return

          if (message.type === 'system.metrics') {
            const metrics = message.data as SystemMetrics
            setData((current) => (current ? { ...current, system: metrics } : current))
          }

          if (message.type === 'network.metrics') {
            const network = message.data as NetworkMetrics
            setData((current) => (current ? { ...current, network } : current))
          }

          if (message.type === 'weight.measurement') {
            const measurement = message.data as WeightMeasurement
            setData((current) => {
              if (!current) return current
              const measurements = mergeMeasurement(current.measurements, measurement, 7)
              const chartMeasurements = mergeMeasurement(
                current.chartMeasurements,
                measurement,
                30,
              )
              return {
                ...current,
                latest: measurements[0] ?? measurement,
                measurements,
                chartMeasurements,
              }
            })
          }
        } catch {
          // Ignore malformed stream messages and keep the current snapshot.
        }
      }
      socket.onclose = () => {
        if (isCurrent) {
          setStreamConnected(false)
          reconnectTimer = setTimeout(connect, 2_000)
        }
      }
      socket.onerror = () => setStreamConnected(false)
    }

    connect()
    return () => {
      isCurrent = false
      if (reconnectTimer) clearTimeout(reconnectTimer)
      socket?.close()
    }
  }, [])

  const today = useMemo(
    () =>
      new Intl.DateTimeFormat('tr-TR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }).format(new Date()),
    [],
  )

  function toggleTheme() {
    document.documentElement.classList.toggle('dark')
    setIsDark(document.documentElement.classList.contains('dark'))
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(16,185,129,0.09),transparent_32%),radial-gradient(circle_at_100%_20%,rgba(56,189,248,0.06),transparent_30%)]" />
      <Sidebar />

      <div className="relative lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-white/6 bg-background/75 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-10">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <div className="flex items-center gap-3 lg:hidden">
              <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-400 text-emerald-950">
                <CircuitBoard className="size-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">Raspi Center</p>
                <p className="text-[10px] text-muted-foreground">Pi 5 online</p>
              </div>
            </div>
            <div className="hidden items-center gap-2 text-xs text-muted-foreground lg:flex">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              Yerel kontrol merkezi
            </div>
            <div className="flex items-center gap-2">
              <Button
                aria-label="Temayı değiştir"
                onClick={toggleTheme}
                size="icon"
                variant="ghost"
              >
                {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </Button>
              <Button
                disabled={isLoading}
                onClick={() => void loadData()}
                size="sm"
                variant="outline"
              >
                <RefreshCw
                  className={cn('size-3.5', isLoading && 'animate-spin')}
                />
                <span className="hidden sm:inline">Yenile</span>
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 pb-28 pt-8 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">
          <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm capitalize text-muted-foreground">{today}</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                Kontrol sende.
              </h1>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground sm:text-right">
              Raspberry Pi altyapın, cihazların ve kişisel verilerin tek yerde.
            </p>
          </div>

          {isLoading && !data ? (
            <LoadingDashboard />
          ) : error && !data ? (
            <Card className="border-red-400/15 bg-red-400/5 py-10 text-center">
              <CardContent>
                <Activity className="mx-auto size-8 text-red-300" />
                <h2 className="mt-4 text-lg font-semibold">Bağlantı kurulamadı</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                  {error}
                </p>
                <Button className="mt-5" onClick={() => void loadData()}>
                  Tekrar dene
                </Button>
              </CardContent>
            </Card>
          ) : data ? (
            <div className="space-y-4">
              {error && (
                <div
                  aria-live="polite"
                  className="flex items-center gap-3 rounded-2xl border border-amber-400/15 bg-amber-400/5 px-4 py-3 text-sm text-amber-100"
                  role="status"
                >
                  <Activity className="size-4 shrink-0 text-amber-300" />
                  Son yenileme başarısız oldu; ekranda son alınan veriler gösteriliyor.
                </div>
              )}
              <div className="grid gap-4 lg:grid-cols-3">
                <WeightCard data={data} />
                <StatusCard data={data} streamConnected={streamConnected} />
                <HistoryCard measurements={data.measurements} />
                <WeightTrendCard measurements={data.chartMeasurements} />
                <SystemCard metrics={data.system} />
                <NetworkCard metrics={data.network} neighbors={data.neighbors} />
                <UpcomingCard />
              </div>
            </div>
          ) : null}
        </main>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-30 flex items-center justify-around rounded-2xl border border-white/10 bg-background/90 p-2 shadow-2xl backdrop-blur-xl lg:hidden">
        {navigation.slice(0, 4).map(({ label, icon: Icon, active }) => (
          <button
            className={cn(
              'flex min-w-16 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[10px]',
              active ? 'bg-white/8 text-emerald-400' : 'text-muted-foreground',
            )}
            key={label}
            type="button"
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}

export default App
