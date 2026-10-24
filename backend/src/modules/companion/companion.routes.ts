import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { requireParentAuth } from "../../common/middleware/parentAuth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { companionService } from "./companion.service";
import { companionParamsSchema, sendCompanionMessageSchema } from "./companion.schemas";

export const companionRoutes = Router();

companionRoutes.use(requireParentAuth);

companionRoutes.get(
  "/:kidId/companion/messages",
  validateRequest({ params: companionParamsSchema }),
  asyncHandler(async (req, res) => {
    res.json(await companionService.listMessages(req.parent!.id, req.params.kidId));
  })
);

companionRoutes.post(
  "/:kidId/companion/messages",
  validateRequest({ params: companionParamsSchema, body: sendCompanionMessageSchema }),
  asyncHandler(async (req, res) => {
    res.json(await companionService.sendMessage(req.parent!.id, req.params.kidId, req.body.text));
  })
);
