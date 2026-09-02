export const APP_TIME_ZONE = 'Europe/Istanbul'

export function calendarDate(date = new Date(), offsetDays = 0, timeZone = APP_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return shiftCalendarDate(`${values.year}-${values.month}-${values.day}`, offsetDays)
}

export function shiftCalendarDate(value: string, offsetDays: number): string {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 1, day! + offsetDays)).toISOString().slice(0, 10)
}
