import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { validateRequest } from "../../common/middleware/validateRequest";
import { tenantInvitationsService } from "./tenantInvitations.service";
import { acceptTenantInvitationSchema, tokenParamsSchema } from "./tenantInvitations.schemas";

// Deliberately NOT behind requireAuth -- this is how someone with no account yet looks up and
// accepts a tenant-setup invite. Mounted at a distinct top-level path (/api/tenant-signup) rather
// than under /api/tenant-invitations, so this public router's lack of requireAuth never risks
// shadowing the authenticated management routes mounted at that other path.
export const tenantInvitationAcceptRoutes = Router();

tenantInvitationAcceptRoutes.get(
  "/:token",
  validateRequest({ params: tokenParamsSchema }),
  asyncHandler(async (req, res) => {
    res.json(await tenantInvitationsService.previewByToken(req.params.token));
  })
);

tenantInvitationAcceptRoutes.post(
  "/:token/accept",
  validateRequest({ params: tokenParamsSchema, body: acceptTenantInvitationSchema }),
  asyncHandler(async (req, res) => {
    res.json(await tenantInvitationsService.accept(req.params.token, req.body));
  })
);
