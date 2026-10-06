import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { requireAuth, requireRole, requireTenantScope } from "../../common/middleware/auth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { therapistInvitationsService } from "./therapistInvitations.service";
import { invitationParamsSchema, inviteForKidSchema, inviteGeneralSchema } from "./therapistInvitations.schemas";

export const therapistInvitationsRoutes = Router();

// Inviting is a Tenant Admin action, same as creating a therapist directly ever was.
therapistInvitationsRoutes.use(requireAuth, requireTenantScope, requireRole("TENANT_ADMIN"));

therapistInvitationsRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await therapistInvitationsService.list(req.user!.tenantId!));
  })
);

therapistInvitationsRoutes.post(
  "/",
  validateRequest({ body: inviteGeneralSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await therapistInvitationsService.inviteGeneral(req.user!, req.body));
  })
);

const forKidSchema = inviteForKidSchema.extend({ kidId: z.string().uuid() });

therapistInvitationsRoutes.post(
  "/for-kid",
  validateRequest({ body: forKidSchema }),
  asyncHandler(async (req, res) => {
    const { kidId, ...rest } = req.body;
    res.status(201).json(await therapistInvitationsService.inviteForKid(req.user!, kidId, rest));
  })
);

therapistInvitationsRoutes.delete(
  "/:invitationId",
  validateRequest({ params: invitationParamsSchema }),
  asyncHandler(async (req, res) => {
    res.json(await therapistInvitationsService.revoke(req.user!, req.params.invitationId));
  })
);
