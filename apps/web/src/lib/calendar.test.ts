import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { calendarDate, shiftCalendarDate } from './calendar'

describe('calendarDate', () => {
  it('uses the configured calendar timezone instead of the UTC date', () => {
    const instant = new Date('2026-09-01T21:30:00.000Z')

    assert.equal(calendarDate(instant, 0, 'Europe/Istanbul'), '2026-09-02')
  })

  it('applies calendar-day offsets across month boundaries', () => {
    const instant = new Date('2026-09-01T21:30:00.000Z')

    assert.equal(calendarDate(instant, -2, 'Europe/Istanbul'), '2026-08-31')
  })

  it('shifts a calendar date without depending on the machine timezone', () => {
    assert.equal(shiftCalendarDate('2026-03-01', -1), '2026-02-28')
  })
})
