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
import { parentsRoutes } from "./modules/parents/parents.routes";
import { goalsRoutes } from "./modules/goals/goals.routes";
import { manualRoutes } from "./modules/manual/manual.routes";
import { aiRoutes } from "./modules/ai/ai.routes";
import { pocReviewRoutes } from "./modules/poc-review/pocReview.routes";
import { therapistInvitationsRoutes } from "./modules/therapist-invitations/therapistInvitations.routes";
import { invitationAcceptRoutes } from "./modules/therapist-invitations/invitationAccept.routes";
import { tenantInvitationsRoutes } from "./modules/tenant-invitations/tenantInvitations.routes";
import { tenantInvitationAcceptRoutes } from "./modules/tenant-invitations/tenantInvitationAccept.routes";
import { superadminInvitationsRoutes } from "./modules/superadmin-invitations/superadminInvitations.routes";
import { superadminInvitationAcceptRoutes } from "./modules/superadmin-invitations/superadminInvitationAccept.routes";
import { iepRoutes } from "./modules/iep/iep.routes";
import { parentAuthRoutes } from "./modules/parent-auth/parentAuth.routes";
import { parentKidsRoutes } from "./modules/parent-kids/parentKids.routes";
import { parentIepRoutes } from "./modules/parent-iep/parentIep.routes";
import { parentGoalsRoutes } from "./modules/parent-goals/parentGoals.routes";
import { companionRoutes } from "./modules/companion/companion.routes";
import { staffCompanionRoutes } from "./modules/companion/staffCompanion.routes";
import { parentTherapistInvitationsRoutes } from "./modules/parent-therapist-invitations/parentTherapistInvitations.routes";
import { parentScheduleRoutes } from "./modules/parent-schedule/parentSchedule.routes";
import { scheduleRoutes } from "./modules/schedule/schedule.routes";
import { centresRoutes } from "./modules/centres/centres.routes";
import { parentCentresRoutes } from "./modules/parent-centres/parentCentres.routes";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN.split(",") }));
  // A base64-encoded phone photo or voice recording can run several MB -- scoped to just this one
  // route (registered before the general parser below) rather than raising the global limit for
  // every other route's small CRUD bodies.
  app.use("/api/ai/extract-evidence", express.json({ limit: "25mb" }));
  // A multi-page IEP PDF or a full-resolution photo of one can run several MB -- same scoped-limit
  // approach as extract-evidence above, not a global bump.
  app.use("/api/iep/extract", express.json({ limit: "20mb" }));
  // Same reasoning, parent-facing equivalent -- the onboarding IEP screen uploads a PDF/photo too.
  app.use("/api/parent-kids/:kidId/iep/extract", express.json({ limit: "20mb" }));
  // Default 100kb is too small for the poc-review bulk-import endpoint (hundreds of rows per
  // child); every other route's payloads are small CRUD bodies well under this.
  app.use(express.json({ limit: "2mb" }));

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
  app.use("/api/parents", parentsRoutes);
  app.use("/api/goals", goalsRoutes);
  app.use("/api/schedule", scheduleRoutes);
  app.use("/api/companion-messages", staffCompanionRoutes);
  app.use("/api/centres", centresRoutes);
  app.use("/api/parent-centres", parentCentresRoutes);
  app.use("/api/manual", manualRoutes);
  app.use("/api/ai", aiRoutes);
  app.use("/api/poc-review", pocReviewRoutes);
  app.use("/api/therapist-invitations", therapistInvitationsRoutes);
  app.use("/api/invitations", invitationAcceptRoutes);
  app.use("/api/tenant-invitations", tenantInvitationsRoutes);
  app.use("/api/tenant-signup", tenantInvitationAcceptRoutes);
  app.use("/api/superadmin-invitations", superadminInvitationsRoutes);
  app.use("/api/superadmin-signup", superadminInvitationAcceptRoutes);
  app.use("/api/iep", iepRoutes);
  app.use("/api/parent-auth", parentAuthRoutes);
  app.use("/api/parent-kids", parentKidsRoutes);
  app.use("/api/parent-kids", parentIepRoutes);
  app.use("/api/parent-kids", parentGoalsRoutes);
  app.use("/api/parent-kids", companionRoutes);
  app.use("/api/parent-kids", parentTherapistInvitationsRoutes);
  app.use("/api/parent-kids", parentScheduleRoutes);

  app.use(errorMiddleware);

  return app;
}
