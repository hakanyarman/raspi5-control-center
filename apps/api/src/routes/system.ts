import { Router } from "express";
import { collectSystemMetrics } from "../system/metrics";

export function createSystemRouter(): Router {
  const router = Router();

  router.get("/metrics", async (_request, response, next) => {
    try {
      response.json(await collectSystemMetrics());
    } catch (error) {
      next(error);
    }
  });

  return router;
}
