import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { requireAuth, requireTenantScope } from "../../common/middleware/auth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { centresService } from "./centres.service";
import { createCentreSchema } from "./centres.schemas";

export const centresRoutes = Router();

centresRoutes.use(requireAuth, requireTenantScope);

// No requireRole -- as low-friction as typing a clinic name while logging a session, not a
// superadmin-gated resource like the canonical taxonomy.
centresRoutes.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await centresService.list());
  })
);

centresRoutes.post(
  "/",
  validateRequest({ body: createCentreSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await centresService.create(req.body));
  })
);
