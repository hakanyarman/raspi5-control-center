import type { DatabasePool } from '@raspi5-control-center/database'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { describe, it, type TestContext } from 'node:test'
import { createApp } from '../app'

interface QueryCall {
  text: string
  values?: unknown[]
}

function createCaloriePoolStub() {
  const calls: QueryCall[] = []
  const entryRow = {
    id: '7',
    meal_type: 'lunch',
    description: 'Tavuklu salata',
    calories_kcal: 540,
    consumed_at: new Date('2026-09-02T10:00:00.000Z'),
  }
  const profileRow = {
    height_cm: '175.00',
    birth_date: '1990-09-03',
    sex: 'male',
    activity_level: 'moderate',
  }

  const query = async (text: string, values?: unknown[]) => {
    calls.push({ text, values })
    if (text.includes('SELECT height_cm')) return { rows: [profileRow] }
    if (text.includes('INSERT INTO public.user_profiles')) return { rows: [profileRow] }
    if (text.includes('INSERT INTO public.calorie_entries')) return { rows: [entryRow] }
    if (text.includes('DELETE FROM public.calorie_entries')) return { rows: [], rowCount: 1 }
    if (text.includes('SUM(calories_kcal)::text AS total') && text.includes('GROUP BY')) return { rows: [{ date: '2026-09-02', total: '540' }] }
    if (text.includes('SUM(calories_kcal)::text AS total')) return { rows: [{ total: '540' }] }
    if (text.includes('FROM public.calorie_entries')) return { rows: [entryRow] }
    if (text.includes('FROM public.weight_measurements')) return { rows: [{ id: '46', weight_kg: '70.00', measured_at: new Date('2026-09-02T06:00:00.000Z') }] }
    if (text.includes('SELECT 1')) return { rows: [{ '?column?': 1 }] }
    throw new Error(`Unexpected query: ${text}`)
  }

  return { calls, pool: { query } as unknown as DatabasePool }
}

async function startApp(test: TestContext, pool: DatabasePool): Promise<string> {
  const server = createApp(pool).listen(0, '127.0.0.1')
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  test.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  }))
  const address = server.address() as AddressInfo
  return `http://127.0.0.1:${address.port}`
}

describe('calorie routes', () => {
  it('rejects invalid dates, ranges, timestamps, profiles, and ids before querying', async (test) => {
    const { calls, pool } = createCaloriePoolStub()
    const baseUrl = await startApp(test, pool)
    const requests = [
      fetch(`${baseUrl}/api/calories/summary?date=2026-02-29`),
      fetch(`${baseUrl}/api/calories/history?from=2026-09-02&to=2026-09-01`),
      fetch(`${baseUrl}/api/calories/entries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mealType: 'lunch', caloriesKcal: 500, consumedAt: '2026-09-02T12:00:00' }) }),
      fetch(`${baseUrl}/api/calories/profile`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ heightCm: 175, birthDate: '9999-01-01', sex: 'male' }) }),
      fetch(`${baseUrl}/api/calories/entries/9223372036854775808`, { method: 'DELETE' }),
    ]
    const responses = await Promise.all(requests)

    assert.deepEqual(responses.map(({ status }) => status), [400, 400, 400, 400, 400])
    assert.equal(calls.length, 0)
  })

  it('returns a no-store summary with BMR and TDEE', async (test) => {
    const { pool } = createCaloriePoolStub()
    const baseUrl = await startApp(test, pool)
    const response = await fetch(`${baseUrl}/api/calories/summary?date=2026-09-02`)

    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await response.json(), {
      date: '2026-09-02',
      totalCaloriesKcal: 540,
      bmrKcal: 1624,
      tdeeKcal: 2517,
      bmrStatus: 'available',
      latestWeight: { id: '46', weightKg: 70, measuredAt: '2026-09-02T06:00:00.000Z' },
      profile: { heightCm: 175, birthDate: '1990-09-03', sex: 'male', activityLevel: 'moderate' },
    })
  })

  it('supports the profile and calorie entry CRUD contract', async (test) => {
    const { calls, pool } = createCaloriePoolStub()
    const baseUrl = await startApp(test, pool)
    const headers = { 'Content-Type': 'application/json' }

    const profileResponse = await fetch(`${baseUrl}/api/calories/profile`, { method: 'PUT', headers, body: JSON.stringify({ heightCm: 175, birthDate: '1990-09-03', sex: 'male', activityLevel: 'moderate' }) })
    assert.equal(profileResponse.status, 200)
    assert.deepEqual(await profileResponse.json(), { heightCm: 175, birthDate: '1990-09-03', sex: 'male', activityLevel: 'moderate' })

    const createResponse = await fetch(`${baseUrl}/api/calories/entries`, { method: 'POST', headers, body: JSON.stringify({ mealType: 'lunch', description: '  Tavuklu salata  ', caloriesKcal: 540, consumedAt: '2026-09-02T13:00:00+03:00' }) })
    assert.equal(createResponse.status, 201)
    assert.equal((await createResponse.json() as { id: string }).id, '7')
    const insertCall = calls.find(({ text }) => text.includes('INSERT INTO public.calorie_entries'))
    assert.deepEqual(insertCall?.values, ['lunch', 'Tavuklu salata', 540, '2026-09-02T13:00:00+03:00'])

    const entriesResponse = await fetch(`${baseUrl}/api/calories/entries?from=2026-09-02&to=2026-09-03`)
    assert.equal(entriesResponse.status, 200)
    assert.equal((await entriesResponse.json() as unknown[]).length, 1)

    const historyResponse = await fetch(`${baseUrl}/api/calories/history?from=2026-08-04&to=2026-09-03`)
    assert.equal(historyResponse.status, 200)
    assert.deepEqual(await historyResponse.json(), [{ date: '2026-09-02', totalCaloriesKcal: 540 }])

    const deleteResponse = await fetch(`${baseUrl}/api/calories/entries/7`, { method: 'DELETE' })
    assert.equal(deleteResponse.status, 204)
  })
})
