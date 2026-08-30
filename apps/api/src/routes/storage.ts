import { Router } from "express";
import { collectStorageInventory } from "../storage/inventory";
import { collectStorageMetrics } from "../storage/metrics";

export function createStorageRouter(
  collectMetrics: typeof collectStorageMetrics = collectStorageMetrics,
  collectInventory: typeof collectStorageInventory = collectStorageInventory,
): Router {
  const router = Router();

  router.get("/metrics", async (_request, response, next) => {
    try {
      response.set("Cache-Control", "no-store").json(await collectMetrics());
    } catch (error) {
      next(error);
    }
  });

  router.get("/devices", async (_request, response, next) => {
    try {
      response.set("Cache-Control", "no-store").json(await collectInventory());
    } catch (error) {
      next(error);
    }
  });

  return router;
}
