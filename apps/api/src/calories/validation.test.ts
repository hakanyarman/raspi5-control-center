import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { calendarDateInTimeZone, isCalendarDate, isDateRange, isPositiveBigIntId, isTimestampWithTimezone } from './validation'

describe('calorie request validation', () => {
  it('accepts real calendar dates and rejects impossible dates', () => {
    assert.equal(isCalendarDate('2024-02-29'), true)
    assert.equal(isCalendarDate('2026-02-29'), false)
    assert.equal(isCalendarDate('2026-13-01'), false)
    assert.equal(isCalendarDate('0000-01-01'), false)
  })

  it('requires an ordered and bounded date range', () => {
    assert.equal(isDateRange('2026-08-01', '2026-09-01'), true)
    assert.equal(isDateRange('2026-09-01', '2026-09-01'), false)
    assert.equal(isDateRange('2026-09-02', '2026-09-01'), false)
    assert.equal(isDateRange('2025-01-01', '2026-09-01'), false)
  })

  it('requires timestamps with an explicit timezone', () => {
    assert.equal(isTimestampWithTimezone('2026-09-02T12:30:00.000Z'), true)
    assert.equal(isTimestampWithTimezone('2026-09-02T15:30:00+03:00'), true)
    assert.equal(isTimestampWithTimezone('2026-09-02T12:30:00'), false)
    assert.equal(isTimestampWithTimezone('not-a-date'), false)
  })

  it('accepts only positive PostgreSQL BIGINT identifiers', () => {
    assert.equal(isPositiveBigIntId('1'), true)
    assert.equal(isPositiveBigIntId('9223372036854775807'), true)
    assert.equal(isPositiveBigIntId('0'), false)
    assert.equal(isPositiveBigIntId('9223372036854775808'), false)
    assert.equal(isPositiveBigIntId('abc'), false)
  })

  it('derives the Istanbul calendar date at the UTC day boundary', () => {
    assert.equal(
      calendarDateInTimeZone(new Date('2026-09-01T21:30:00.000Z'), 'Europe/Istanbul'),
      '2026-09-02',
    )
  })
})
