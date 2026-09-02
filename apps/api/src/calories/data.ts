import type { DatabasePool } from '@raspi5-control-center/database'
import type { CalorieEntry, CalorieSummary, DailyCalorieTotal, MealType, UserProfile, WeightMeasurement } from '@raspi5-control-center/shared'
import { calculateBmr, calculateTdee } from './bmr'

export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? 'Europe/Istanbul'

interface ProfileRow { height_cm: string | null; birth_date: string | null; sex: UserProfile['sex']; activity_level: UserProfile['activityLevel'] }
interface EntryRow { id: string; meal_type: MealType; description: string; calories_kcal: number; consumed_at: Date }
interface WeightRow { id: string; weight_kg: string; measured_at: Date }

function toProfile(row: ProfileRow): UserProfile { return { heightCm: row.height_cm === null ? null : Number(row.height_cm), birthDate: row.birth_date, sex: row.sex, activityLevel: row.activity_level } }
function toEntry(row: EntryRow): CalorieEntry { return { id: row.id, mealType: row.meal_type, description: row.description, caloriesKcal: row.calories_kcal, consumedAt: row.consumed_at.toISOString() } }
function toWeight(row: WeightRow): WeightMeasurement { return { id: row.id, weightKg: Number(row.weight_kg), measuredAt: row.measured_at.toISOString() } }

export async function getProfile(pool: DatabasePool): Promise<UserProfile | null> {
  const result = await pool.query<ProfileRow>('SELECT height_cm, birth_date::text, sex, activity_level FROM public.user_profiles WHERE id = 1')
  return result.rows[0] ? toProfile(result.rows[0]) : null
}

export async function upsertProfile(pool: DatabasePool, profile: UserProfile): Promise<UserProfile> {
  const result = await pool.query<ProfileRow>(
    `INSERT INTO public.user_profiles (id, height_cm, birth_date, sex, activity_level)
     VALUES (1, $1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET height_cm = EXCLUDED.height_cm, birth_date = EXCLUDED.birth_date,
       sex = EXCLUDED.sex, activity_level = EXCLUDED.activity_level, updated_at = NOW()
     RETURNING height_cm, birth_date::text, sex, activity_level`,
    [profile.heightCm, profile.birthDate, profile.sex, profile.activityLevel],
  )
  return toProfile(result.rows[0]!)
}

export async function listCalorieEntries(pool: DatabasePool, from: string, to: string, limit: number): Promise<CalorieEntry[]> {
  const result = await pool.query<EntryRow>(
    `SELECT id, meal_type, description, calories_kcal, consumed_at FROM public.calorie_entries
     WHERE consumed_at >= $1::date AT TIME ZONE $3 AND consumed_at < $2::date AT TIME ZONE $3
     ORDER BY consumed_at DESC, id DESC LIMIT $4`, [from, to, APP_TIMEZONE, limit],
  )
  return result.rows.map(toEntry)
}

export async function createCalorieEntry(pool: DatabasePool, entry: Omit<CalorieEntry, 'id'>): Promise<CalorieEntry> {
  const result = await pool.query<EntryRow>(
    `INSERT INTO public.calorie_entries (meal_type, description, calories_kcal, consumed_at)
     VALUES ($1, $2, $3, $4) RETURNING id, meal_type, description, calories_kcal, consumed_at`,
    [entry.mealType, entry.description, entry.caloriesKcal, entry.consumedAt],
  )
  return toEntry(result.rows[0]!)
}

export async function deleteCalorieEntry(pool: DatabasePool, id: string): Promise<boolean> {
  const result = await pool.query('DELETE FROM public.calorie_entries WHERE id = $1', [id])
  return result.rowCount === 1
}

export async function getCalorieHistory(pool: DatabasePool, from: string, to: string): Promise<DailyCalorieTotal[]> {
  const result = await pool.query<{ date: string; total: string }>(
    `SELECT (consumed_at AT TIME ZONE $3)::date::text AS date, SUM(calories_kcal)::text AS total
     FROM public.calorie_entries WHERE consumed_at >= $1::date AT TIME ZONE $3 AND consumed_at < $2::date AT TIME ZONE $3
     GROUP BY 1 ORDER BY 1`, [from, to, APP_TIMEZONE],
  )
  return result.rows.map((row) => ({ date: row.date, totalCaloriesKcal: Number(row.total) }))
}

export async function getCalorieSummary(pool: DatabasePool, date: string): Promise<CalorieSummary> {
  const [profile, weightResult, totalResult] = await Promise.all([
    getProfile(pool),
    pool.query<WeightRow>('SELECT id, weight_kg, measured_at FROM public.weight_measurements ORDER BY measured_at DESC, id DESC LIMIT 1'),
    pool.query<{ total: string | null }>(`SELECT SUM(calories_kcal)::text AS total FROM public.calorie_entries WHERE consumed_at >= $1::date AT TIME ZONE $2 AND consumed_at < ($1::date + 1) AT TIME ZONE $2`, [date, APP_TIMEZONE]),
  ])
  const latestWeight = weightResult.rows[0] ? toWeight(weightResult.rows[0]) : null
  const complete = profile !== null && profile.heightCm !== null && profile.birthDate !== null && profile.sex !== null
  const bmrKcal = complete && latestWeight
    ? calculateBmr(latestWeight.weightKg, profile.heightCm!, profile.birthDate!, profile.sex!, date)
    : null
  const tdeeKcal = bmrKcal !== null && profile?.activityLevel
    ? calculateTdee(bmrKcal, profile.activityLevel)
    : null
  return { date, totalCaloriesKcal: Number(totalResult.rows[0]?.total ?? 0), bmrKcal, tdeeKcal, bmrStatus: !latestWeight ? 'no_weight' : bmrKcal === null ? 'profile_incomplete' : 'available', latestWeight, profile }
}
