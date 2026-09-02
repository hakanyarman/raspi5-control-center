import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { calculateAge, calculateBmr, calculateTdee } from './bmr'

describe('calorie energy calculations', () => {
  it('calculates age before and on the birthday', () => {
    assert.equal(calculateAge('1990-09-03', '2026-09-02'), 35)
    assert.equal(calculateAge('1990-09-03', '2026-09-03'), 36)
  })

  it('calculates Mifflin-St Jeor BMR for both supported sexes', () => {
    assert.equal(calculateBmr(70, 175, '1990-09-03', 'male', '2026-09-02'), 1624)
    assert.equal(calculateBmr(70, 175, '1990-09-03', 'female', '2026-09-02'), 1458)
  })

  it('calculates TDEE from the selected activity level', () => {
    assert.equal(calculateTdee(1624, 'sedentary'), 1949)
    assert.equal(calculateTdee(1624, 'moderate'), 2517)
    assert.equal(calculateTdee(1624, 'extra_active'), 3086)
  })
})
