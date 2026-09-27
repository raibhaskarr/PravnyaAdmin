import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { requireAuth, requireRole, requireTenantScope } from "../../common/middleware/auth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { kidsService } from "./kids.service";
import { createKidSchema, kidParamsSchema, updateKidSchema } from "./kids.schemas";

export const kidsRoutes = Router();

kidsRoutes.use(requireAuth, requireTenantScope);

kidsRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await kidsService.list(req.user!));
  })
);

kidsRoutes.get(
  "/:kidId",
  validateRequest({ params: kidParamsSchema }),
  asyncHandler(async (req, res) => {
    res.json(await kidsService.get(req.user!, req.params.kidId));
  })
);

// Creating/editing the kid record itself (not their goals) is a Tenant Admin action.
kidsRoutes.post(
  "/",
  requireRole("TENANT_ADMIN"),
  validateRequest({ body: createKidSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await kidsService.create(req.user!.tenantId!, req.body));
  })
);

kidsRoutes.patch(
  "/:kidId",
  requireRole("TENANT_ADMIN"),
  validateRequest({ params: kidParamsSchema, body: updateKidSchema }),
  asyncHandler(async (req, res) => {
    res.json(await kidsService.update(req.user!, req.params.kidId, req.body));
  })
);
