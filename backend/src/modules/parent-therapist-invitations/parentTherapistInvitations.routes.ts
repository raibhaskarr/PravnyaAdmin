import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { requireParentAuth } from "../../common/middleware/parentAuth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { parentTherapistInvitationsService } from "./parentTherapistInvitations.service";
import {
  inviteTherapistSchema,
  parentTherapistInvitationParamsSchema,
  parentTherapistKidParamsSchema,
  parentUnlinkTherapistParamsSchema
} from "./parentTherapistInvitations.schemas";

export const parentTherapistInvitationsRoutes = Router();

parentTherapistInvitationsRoutes.use(requireParentAuth);

parentTherapistInvitationsRoutes.get(
  "/:kidId/therapists",
  validateRequest({ params: parentTherapistKidParamsSchema }),
  asyncHandler(async (req, res) => {
    res.json(await parentTherapistInvitationsService.listTherapists(req.parent!.id, req.params.kidId));
  })
);

parentTherapistInvitationsRoutes.get(
  "/:kidId/therapist-invitations",
  validateRequest({ params: parentTherapistKidParamsSchema }),
  asyncHandler(async (req, res) => {
    res.json(await parentTherapistInvitationsService.listInvitations(req.parent!.id, req.params.kidId));
  })
);

parentTherapistInvitationsRoutes.post(
  "/:kidId/therapist-invitations",
  validateRequest({ params: parentTherapistKidParamsSchema, body: inviteTherapistSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await parentTherapistInvitationsService.inviteTherapist(req.parent!.id, req.params.kidId, req.body));
  })
);

parentTherapistInvitationsRoutes.delete(
  "/:kidId/therapist-invitations/:invitationId",
  validateRequest({ params: parentTherapistInvitationParamsSchema }),
  asyncHandler(async (req, res) => {
    res.json(await parentTherapistInvitationsService.revokeInvitation(req.parent!.id, req.params.kidId, req.params.invitationId));
  })
);

parentTherapistInvitationsRoutes.post(
  "/:kidId/therapist-invitations/:invitationId/resend",
  validateRequest({ params: parentTherapistInvitationParamsSchema }),
  asyncHandler(async (req, res) => {
    res.json(await parentTherapistInvitationsService.resendInvitation(req.parent!.id, req.params.kidId, req.params.invitationId));
  })
);

parentTherapistInvitationsRoutes.delete(
  "/:kidId/therapists/:therapistId",
  validateRequest({ params: parentUnlinkTherapistParamsSchema }),
  asyncHandler(async (req, res) => {
    await parentTherapistInvitationsService.unlinkTherapist(req.parent!.id, req.params.kidId, req.params.therapistId);
    res.status(204).send();
  })
);
