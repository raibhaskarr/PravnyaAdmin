import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { requireAuth, requireRole } from "../../common/middleware/auth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { tenantInvitationsService } from "./tenantInvitations.service";
import { invitationParamsSchema, inviteTenantSchema } from "./tenantInvitations.schemas";

export const tenantInvitationsRoutes = Router();

tenantInvitationsRoutes.use(requireAuth, requireRole("SUPERADMIN"));

tenantInvitationsRoutes.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await tenantInvitationsService.list());
  })
);

tenantInvitationsRoutes.post(
  "/",
  validateRequest({ body: inviteTenantSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await tenantInvitationsService.invite(req.user!, req.body));
  })
);

tenantInvitationsRoutes.delete(
  "/:invitationId",
  validateRequest({ params: invitationParamsSchema }),
  asyncHandler(async (req, res) => {
    res.json(await tenantInvitationsService.revoke(req.params.invitationId));
  })
);
