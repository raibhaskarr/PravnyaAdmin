import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { requireAuth, requireRole, requireTenantScope } from "../../common/middleware/auth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { tenantsService } from "./tenants.service";
import { tenantParamsSchema, updateTenantSchema, updateTenantProfileSchema, updateOwnTenantProfileSchema } from "./tenants.schemas";

export const tenantsRoutes = Router();

tenantsRoutes.use(requireAuth);

// Tenant admin self-service -- registered before /:tenantId/profile so "me" is never matched as
// a :tenantId. Business fields only; KYC approval is never the tenant's own call (see schema).
tenantsRoutes.get(
  "/me/profile",
  requireTenantScope,
  requireRole("TENANT_ADMIN"),
  asyncHandler(async (req, res) => {
    res.json(await tenantsService.get(req.user!.tenantId!));
  })
);

tenantsRoutes.patch(
  "/me/profile",
  requireTenantScope,
  requireRole("TENANT_ADMIN"),
  validateRequest({ body: updateOwnTenantProfileSchema }),
  asyncHandler(async (req, res) => {
    res.json(await tenantsService.updateProfile(req.user!.tenantId!, req.body));
  })
);

tenantsRoutes.get(
  "/",
  requireRole("SUPERADMIN"),
  asyncHandler(async (_req, res) => {
    res.json(await tenantsService.list());
  })
);

tenantsRoutes.get(
  "/:tenantId",
  requireRole("SUPERADMIN"),
  validateRequest({ params: tenantParamsSchema }),
  asyncHandler(async (req, res) => {
    res.json(await tenantsService.get(req.params.tenantId));
  })
);

tenantsRoutes.patch(
  "/:tenantId",
  requireRole("SUPERADMIN"),
  validateRequest({ params: tenantParamsSchema, body: updateTenantSchema }),
  asyncHandler(async (req, res) => {
    res.json(await tenantsService.update(req.params.tenantId, req.body));
  })
);

tenantsRoutes.patch(
  "/:tenantId/profile",
  requireRole("SUPERADMIN"),
  validateRequest({ params: tenantParamsSchema, body: updateTenantProfileSchema }),
  asyncHandler(async (req, res) => {
    res.json(await tenantsService.updateProfile(req.params.tenantId, req.body));
  })
);
