import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { validateRequest } from "../../common/middleware/validateRequest";
import { superadminInvitationsService } from "./superadminInvitations.service";
import { acceptSuperadminInvitationSchema, tokenParamsSchema } from "./superadminInvitations.schemas";

// Deliberately NOT behind requireAuth -- same reasoning as tenantInvitationAccept.routes.ts.
// Mounted at a distinct top-level path (/api/superadmin-signup) so this public router never risks
// shadowing the authenticated management routes mounted at /api/superadmin-invitations.
export const superadminInvitationAcceptRoutes = Router();

superadminInvitationAcceptRoutes.get(
  "/:token",
  validateRequest({ params: tokenParamsSchema }),
  asyncHandler(async (req, res) => {
    res.json(await superadminInvitationsService.previewByToken(req.params.token));
  })
);

superadminInvitationAcceptRoutes.post(
  "/:token/accept",
  validateRequest({ params: tokenParamsSchema, body: acceptSuperadminInvitationSchema }),
  asyncHandler(async (req, res) => {
    res.json(await superadminInvitationsService.accept(req.params.token, req.body));
  })
);
