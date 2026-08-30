import type { DatabasePool } from "@raspi5-control-center/database";

interface WeightMeasurementRow {
  id: string;
  weight_kg: string;
  measured_at: Date;
}

export interface WeightMeasurement {
  id: string;
  weightKg: number;
  measuredAt: string;
}

function toWeightMeasurement(row: WeightMeasurementRow): WeightMeasurement {
  return {
    id: row.id,
    weightKg: Number(row.weight_kg),
    measuredAt: row.measured_at.toISOString(),
  };
}

export async function getLatestWeightMeasurement(
  pool: DatabasePool,
): Promise<WeightMeasurement | null> {
  const result = await pool.query<WeightMeasurementRow>(`
    SELECT id, weight_kg, measured_at
    FROM public.weight_measurements
    ORDER BY measured_at DESC, id DESC
    LIMIT 1
  `);

  return result.rows[0] ? toWeightMeasurement(result.rows[0]) : null;
}

export async function getWeightMeasurementById(
  pool: DatabasePool,
  id: string,
): Promise<WeightMeasurement | null> {
  const result = await pool.query<WeightMeasurementRow>(
    `
      SELECT id, weight_kg, measured_at
      FROM public.weight_measurements
      WHERE id = $1
    `,
    [id],
  );

  return result.rows[0] ? toWeightMeasurement(result.rows[0]) : null;
}

export async function listWeightMeasurements(
  pool: DatabasePool,
  limit: number,
): Promise<WeightMeasurement[]> {
  const result = await pool.query<WeightMeasurementRow>(
    `
      SELECT id, weight_kg, measured_at
      FROM public.weight_measurements
      ORDER BY measured_at DESC, id DESC
      LIMIT $1
    `,
    [limit],
  );

  return result.rows.map(toWeightMeasurement);
}
