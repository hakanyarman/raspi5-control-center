export type Sex = 'male' | 'female'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very_active' | 'extra_active'
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface UserProfile {
  heightCm: number | null
  birthDate: string | null
  sex: Sex | null
  activityLevel: ActivityLevel | null
}

export interface CalorieEntry {
  id: string
  mealType: MealType
  description: string
  caloriesKcal: number
  consumedAt: string
}

export interface DailyCalorieTotal {
  date: string
  totalCaloriesKcal: number
}

export interface CalorieSummary {
  date: string
  totalCaloriesKcal: number
  bmrKcal: number | null
  tdeeKcal: number | null
  bmrStatus: 'available' | 'profile_incomplete' | 'no_weight'
  latestWeight: WeightMeasurement | null
  profile: UserProfile | null
}

import type { WeightMeasurement } from './index'
