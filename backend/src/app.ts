import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { prisma } from "./config/prisma";
import { errorMiddleware } from "./common/errors/errorMiddleware";
import { authRoutes } from "./modules/auth/auth.routes";
import { tenantsRoutes } from "./modules/tenants/tenants.routes";
import { taxonomyRoutes } from "./modules/taxonomy/taxonomy.routes";
import { tenantDisciplinesRoutes } from "./modules/tenant-disciplines/tenantDisciplines.routes";
import { therapistsRoutes } from "./modules/therapists/therapists.routes";
import { kidsRoutes } from "./modules/kids/kids.routes";
import { goalsRoutes } from "./modules/goals/goals.routes";
import { manualRoutes } from "./modules/manual/manual.routes";
import { aiRoutes } from "./modules/ai/ai.routes";

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

  app.use("/api/auth", authRoutes);
  app.use("/api/tenants", tenantsRoutes);
  app.use("/api/taxonomy", taxonomyRoutes);
  app.use("/api/tenant-disciplines", tenantDisciplinesRoutes);
  app.use("/api/therapists", therapistsRoutes);
  app.use("/api/kids", kidsRoutes);
  app.use("/api/goals", goalsRoutes);
  app.use("/api/manual", manualRoutes);
  app.use("/api/ai", aiRoutes);

  app.use(errorMiddleware);

  return app;
}
