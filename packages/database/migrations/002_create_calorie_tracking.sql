CREATE TABLE IF NOT EXISTS public.user_profiles (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  height_cm NUMERIC(5, 2),
  birth_date DATE,
  sex TEXT,
  activity_level TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_profiles_height_check CHECK (height_cm IS NULL OR (height_cm >= 80 AND height_cm <= 250)),
  CONSTRAINT user_profiles_birth_date_check CHECK (birth_date IS NULL OR birth_date <= CURRENT_DATE),
  CONSTRAINT user_profiles_sex_check CHECK (sex IS NULL OR sex IN ('male', 'female')),
  CONSTRAINT user_profiles_activity_level_check CHECK (
    activity_level IS NULL OR activity_level IN ('sedentary', 'light', 'moderate', 'very_active', 'extra_active')
  )
);

CREATE TABLE IF NOT EXISTS public.calorie_entries (
  id BIGSERIAL PRIMARY KEY,
  meal_type TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 200),
  calories_kcal INTEGER NOT NULL CHECK (calories_kcal BETWEEN 1 AND 10000),
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT calorie_entries_meal_type_check CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack'))
);

CREATE INDEX IF NOT EXISTS calorie_entries_consumed_at_id_idx
  ON public.calorie_entries (consumed_at DESC, id DESC);
