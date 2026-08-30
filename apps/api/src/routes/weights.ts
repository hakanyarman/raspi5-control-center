import type { DatabasePool } from "@raspi5-control-center/database";
import { Router } from "express";

interface WeightMeasurementRow {
  id: string;
  weight_kg: string;
  measured_at: Date;
}

interface WeightMeasurement {
  id: string;
  weightKg: number;
  measuredAt: string;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function parseLimit(value: unknown): number | null {
  if (value === undefined) return DEFAULT_LIMIT;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;

  const limit = Number(value);
  return limit <= MAX_LIMIT ? limit : null;
}

function toWeightMeasurement(row: WeightMeasurementRow): WeightMeasurement {
  return {
    id: row.id,
    weightKg: Number(row.weight_kg),
    measuredAt: row.measured_at.toISOString(),
  };
}

export function createWeightsRouter(pool: DatabasePool): Router {
  const router = Router();

  router.get("/latest", async (_request, response, next) => {
    try {
      const result = await pool.query<WeightMeasurementRow>(`
        SELECT id, weight_kg, measured_at
        FROM public.weight_measurements
        ORDER BY measured_at DESC, id DESC
        LIMIT 1
      `);
      const row = result.rows[0];

      if (!row) {
        response.status(404).json({ error: "No weight measurements found" });
        return;
      }

      response.json(toWeightMeasurement(row));
    } catch (error) {
      next(error);
    }
  });

  router.get("/", async (request, response, next) => {
    const limit = parseLimit(request.query.limit);

    if (limit === null) {
      response.status(400).json({
        error: `limit must be an integer between 1 and ${MAX_LIMIT}`,
      });
      return;
    }

    try {
      const result = await pool.query<WeightMeasurementRow>(
        `
          SELECT id, weight_kg, measured_at
          FROM public.weight_measurements
          ORDER BY measured_at DESC, id DESC
          LIMIT $1
        `,
        [limit],
      );

      response.json(result.rows.map(toWeightMeasurement));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
