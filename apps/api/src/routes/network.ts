import { Router } from "express";
import { collectLanNeighbors } from "../network/lan-inventory";
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

  router.get("/neighbors", async (_request, response, next) => {
    try {
      response.json({
        devices: await collectLanNeighbors(),
        collectedAt: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
