import { Router } from "express";
import { collectServicesStatus } from "../services/status";

export function createServicesRouter(
  collectStatus: typeof collectServicesStatus = collectServicesStatus,
): Router {
  const router = Router();
  router.get("/status", async (_request, response, next) => {
    try {
      response.set("Cache-Control", "no-store").json(await collectStatus());
    } catch (error) {
      next(error);
    }
  });
  return router;
}
