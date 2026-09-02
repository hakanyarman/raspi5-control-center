const calendarDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/
const timestampWithTimezonePattern = /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/i
const maxBigIntId = 9_223_372_036_854_775_807n

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string') return false

  const match = calendarDatePattern.exec(value)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1) return false
  const parsed = new Date(Date.UTC(year, month - 1, day))

  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
}

export function isDateRange(from: string, to: string, maxDays = 366): boolean {
  const fromTime = Date.parse(`${from}T00:00:00Z`)
  const toTime = Date.parse(`${to}T00:00:00Z`)
  const durationDays = (toTime - fromTime) / 86_400_000
  return durationDays > 0 && durationDays <= maxDays
}

export function isTimestampWithTimezone(value: unknown): value is string {
  return typeof value === 'string'
    && timestampWithTimezonePattern.test(value)
    && Number.isFinite(Date.parse(value))
}

export function isPositiveBigIntId(value: string): boolean {
  if (!/^\d+$/.test(value)) return false

  try {
    const id = BigInt(value)
    return id >= 1n && id <= maxBigIntId
  } catch {
    return false
  }
}

export function calendarDateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}
