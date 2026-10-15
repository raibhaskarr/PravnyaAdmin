import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { requireAuth, requireRole } from "../../common/middleware/auth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { superadminInvitationsService } from "./superadminInvitations.service";
import { invitationParamsSchema, inviteSuperadminSchema } from "./superadminInvitations.schemas";

export const superadminInvitationsRoutes = Router();

superadminInvitationsRoutes.use(requireAuth, requireRole("SUPERADMIN"));

superadminInvitationsRoutes.get(
  "/users",
  asyncHandler(async (_req, res) => {
    res.json(await superadminInvitationsService.listSuperadmins());
  })
);

superadminInvitationsRoutes.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await superadminInvitationsService.list());
  })
);

superadminInvitationsRoutes.post(
  "/",
  validateRequest({ body: inviteSuperadminSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await superadminInvitationsService.invite(req.user!, req.body));
  })
);

superadminInvitationsRoutes.delete(
  "/:invitationId",
  validateRequest({ params: invitationParamsSchema }),
  asyncHandler(async (req, res) => {
    res.json(await superadminInvitationsService.revoke(req.params.invitationId));
  })
);
