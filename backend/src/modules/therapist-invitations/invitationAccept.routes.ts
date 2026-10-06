import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { validateRequest } from "../../common/middleware/validateRequest";
import { therapistInvitationsService } from "./therapistInvitations.service";
import { acceptInvitationSchema, tokenParamsSchema } from "./therapistInvitations.schemas";

// Deliberately NOT behind requireAuth -- this is how someone with no account yet looks up and
// accepts an invite. The token itself (an unguessable, hashed-at-rest random value) is the auth.
export const invitationAcceptRoutes = Router();

invitationAcceptRoutes.get(
  "/:token",
  validateRequest({ params: tokenParamsSchema }),
  asyncHandler(async (req, res) => {
    res.json(await therapistInvitationsService.previewByToken(req.params.token));
  })
);

invitationAcceptRoutes.post(
  "/:token/accept",
  validateRequest({ params: tokenParamsSchema, body: acceptInvitationSchema }),
  asyncHandler(async (req, res) => {
    res.json(await therapistInvitationsService.accept(req.params.token, req.body));
  })
);
