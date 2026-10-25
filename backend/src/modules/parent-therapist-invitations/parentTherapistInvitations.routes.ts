import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { requireParentAuth } from "../../common/middleware/parentAuth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { parentTherapistInvitationsService } from "./parentTherapistInvitations.service";
import { inviteTherapistSchema, parentTherapistKidParamsSchema } from "./parentTherapistInvitations.schemas";

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
