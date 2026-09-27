import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { requireAuth, requireRole, requireTenantScope } from "../../common/middleware/auth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { therapistsService } from "./therapists.service";
import { createTherapistSchema, therapistParamsSchema, updateTherapistSchema } from "./therapists.schemas";

export const therapistsRoutes = Router();

therapistsRoutes.use(requireAuth, requireTenantScope);

therapistsRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await therapistsService.list(req.user!.tenantId!));
  })
);

therapistsRoutes.get(
  "/:therapistId",
  validateRequest({ params: therapistParamsSchema }),
  asyncHandler(async (req, res) => {
    res.json(await therapistsService.get(req.user!.tenantId!, req.params.therapistId));
  })
);

// Managing therapist accounts is a Tenant Admin action -- a therapist can't create peers, a
// viewer can't create anyone.
therapistsRoutes.post(
  "/",
  requireRole("TENANT_ADMIN"),
  validateRequest({ body: createTherapistSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await therapistsService.create(req.user!.tenantId!, req.body));
  })
);

therapistsRoutes.patch(
  "/:therapistId",
  requireRole("TENANT_ADMIN"),
  validateRequest({ params: therapistParamsSchema, body: updateTherapistSchema }),
  asyncHandler(async (req, res) => {
    res.json(await therapistsService.update(req.user!.tenantId!, req.params.therapistId, req.body));
  })
);
