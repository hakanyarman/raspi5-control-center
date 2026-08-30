CREATE TABLE IF NOT EXISTS public.weight_measurements (
  id BIGSERIAL PRIMARY KEY,
  weight_kg NUMERIC(5, 2) NOT NULL,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
