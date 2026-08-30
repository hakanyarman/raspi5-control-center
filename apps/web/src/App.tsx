import {
  Activity,
  Boxes,
  CircuitBoard,
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
  Wifi,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

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
  type WeightMeasurement,
} from '@/lib/api'
import { cn } from '@/lib/utils'

const navigation = [
  { label: 'Genel Bakış', icon: LayoutDashboard, active: true },
  { label: 'Sistem', icon: Gauge },
  { label: 'Ağ', icon: Network },
  { label: 'Depolama', icon: HardDrive },
  { label: 'Servisler', icon: Boxes },
]

const upcomingModules = [
  {
    title: 'Sistem',
    description: 'CPU sıcaklığı, RAM ve fan durumu',
    icon: Gauge,
  },
  {
    title: 'Ağ',
    description: 'LAN cihazları ve bağlantı görünürlüğü',
    icon: Wifi,
  },
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

function getWeightDifference(measurements: WeightMeasurement[]): number | null {
  if (measurements.length < 2) return null
  return measurements[0].weightKg - measurements[1].weightKg
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
        {navigation.map(({ label, icon: Icon, active }) => (
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
            {!active && (
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

function StatusCard({ data }: { data: DashboardData }) {
  return (
    <Card className="border-white/8 bg-card/60 shadow-none backdrop-blur-xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex size-10 items-center justify-center rounded-xl bg-sky-400/10 text-sky-400">
            <Activity className="size-5" />
          </div>
          <Badge
            className="border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
            variant="outline"
          >
            <span className="mr-1.5 size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            Çevrimiçi
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

function App() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDark, setIsDark] = useState(true)

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
          ) : error ? (
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
            <div className="grid gap-4 lg:grid-cols-3">
              <WeightCard data={data} />
              <StatusCard data={data} />
              <HistoryCard measurements={data.measurements} />
              <UpcomingCard />
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
