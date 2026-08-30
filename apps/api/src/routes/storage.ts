import { Router } from "express";
import { collectStorageMetrics } from "../storage/metrics";

export function createStorageRouter(): Router {
  const router = Router();

  router.get("/metrics", async (_request, response, next) => {
    try {
      response.json(await collectStorageMetrics());
    } catch (error) {
      next(error);
    }
  });

  return router;
}
