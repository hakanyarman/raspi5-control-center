import type { DatabasePool } from "@raspi5-control-center/database";
import express, {
  type ErrorRequestHandler,
  type RequestHandler,
} from "express";
import { createNetworkRouter } from "./routes/network";
import { createSystemRouter } from "./routes/system";
import { createWeightsRouter } from "./routes/weights";

export function createApp(pool: DatabasePool) {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json());

  app.get("/health", async (_request, response) => {
    try {
      await pool.query("SELECT 1");
      response.json({
        status: "ok",
        database: "connected",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Health check database error:", message);
      response.status(503).json({
        status: "error",
        database: "unavailable",
      });
    }
  });

  app.use("/api/weights", createWeightsRouter(pool));
  app.use("/api/system", createSystemRouter());
  app.use("/api/network", createNetworkRouter());

  const notFoundHandler: RequestHandler = (_request, response) => {
    response.status(404).json({ error: "Not found" });
  };
  app.use(notFoundHandler);

  const errorHandler: ErrorRequestHandler = (
    error,
    _request,
    response,
    _next,
  ) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Unhandled API error:", message);
    response.status(500).json({ error: "Internal server error" });
  };
  app.use(errorHandler);

  return app;
}
