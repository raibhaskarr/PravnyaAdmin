import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { requireAuth, requireTenantScope } from "../../common/middleware/auth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { scheduleService } from "./schedule.service";
import { scheduleQuerySchema } from "./schedule.schemas";

export const scheduleRoutes = Router();

scheduleRoutes.use(requireAuth, requireTenantScope);

// Read-only -- staff view a parent's schedule, never create/edit it from here. No requireRole:
// TENANT_ADMIN/VIEWER see any kid in their tenant, THERAPIST only kids they're linked to, same as
// goals.routes.ts's own GET routes -- access is narrowed inside the service via assertCanAccessKid.
scheduleRoutes.get(
  "/",
  validateRequest({ query: scheduleQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await scheduleService.list(req.user!, req.query.kidId as string));
  })
);
