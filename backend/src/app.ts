import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { prisma } from "./config/prisma";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN.split(",") }));
  app.use(express.json());

  app.get("/health", async (_req, res) => {
    try {
      await Promise.race([
        prisma.$queryRaw`SELECT 1`,
        new Promise((_resolve, reject) => setTimeout(() => reject(new Error("db health check timed out")), 2000))
      ]);
      res.json({ ok: true });
    } catch (error) {
      res.status(503).json({ ok: false, error: error instanceof Error ? error.message : "unknown error" });
    }
  });

  return app;
}
