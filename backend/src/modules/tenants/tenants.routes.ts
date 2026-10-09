import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { requireAuth, requireRole } from "../../common/middleware/auth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { tenantsService } from "./tenants.service";
import { createTenantSchema, tenantParamsSchema, updateTenantSchema, updateTenantProfileSchema } from "./tenants.schemas";

export const tenantsRoutes = Router();

tenantsRoutes.use(requireAuth, requireRole("SUPERADMIN"));

tenantsRoutes.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await tenantsService.list());
  })
);

tenantsRoutes.get(
  "/:tenantId",
  validateRequest({ params: tenantParamsSchema }),
  asyncHandler(async (req, res) => {
    res.json(await tenantsService.get(req.params.tenantId));
  })
);

tenantsRoutes.post(
  "/",
  validateRequest({ body: createTenantSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await tenantsService.create(req.body));
  })
);

tenantsRoutes.patch(
  "/:tenantId",
  validateRequest({ params: tenantParamsSchema, body: updateTenantSchema }),
  asyncHandler(async (req, res) => {
    res.json(await tenantsService.update(req.params.tenantId, req.body));
  })
);

tenantsRoutes.patch(
  "/:tenantId/profile",
  validateRequest({ params: tenantParamsSchema, body: updateTenantProfileSchema }),
  asyncHandler(async (req, res) => {
    res.json(await tenantsService.updateProfile(req.params.tenantId, req.body));
  })
);
