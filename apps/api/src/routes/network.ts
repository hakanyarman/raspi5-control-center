import { Router } from "express";
import { collectNetworkMetrics } from "../network/metrics";

export function createNetworkRouter(): Router {
  const router = Router();

  router.get("/metrics", async (_request, response, next) => {
    try {
      response.json(await collectNetworkMetrics());
    } catch (error) {
      next(error);
    }
  });

  return router;
}
