import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { requireAuth, requireRole, requireTenantScope } from "../../common/middleware/auth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { therapistsService } from "./therapists.service";
import { setAssignedKidsSchema, therapistParamsSchema, updateOwnTherapistSchema, updateTherapistSchema } from "./therapists.schemas";

export const therapistsRoutes = Router();

therapistsRoutes.use(requireAuth, requireTenantScope);

therapistsRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await therapistsService.list(req.user!.tenantId!));
  })
);

// Self-service professional profile -- registered before /:therapistId so "me" is never matched
// as a :therapistId (same pattern as tenants.routes.ts's /me/profile).
therapistsRoutes.get(
  "/me",
  requireRole("THERAPIST"),
  asyncHandler(async (req, res) => {
    res.json(await therapistsService.getOwn(req.user!.id));
  })
);

therapistsRoutes.patch(
  "/me",
  requireRole("THERAPIST"),
  validateRequest({ body: updateOwnTherapistSchema }),
  asyncHandler(async (req, res) => {
    res.json(await therapistsService.updateOwn(req.user!, req.body));
  })
);

therapistsRoutes.get(
  "/:therapistId",
  validateRequest({ params: therapistParamsSchema }),
  asyncHandler(async (req, res) => {
    res.json(await therapistsService.get(req.user!.tenantId!, req.params.therapistId));
  })
);

therapistsRoutes.patch(
  "/:therapistId",
  requireRole("TENANT_ADMIN"),
  validateRequest({ params: therapistParamsSchema, body: updateTherapistSchema }),
  asyncHandler(async (req, res) => {
    res.json(await therapistsService.update(req.user!, req.params.therapistId, req.body));
  })
);

therapistsRoutes.patch(
  "/:therapistId/kids",
  requireRole("TENANT_ADMIN"),
  validateRequest({ params: therapistParamsSchema, body: setAssignedKidsSchema }),
  asyncHandler(async (req, res) => {
    await therapistsService.setAssignedKids(req.user!, req.params.therapistId, req.body);
    res.status(204).end();
  })
);
