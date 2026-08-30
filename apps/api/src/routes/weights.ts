import type { DatabasePool } from "@raspi5-control-center/database";
import { Router } from "express";
import {
  getLatestWeightMeasurement,
  listWeightMeasurements,
} from "../weights/measurements";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function parseLimit(value: unknown): number | null {
  if (value === undefined) return DEFAULT_LIMIT;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;

  const limit = Number(value);
  return limit <= MAX_LIMIT ? limit : null;
}

export function createWeightsRouter(pool: DatabasePool): Router {
  const router = Router();

  router.get("/latest", async (_request, response, next) => {
    try {
      const measurement = await getLatestWeightMeasurement(pool);

      if (!measurement) {
        response.status(404).json({ error: "No weight measurements found" });
        return;
      }

      response.json(measurement);
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
      response.json(await listWeightMeasurements(pool, limit));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
