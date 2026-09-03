import {
  AlertCircle,
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
  Flame,
  FileText,
  Video,
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
  getServicesStatus,
  getStorageInventory,
  getCalorieSummary,
  getCalorieEntries,
  getCalorieHistory,
  createCalorieEntry,
  deleteCalorieEntry,
  saveProfile,
  getProfile,
  getFiles,
  getFileDownloadUrl,
  type DashboardData,
  type LanNeighborObservation,
  type NetworkMetrics,
  type StorageMetrics,
  type StorageInventory,
  type ServicesStatus,
  type SystemMetrics,
  type WeightMeasurement,
  type CalorieSummary,
  type CalorieEntry,
  type DailyCalorieTotal,
  type UserProfile,
  type FileListing,
} from '@/lib/api'
import { calendarDate, shiftCalendarDate } from '@/lib/calendar'
import { cn } from '@/lib/utils'

type DashboardSection = 'overview' | 'system' | 'network' | 'storage' | 'services' | 'calories' | 'files' | 'camera'

const navigation = [
  { id: 'overview', label: 'Genel Bakış', icon: LayoutDashboard },
  { id: 'system', label: 'Sistem', icon: Gauge },
  { id: 'network', label: 'Ağ', icon: Network },
  { id: 'storage', label: 'Depolama', icon: HardDrive },
  { id: 'services', label: 'Servisler', icon: Boxes },
  { id: 'calories', label: 'Kalori', icon: Flame },
  { id: 'files', label: 'Dosyalar', icon: FileText },
  { id: 'camera', label: 'Kamera', icon: Video },
] satisfies Array<{ id: DashboardSection; label: string; icon: typeof LayoutDashboard }>

const sectionCopy: Record<DashboardSection, { title: string; description: string }> = {
  overview: { title: 'Kontrol sende.', description: 'Raspberry Pi altyapın, cihazların ve kişisel verilerin tek yerde.' },
  system: { title: 'Sistem', description: 'Raspberry Pi sıcaklık, fan, işlemci ve bellek durumu.' },
  network: { title: 'Ağ', description: 'Bağlantı, trafik ve yerel ağda gözlenen cihazlar.' },
  storage: { title: 'Depolama', description: 'NVMe ve bağlı disklerin salt-okunur kapasite görünümü.' },
  services: { title: 'Servisler', description: 'Docker container ve uygulama süreçlerinin canlı durumu.' },
  calories: { title: 'Kalori', description: 'Öğün kayıtları, günlük toplam ve enerji ihtiyacı.' },
  files: { title: 'Dosyalar', description: 'Özel NVMe klasöründeki dosyaların salt-okunur görünümü.' },
  camera: { title: 'Kamera', description: 'Odanın tailnet üzerinden canlı kamera görüntüsü.' },
}

function sectionFromLocation(): DashboardSection {
  const requested = window.location.hash.replace(/^#\/?/, '')
  return navigation.some(({ id }) => id === requested)
    ? requested as DashboardSection
    : 'overview'
}

const upcomingModules: Array<{ title: string; description: string; icon: typeof Boxes }> = []

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

function Sidebar({ activeSection, onSelect }: { activeSection: DashboardSection; onSelect: (section: DashboardSection) => void }) {
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
        {navigation.map(({ id, label, icon: Icon }) => {
          const active = id === activeSection
          return (
          <button
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
              active
                ? 'bg-white/8 text-foreground'
                : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
            )}
            key={label}
            onClick={() => onSelect(id)}
            type="button"
          >
            <Icon className={cn('size-4', active && 'text-emerald-400')} />
            <span>{label}</span>
          </button>
          )
        })}
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

function UnavailableModuleCard({ title }: { title: string }) {
  return (
    <Card className="border-amber-400/15 bg-amber-400/5 shadow-none">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Bu modülün verisi şu anda okunamadı.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-amber-100">
        Diğer dashboard verileri çalışmaya devam ediyor. Yenile düğmesiyle tekrar deneyebilirsin.
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

function StorageCard({ metrics }: { metrics: StorageMetrics }) {
  const storageStatus = metrics.usagePercent >= 90
    ? { label: 'Kritik', className: 'text-red-300' }
    : metrics.usagePercent >= 75
      ? { label: 'Doluyor', className: 'text-amber-300' }
      : { label: 'Sağlıklı', className: 'text-emerald-300' }

  return (
    <Card className="border-white/8 bg-card/60 shadow-none backdrop-blur-xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex size-10 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300">
            <HardDrive className="size-5" />
          </div>
          <Badge className={cn('border-white/10', storageStatus.className)} variant="outline">
            {storageStatus.label}
          </Badge>
        </div>
        <CardTitle className="mt-5">Depolama</CardTitle>
        <CardDescription className="truncate" title={metrics.model ?? metrics.drivePath}>
          {metrics.model ?? metrics.drivePath}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-end justify-between gap-3">
            <span className="text-3xl font-semibold tabular-nums">%{metrics.usagePercent}</span>
            <span className="pb-1 text-xs text-muted-foreground">{formatBytes(metrics.usedBytes)} kullanılıyor</span>
          </div>
          <MetricBar value={metrics.usagePercent} className="bg-amber-400" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white/[0.035] p-3">
            <p className="text-xs text-muted-foreground">Toplam</p>
            <p className="mt-1 font-semibold tabular-nums">{formatBytes(metrics.totalBytes)}</p>
          </div>
          <div className="rounded-xl bg-white/[0.035] p-3">
            <p className="text-xs text-muted-foreground">Kullanılabilir</p>
            <p className="mt-1 font-semibold tabular-nums">{formatBytes(metrics.availableBytes)}</p>
          </div>
        </div>
        <div className="space-y-2 border-t border-white/8 pt-3 text-xs">
          <div className="flex justify-between gap-3"><span className="text-muted-foreground">Cihaz</span><span className="font-mono">{metrics.devicePath}</span></div>
          <div className="flex justify-between gap-3"><span className="text-muted-foreground">Filesystem</span><span>{metrics.filesystem} · {metrics.mountPoint}</span></div>
          <div className="flex justify-between gap-3"><span className="text-muted-foreground">Bağlantı</span><span className="uppercase">{metrics.transport ?? 'N/A'}</span></div>
        </div>
        <p className="text-[11px] text-muted-foreground">Güncellendi: {formatMeasurementDate(metrics.collectedAt)}</p>
      </CardContent>
    </Card>
  )
}

function StorageDevicesCard({ inventory }: { inventory: StorageInventory }) {
  return (
    <Card className="border-white/8 bg-card/60 shadow-none backdrop-blur-xl lg:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex size-10 items-center justify-center rounded-xl bg-orange-400/10 text-orange-300">
            <Database className="size-5" />
          </div>
          <Badge className={cn('border-white/10', inventory.externalDriveConnected ? 'text-emerald-300' : 'text-amber-300')} variant="outline">
            {inventory.externalDriveConnected ? 'Harici disk bağlı' : 'Harici disk algılanmadı'}
          </Badge>
        </div>
        <CardTitle className="mt-5">Bağlı diskler</CardTitle>
        <CardDescription>Salt-okunur block device ve mount envanteri</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {inventory.devices.map((device) => (
          <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-4" key={device.path}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium">{device.model ?? device.path}</p>
                  {device.isRoot && <Badge variant="secondary">Root</Badge>}
                  {device.isExternal && <Badge variant="secondary">Harici</Badge>}
                  {device.readOnly && <Badge variant="secondary">Read-only</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{device.path} · {(device.transport ?? 'unknown').toUpperCase()}</p>
              </div>
              <p className="shrink-0 text-sm font-semibold tabular-nums">{formatBytes(device.sizeBytes)}</p>
            </div>
            <div className="mt-3 space-y-2 border-t border-white/8 pt-3">
              {device.volumes.map((volume) => (
                <div className="grid gap-1 text-xs sm:grid-cols-[1fr_1fr_auto] sm:items-center" key={volume.path}>
                  <span className="font-mono">{volume.path}</span>
                  <span className="text-muted-foreground">{volume.filesystem ?? 'Filesystem yok'} · {volume.mountPoint ?? 'Bağlı değil'}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {volume.usagePercent === null ? formatBytes(volume.partitionSizeBytes) : `%${volume.usagePercent} · ${formatBytes(volume.availableBytes)} boş`}
                  </span>
                </div>
              ))}
              {device.volumes.length === 0 && <p className="text-xs text-muted-foreground">Filesystem bölümü algılanmadı.</p>}
            </div>
          </div>
        ))}
        {inventory.devices.length === 0 && <p className="text-sm text-muted-foreground">Fiziksel disk algılanmadı.</p>}
        {!inventory.externalDriveConnected && (
          <p className="rounded-xl border border-amber-400/10 bg-amber-400/5 p-3 text-xs text-amber-100">
            Belgelenmiş harici HDD şu anda işletim sistemi tarafından algılanmıyor; herhangi bir mount veya disk işlemi yapılmadı.
          </p>
        )}
        <p className="text-[11px] text-muted-foreground">Güncellendi: {formatMeasurementDate(inventory.collectedAt)}</p>
      </CardContent>
    </Card>
  )
}

function ServicesCard({ status }: { status: ServicesStatus }) {
  const healthyProcesses = status.processes.filter((service) => service.active).length
  const runningContainers = status.containers.filter((container) => container.state === 'running').length
  const readyContainers = status.containers.filter((container) =>
    container.state === 'running' && (container.health === 'healthy' || container.health === 'none'),
  ).length
  const processesHealthy = healthyProcesses === status.processes.length
  const runningContainersReady = readyContainers === runningContainers
  const needsAttention = !processesHealthy || !status.dockerAvailable || !runningContainersReady
  const summary = needsAttention
    ? 'Kontrol gerekli'
    : runningContainers < status.containers.length
      ? `${runningContainers}/${status.containers.length} çalışıyor`
      : 'Tümü çalışıyor'

  return (
    <Card className="border-white/8 bg-card/60 shadow-none backdrop-blur-xl lg:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300">
            <Server className="size-5" />
          </div>
          <Badge className={cn('border-white/10', needsAttention ? 'text-amber-300' : 'text-emerald-300')} variant="outline">
            {summary}
          </Badge>
        </div>
        <CardTitle className="mt-5">Servisler</CardTitle>
        <CardDescription>Uygulama süreçleri ve Docker container'ları</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-2 sm:grid-cols-3">
          {status.processes.map((service) => (
            <div className="rounded-xl bg-white/[0.035] p-3" key={service.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{service.label}</span>
                <span className={cn('flex items-center gap-1.5 text-[11px]', service.active ? 'text-emerald-300' : 'text-red-300')}>
                  <span className={cn('size-2 rounded-full', service.active ? 'bg-emerald-400' : 'bg-red-400')} />
                  {service.active ? 'Aktif' : 'Pasif'}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{service.detail}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {service.uptimeSeconds === null
                  ? service.state
                  : `${formatUptime(service.uptimeSeconds)} · ${service.restarts === null ? 'Restart N/A' : `${service.restarts} restart`}`}
                {service.pid !== null ? ` · PID ${service.pid}` : ''}
              </p>
            </div>
          ))}
        </div>
        <div className="space-y-2 border-t border-white/8 pt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 font-medium"><Boxes className="size-4 text-sky-300" /> Docker</span>
            <span className="text-xs text-muted-foreground">{status.dockerAvailable ? `${runningContainers}/${status.containers.length} çalışıyor` : 'Okunamadı'}</span>
          </div>
          {status.containers.map((container) => {
            const exposedToAllInterfaces = container.ports?.includes('0.0.0.0') || container.ports?.includes('[::]')
            const ready = container.state === 'running' && (container.health === 'healthy' || container.health === 'none')
            const warning = container.state === 'running' && !ready && container.health !== 'unhealthy'
            return (
            <div className="grid gap-2 rounded-xl bg-white/[0.035] p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center" key={container.id}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn('size-2 shrink-0 rounded-full', ready ? 'bg-emerald-400' : warning ? 'bg-amber-400' : 'bg-red-400')} />
                  <p className="truncate text-sm font-medium">{container.name}</p>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {container.image} · {container.status}{container.health !== 'none' ? ` · ${container.health}` : ''}
                </p>
                <p className={cn('mt-1 truncate font-mono text-[11px]', exposedToAllInterfaces ? 'text-amber-300' : 'text-muted-foreground')}>
                  {container.ports ?? 'Port yayınlanmıyor'}
                </p>
              </div>
              <div className="text-xs text-muted-foreground sm:text-right">
                <p>CPU {container.cpuPercent === null ? 'N/A' : `%${container.cpuPercent}`}</p>
                <p>{container.memoryUsage ?? 'RAM N/A'}</p>
              </div>
              <div className="text-xs text-muted-foreground sm:min-w-24 sm:text-right">
                <p>{container.pids === null ? 'Process N/A' : `${container.pids} process`}</p>
                <p>{container.restartCount === null ? 'Restart N/A' : `${container.restartCount} restart`}</p>
                <p>Ağ: {container.networkIo ?? 'N/A'}</p>
                <p>Disk: {container.blockIo ?? 'N/A'}</p>
              </div>
            </div>
            )
          })}
          {status.dockerAvailable && status.containers.length === 0 && (
            <p className="rounded-xl bg-white/[0.035] p-3 text-xs text-muted-foreground">Çalışan container yok.</p>
          )}
          {!status.dockerAvailable && (
            <p className="rounded-xl border border-amber-400/10 bg-amber-400/5 p-3 text-xs text-amber-100">
              Docker durumu okunamadı; API, web ve tartı servisleri bağımsız olarak gösterilmeye devam ediyor.
            </p>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">10 saniyede bir yenilenir · {formatMeasurementDate(status.collectedAt)}</p>
      </CardContent>
    </Card>
  )
}

interface CalorieDashboardSnapshot {
  summary: CalorieSummary
  entries: CalorieEntry[]
  history: DailyCalorieTotal[]
  profile: UserProfile | null
}

const mealLabels: Record<CalorieEntry['mealType'], string> = {
  breakfast: 'Kahvaltı',
  lunch: 'Öğle',
  dinner: 'Akşam',
  snack: 'Ara öğün',
}

async function getCalorieDashboardSnapshot(today: string): Promise<CalorieDashboardSnapshot> {
  const [summary, entries, history, profile] = await Promise.all([
    getCalorieSummary(today),
    getCalorieEntries(today, shiftCalendarDate(today, 1)),
    getCalorieHistory(shiftCalendarDate(today, -29), shiftCalendarDate(today, 1)),
    getProfile(),
  ])
  return { summary, entries, history, profile }
}

function CalorieSection() {
  const [summary, setSummary] = useState<CalorieSummary | null>(null)
  const [entries, setEntries] = useState<CalorieEntry[]>([])
  const [history, setHistory] = useState<DailyCalorieTotal[]>([])
  const [profile, setProfile] = useState<UserProfile>({ heightCm: null, birthDate: null, sex: null, activityLevel: null })
  const [calories, setCalories] = useState('500')
  const [mealType, setMealType] = useState<CalorieEntry['mealType']>('breakfast')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [today, setToday] = useState(() => calendarDate())

  function applySnapshot(snapshot: CalorieDashboardSnapshot): void {
    setSummary(snapshot.summary)
    setEntries(snapshot.entries)
    setHistory(snapshot.history)
    setProfile(snapshot.profile ?? { heightCm: null, birthDate: null, sex: null, activityLevel: null })
  }

  useEffect(() => {
    const interval = window.setInterval(() => {
      const nextDate = calendarDate()
      setToday((currentDate) => currentDate === nextDate ? currentDate : nextDate)
    }, 60_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    let active = true
    void getCalorieDashboardSnapshot(today)
      .then((snapshot) => {
        if (!active) return
        applySnapshot(snapshot)
        setError(null)
      })
      .catch(() => {
        if (active) setError('Kalori verileri alınamadı. API ve veritabanı bağlantısını kontrol et.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [today])

  async function refresh(): Promise<void> {
    applySnapshot(await getCalorieDashboardSnapshot(today))
  }

  async function submitEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const caloriesKcal = Number(calories)
    if (!Number.isInteger(caloriesKcal) || caloriesKcal < 1 || caloriesKcal > 10000) {
      setError('Kalori değeri 1 ile 10000 arasında tam sayı olmalı.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await createCalorieEntry({ mealType, description: description.trim(), caloriesKcal, consumedAt: new Date().toISOString() })
      setDescription('')
      try {
        await refresh()
      } catch {
        setError('Kalori kaydı eklendi ancak ekran yenilenemedi. Tekrar dene ile listeyi yenileyebilirsin.')
      }
    } catch {
      setError('Kalori kaydı eklenemedi. Bilgileri kontrol edip tekrar dene.')
    } finally {
      setBusy(false)
    }
  }

  async function submitProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const saved = await saveProfile(profile)
      setProfile(saved)
      try {
        await refresh()
      } catch {
        setError('Profil kaydedildi ancak özet yenilenemedi. Tekrar dene ile özeti yenileyebilirsin.')
      }
    } catch {
      setError('Profil kaydedilemedi. Boy ve doğum tarihi bilgilerini kontrol et.')
    } finally {
      setBusy(false)
    }
  }

  async function removeEntry(entry: CalorieEntry): Promise<void> {
    if (!window.confirm(`“${entry.description || mealLabels[entry.mealType]}” kaydını silmek istiyor musun?`)) return
    setBusy(true)
    setError(null)
    try {
      await deleteCalorieEntry(entry.id)
      try {
        await refresh()
      } catch {
        setEntries((currentEntries) => currentEntries.filter(({ id }) => id !== entry.id))
        setError('Kayıt silindi ancak özet yenilenemedi. Tekrar dene ile verileri yenileyebilirsin.')
      }
    } catch {
      setError('Kalori kaydı silinemedi. Sayfayı yenileyip tekrar dene.')
    } finally {
      setBusy(false)
    }
  }

  const inputClassName = 'w-full rounded-xl border border-white/10 bg-background px-3 py-2 text-sm'

  return (
    <div className="space-y-4 lg:col-span-2">
      {error && (
        <div aria-live="polite" className="flex items-center gap-2 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
          <Button className="ml-auto" onClick={() => void refresh().then(() => setError(null)).catch(() => undefined)} size="sm" variant="outline">Tekrar dene</Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-emerald-400/15 bg-emerald-400/10 shadow-none">
          <CardHeader><CardDescription>Bugünün toplamı</CardDescription><CardTitle className="text-4xl">{loading ? '…' : `${summary?.totalCaloriesKcal ?? 0} kcal`}</CardTitle></CardHeader>
        </Card>
        <Card className="border-white/8 bg-card/60 shadow-none">
          <CardHeader><CardDescription>BMR</CardDescription><CardTitle className="text-4xl">{summary?.bmrKcal ? `${summary.bmrKcal} kcal` : '—'}</CardTitle><CardDescription>{summary?.bmrStatus === 'available' ? 'Son tartı ölçümünden hesaplandı.' : 'Profil ve son kilo ölçümü gerekli.'}</CardDescription></CardHeader>
        </Card>
        <Card className="border-white/8 bg-card/60 shadow-none">
          <CardHeader><CardDescription>Günlük ihtiyaç (TDEE)</CardDescription><CardTitle className="text-4xl">{summary?.tdeeKcal ? `${summary.tdeeKcal} kcal` : '—'}</CardTitle><CardDescription>{summary?.bmrKcal && !summary.tdeeKcal ? 'Aktivite seviyesi seçilmeli.' : 'BMR ve aktivite seviyesine göre.'}</CardDescription></CardHeader>
        </Card>
        <Card className="border-white/8 bg-card/60 shadow-none">
          <CardHeader><CardDescription>Son ağırlık</CardDescription><CardTitle className="text-4xl">{summary?.latestWeight ? `${formatWeight(summary.latestWeight.weightKg)} kg` : '—'}</CardTitle></CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-white/8 bg-card/60 shadow-none">
          <CardHeader><CardTitle>Öğün ekle</CardTitle><CardDescription>Kalori kaydını manuel gir.</CardDescription></CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={(event) => void submitEntry(event)}>
              <label className="block space-y-1 text-sm"><span>Öğün</span><select className={inputClassName} value={mealType} onChange={(event) => setMealType(event.target.value as CalorieEntry['mealType'])}><option value="breakfast">Kahvaltı</option><option value="lunch">Öğle</option><option value="dinner">Akşam</option><option value="snack">Ara öğün</option></select></label>
              <label className="block space-y-1 text-sm"><span>Açıklama</span><input className={inputClassName} maxLength={200} placeholder="Örn. tavuklu salata" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
              <label className="block space-y-1 text-sm"><span>Kalori (kcal)</span><input className={inputClassName} max="10000" min="1" required step="1" type="number" value={calories} onChange={(event) => setCalories(event.target.value)} /></label>
              <Button disabled={busy} type="submit">{busy ? 'Kaydediliyor…' : 'Kaydet'}</Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-white/8 bg-card/60 shadow-none">
          <CardHeader><CardTitle>Profil</CardTitle><CardDescription>BMR ve günlük enerji ihtiyacı hesabında kullanılır.</CardDescription></CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={(event) => void submitProfile(event)}>
              <label className="block space-y-1 text-sm"><span>Boy (cm)</span><input className={inputClassName} max="250" min="80" required step="0.1" type="number" value={profile.heightCm ?? ''} onChange={(event) => setProfile({ ...profile, heightCm: event.target.value ? Number(event.target.value) : null })} /></label>
              <label className="block space-y-1 text-sm"><span>Doğum tarihi</span><input className={inputClassName} max={today} required type="date" value={profile.birthDate ?? ''} onChange={(event) => setProfile({ ...profile, birthDate: event.target.value || null })} /></label>
              <label className="block space-y-1 text-sm"><span>Cinsiyet</span><select className={inputClassName} required value={profile.sex ?? ''} onChange={(event) => setProfile({ ...profile, sex: (event.target.value || null) as UserProfile['sex'] })}><option value="">Seç</option><option value="male">Erkek</option><option value="female">Kadın</option></select></label>
              <label className="block space-y-1 text-sm"><span>Aktivite seviyesi</span><select className={inputClassName} value={profile.activityLevel ?? ''} onChange={(event) => setProfile({ ...profile, activityLevel: (event.target.value || null) as UserProfile['activityLevel'] })}><option value="">Seçme (yalnızca BMR)</option><option value="sedentary">Hareketsiz</option><option value="light">Hafif aktif</option><option value="moderate">Orta aktif</option><option value="very_active">Çok aktif</option><option value="extra_active">Ekstra aktif</option></select></label>
              <Button disabled={busy || !profile.heightCm || !profile.birthDate || !profile.sex} type="submit">{busy ? 'Kaydediliyor…' : 'Profili kaydet'}</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="border-white/8 bg-card/60 shadow-none">
        <CardHeader><CardTitle>Kalori trendi</CardTitle><CardDescription>Son 30 günün günlük toplamı.</CardDescription></CardHeader>
        <CardContent>
          {history.length > 0 ? <div className="h-64"><ResponsiveContainer height="100%" width="100%"><LineChart data={history}><CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }} /><YAxis tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }} /><Tooltip formatter={(value) => [`${Number(value)} kcal`, 'Toplam']} /><Line dataKey="totalCaloriesKcal" dot={{ fill: '#f59e0b', r: 3 }} isAnimationActive={false} stroke="#f59e0b" strokeWidth={3} type="monotone" /></LineChart></ResponsiveContainer></div> : <p className="py-10 text-center text-sm text-muted-foreground">{loading ? 'Kalori geçmişi yükleniyor…' : 'Henüz kalori kaydı yok.'}</p>}
        </CardContent>
      </Card>

      <Card className="border-white/8 bg-card/60 shadow-none">
        <CardHeader><CardTitle>Bugünkü öğünler</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {entries.length === 0 ? <p className="text-sm text-muted-foreground">{loading ? 'Öğünler yükleniyor…' : 'Bugün kayıt yok.'}</p> : entries.map((entry) => <div className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.035] px-3 py-2 text-sm" key={entry.id}><span className="min-w-0 truncate">{entry.description || mealLabels[entry.mealType]}</span><span className="flex shrink-0 items-center gap-2 font-semibold">{entry.caloriesKcal} kcal <Button disabled={busy} onClick={() => void removeEntry(entry)} size="xs" variant="destructive">Sil</Button></span></div>)}
        </CardContent>
      </Card>
    </div>
  )
}

function FileBrowserSection() {
  const [path, setPath] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'name' | 'size' | 'modified'>('name')
  const [order, setOrder] = useState<'asc' | 'desc'>('asc')
  const [listing, setListing] = useState<FileListing | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try { setListing(await getFiles(path, search, sort, order)); setError(null) }
    catch { setError('Dosya kökü bulunamadı veya liste okunamadı. FILES_ROOT yapılandırmasını kontrol et.') }
    finally { setLoading(false) }
  }, [path, search, sort, order])

  useEffect(() => { void refresh() }, [refresh])
  const crumbs = path ? path.split('/') : []
  const formatFileSize = (value: number | null) => value === null ? 'Klasör' : formatBytes(value)

  return <div className="space-y-4 lg:col-span-2">
    <Card className="border-white/8 bg-card/60 shadow-none">
      <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>Dosyalar</CardTitle><CardDescription>Salt-okunur · yalnızca yapılandırılmış dosya kökü</CardDescription></div><Badge variant="secondary">{listing?.readOnly ? 'READ ONLY' : '—'}</Badge></div></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm"><button className="text-emerald-300 hover:underline" onClick={() => setPath('')} type="button">Kök</button>{crumbs.map((crumb, index) => <span className="flex items-center gap-2" key={`${crumb}-${index}`}><span className="text-muted-foreground">/</span><button className="text-emerald-300 hover:underline" onClick={() => setPath(crumbs.slice(0, index + 1).join('/'))} type="button">{crumb}</button></span>)}</div>
        <div className="flex flex-wrap gap-2"><input className="min-w-48 flex-1 rounded-xl border border-white/10 bg-background px-3 py-2 text-sm" placeholder="Dosya ara" value={search} onChange={(event) => setSearch(event.target.value)} /><select className="rounded-xl border border-white/10 bg-background px-3 py-2 text-sm" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="name">Ada göre</option><option value="size">Boyuta göre</option><option value="modified">Tarihe göre</option></select><Button onClick={() => setOrder(order === 'asc' ? 'desc' : 'asc')} size="sm" variant="outline">{order === 'asc' ? 'Artan' : 'Azalan'}</Button></div>
        {error && <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">{error}</div>}
        {loading ? <p className="py-8 text-center text-sm text-muted-foreground">Dosyalar yükleniyor…</p> : listing && <div className="space-y-1">{listing.entries.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Bu klasörde gösterilecek dosya yok.</p> : listing.entries.map((entry) => <div className="flex items-center gap-3 rounded-xl bg-white/[0.035] px-3 py-3" key={entry.relativePath}><FileText className={cn('size-4 shrink-0', entry.kind === 'directory' ? 'text-amber-300' : 'text-sky-300')} /><button className="min-w-0 flex-1 truncate text-left text-sm hover:text-emerald-300" onClick={() => entry.kind === 'directory' && setPath(entry.relativePath)} type="button">{entry.name}</button><span className="hidden text-xs text-muted-foreground sm:block">{formatFileSize(entry.sizeBytes)}</span><span className="hidden text-xs text-muted-foreground md:block">{formatMeasurementDate(entry.modifiedAt)}</span>{entry.kind === 'file' && <a className="text-xs text-emerald-300 hover:underline" href={getFileDownloadUrl(entry.relativePath)}>İndir</a>}</div>)}</div>}
      </CardContent>
    </Card>
  </div>
}

function CameraSection() {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  return <div className="space-y-4 lg:col-span-2">
    <Card className="overflow-hidden border-white/8 bg-card/60 shadow-none">
      <CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle>Oda kamerası</CardTitle><CardDescription>Canlı yayın · kayıt yapılmıyor · tailnet erişimi</CardDescription></div><Badge className={cn(loaded && !failed ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' : 'border-amber-400/20 bg-amber-400/10 text-amber-300')} variant="outline">{failed ? 'Ulaşılamıyor' : loaded ? 'Canlı' : 'Bağlanıyor'}</Badge></div></CardHeader>
      <CardContent className="p-0"><div className="aspect-video w-full bg-black"><video autoPlay className="size-full" controls muted playsInline onCanPlay={() => setLoaded(true)} onError={() => setFailed(true)} src="/camera-hls/room/index.m3u8?cookieCheck=1" /></div><p className="px-6 py-4 text-xs text-muted-foreground">Yayın yalnızca Kamera bölümünü açtığında başlar. Görüntü gelmezse kamera ve `raspi5-camera` servis durumunu kontrol et.</p></CardContent>
    </Card>
  </div>
}

function App() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDark, setIsDark] = useState(true)
  const [streamConnected, setStreamConnected] = useState(false)
  const [activeSection, setActiveSection] = useState<DashboardSection>(sectionFromLocation)
  const [services, setServices] = useState<ServicesStatus | null>(null)
  const [servicesLoading, setServicesLoading] = useState(true)

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
    const followHistory = () => setActiveSection(sectionFromLocation())
    window.addEventListener('popstate', followHistory)
    return () => window.removeEventListener('popstate', followHistory)
  }, [])

  useEffect(() => {
    if (activeSection !== 'storage') return
    const refreshStorage = () => {
      void getStorageInventory()
        .then((storageInventory) => setData((current) => current ? { ...current, storageInventory } : current))
        .catch(() => undefined)
    }
    refreshStorage()
    const interval = window.setInterval(refreshStorage, 30_000)
    return () => window.clearInterval(interval)
  }, [activeSection])

  useEffect(() => {
    let isCurrent = true
    const refreshServices = () => {
      void getServicesStatus()
        .then((nextServices) => {
          if (isCurrent) setServices(nextServices)
        })
        .catch(() => undefined)
        .finally(() => {
          if (isCurrent) setServicesLoading(false)
        })
    }
    refreshServices()
    const interval = window.setInterval(() => {
      refreshServices()
    }, 10_000)
    return () => {
      isCurrent = false
      window.clearInterval(interval)
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

  function refreshDashboard() {
    void loadData()
    void getServicesStatus()
      .then(setServices)
      .catch(() => undefined)
  }

  function selectSection(section: DashboardSection) {
    setActiveSection(section)
    const hash = section === 'overview' ? '' : `#${section}`
    window.history.pushState(null, '', `${window.location.pathname}${window.location.search}${hash}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const activeCopy = sectionCopy[activeSection]

  return (
    <div className="min-h-svh bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(16,185,129,0.09),transparent_32%),radial-gradient(circle_at_100%_20%,rgba(56,189,248,0.06),transparent_30%)]" />
      <Sidebar activeSection={activeSection} onSelect={selectSection} />

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
                onClick={refreshDashboard}
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
                {activeCopy.title}
              </h1>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground sm:text-right">
              {activeCopy.description}
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
              <div className={cn('grid gap-4', activeSection === 'overview' ? 'lg:grid-cols-3' : 'lg:grid-cols-2')}>
                {activeSection === 'overview' && <WeightCard data={data} />}
                {activeSection === 'overview' && <StatusCard data={data} streamConnected={streamConnected} />}
                {activeSection === 'overview' && <HistoryCard measurements={data.measurements} />}
                {activeSection === 'overview' && <WeightTrendCard measurements={data.chartMeasurements} />}
                {(activeSection === 'overview' || activeSection === 'system') && <SystemCard metrics={data.system} />}
                {(activeSection === 'overview' || activeSection === 'network') && <NetworkCard metrics={data.network} neighbors={data.neighbors} />}
                {(activeSection === 'overview' || activeSection === 'storage') && (
                  data.storage ? <StorageCard metrics={data.storage} /> : <UnavailableModuleCard title="Depolama" />
                )}
                {activeSection === 'storage' && data.storageInventory && <StorageDevicesCard inventory={data.storageInventory} />}
                {activeSection === 'storage' && !data.storageInventory && <UnavailableModuleCard title="Disk envanteri" />}
                {(activeSection === 'overview' || activeSection === 'services') && servicesLoading && (
                  <Skeleton className="h-72 rounded-3xl lg:col-span-2" />
                )}
                {(activeSection === 'overview' || activeSection === 'services') && !servicesLoading && (
                  services ? <ServicesCard status={services} /> : <UnavailableModuleCard title="Servisler" />
                )}
                {activeSection === 'calories' && <CalorieSection />}
                {activeSection === 'files' && <FileBrowserSection />}
                {activeSection === 'camera' && <CameraSection />}
                {activeSection === 'overview' && upcomingModules.length > 0 && <UpcomingCard />}
              </div>
            </div>
          ) : null}
        </main>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-30 flex items-center justify-around rounded-2xl border border-white/10 bg-background/90 p-2 shadow-2xl backdrop-blur-xl lg:hidden">
        {navigation.map(({ id, label, icon: Icon }) => {
          const active = id === activeSection
          return (
          <button
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px]',
              active ? 'bg-white/8 text-emerald-400' : 'text-muted-foreground',
            )}
            key={label}
            onClick={() => selectSection(id)}
            type="button"
          >
            <Icon className="size-4" />
            {label}
          </button>
          )
        })}
      </nav>
    </div>
  )
}

export default App
