import type { DatabasePool } from '@raspi5-control-center/database'
import { Router } from 'express'
import { APP_TIMEZONE, createCalorieEntry, deleteCalorieEntry, getCalorieHistory, getCalorieSummary, getProfile, listCalorieEntries, upsertProfile } from '../calories/data'
import { calendarDateInTimeZone, isCalendarDate, isDateRange, isPositiveBigIntId, isTimestampWithTimezone } from '../calories/validation'

const mealTypes = new Set(['breakfast', 'lunch', 'dinner', 'snack'])
const activityLevels = new Set(['sedentary', 'light', 'moderate', 'very_active', 'extra_active'])
const maxDescriptionLength = 200

function parseRange(query: Record<string, unknown>): [string, string] | null {
  const { from, to } = query
  return isCalendarDate(from) && isCalendarDate(to) && isDateRange(from, to)
    ? [from, to]
    : null
}

export function createCaloriesRouter(pool: DatabasePool): Router {
  const router = Router()
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })
  router.get('/profile', async (_req, res, next) => { try { res.json(await getProfile(pool)) } catch (e) { next(e) } })
  router.put('/profile', async (req, res, next) => {
    const { heightCm, birthDate, sex, activityLevel = null } = req.body ?? {}
    const today = calendarDateInTimeZone(new Date(), APP_TIMEZONE)
    if (!(typeof heightCm === 'number' && Number.isFinite(heightCm) && heightCm >= 80 && heightCm <= 250 && isCalendarDate(birthDate) && birthDate <= today && (sex === 'male' || sex === 'female') && (activityLevel === null || activityLevels.has(activityLevel)))) { res.status(400).json({ error: 'Invalid profile' }); return }
    try { res.json(await upsertProfile(pool, { heightCm, birthDate, sex, activityLevel })) } catch (e) { next(e) }
  })
  router.get('/summary', async (req, res, next) => { const date = req.query.date; if (!isCalendarDate(date)) { res.status(400).json({ error: 'date must be a valid YYYY-MM-DD calendar date' }); return } try { res.json(await getCalorieSummary(pool, date)) } catch (e) { next(e) } })
  router.get('/history', async (req, res, next) => { const range = parseRange(req.query); if (!range) { res.status(400).json({ error: 'from/to must be valid dates with a range of 1 to 366 days' }); return } try { res.json(await getCalorieHistory(pool, ...range)) } catch (e) { next(e) } })
  router.get('/entries', async (req, res, next) => { const range = parseRange(req.query); if (!range) { res.status(400).json({ error: 'from/to must be valid dates with a range of 1 to 366 days' }); return } try { res.json(await listCalorieEntries(pool, ...range, 100)) } catch (e) { next(e) } })
  router.post('/entries', async (req, res, next) => {
    const { mealType, description = '', caloriesKcal, consumedAt } = req.body ?? {}
    if (!mealTypes.has(mealType) || typeof description !== 'string' || description.length > maxDescriptionLength || typeof caloriesKcal !== 'number' || !Number.isInteger(caloriesKcal) || caloriesKcal < 1 || caloriesKcal > 10000 || !isTimestampWithTimezone(consumedAt)) { res.status(400).json({ error: 'Invalid calorie entry' }); return }
    try { res.status(201).json(await createCalorieEntry(pool, { mealType, description: description.trim(), caloriesKcal, consumedAt })) } catch (e) { next(e) }
  })
  router.delete('/entries/:id', async (req, res, next) => { if (!isPositiveBigIntId(req.params.id)) { res.status(400).json({ error: 'Invalid entry id' }); return } try { if (!await deleteCalorieEntry(pool, req.params.id)) { res.status(404).json({ error: 'Entry not found' }); return } res.status(204).end() } catch (e) { next(e) } })
  return router
}
