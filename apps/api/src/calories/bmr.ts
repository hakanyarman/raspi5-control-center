import type { ActivityLevel, Sex } from '@raspi5-control-center/shared'

const activityMultipliers: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
}

export function calculateAge(birthDate: string, onDate: string): number {
  const birth = new Date(`${birthDate}T00:00:00Z`)
  const current = new Date(`${onDate}T00:00:00Z`)
  let age = current.getUTCFullYear() - birth.getUTCFullYear()
  const beforeBirthday = current.getUTCMonth() < birth.getUTCMonth()
    || (current.getUTCMonth() === birth.getUTCMonth() && current.getUTCDate() < birth.getUTCDate())
  if (beforeBirthday) age -= 1
  return age
}

export function calculateBmr(weightKg: number, heightCm: number, birthDate: string, sex: Sex, onDate: string): number {
  const age = calculateAge(birthDate, onDate)
  const offset = sex === 'male' ? 5 : -161
  return Math.round(10 * weightKg + 6.25 * heightCm - 5 * age + offset)
}

export function calculateTdee(bmrKcal: number, activityLevel: ActivityLevel): number {
  return Math.round(bmrKcal * activityMultipliers[activityLevel])
}
