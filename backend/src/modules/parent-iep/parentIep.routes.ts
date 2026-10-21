import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { validateRequest } from "../../common/middleware/validateRequest";
import { requireParentAuth } from "../../common/middleware/parentAuth";
import { acceptIepGoalsSchema, parentIepExtractSchema, parentIepParamsSchema } from "./parentIep.schemas";
import { parentIepService } from "./parentIep.service";

export const parentIepRoutes = Router({ mergeParams: true });

parentIepRoutes.use(requireParentAuth);

parentIepRoutes.post(
  "/:kidId/iep/extract",
  validateRequest({ params: parentIepParamsSchema, body: parentIepExtractSchema }),
  asyncHandler(async (req, res) => {
    res.json(await parentIepService.extract(req.parent!.id, req.params.kidId, req.body));
  })
);

parentIepRoutes.post(
  "/:kidId/iep/accept-goals",
  validateRequest({ params: parentIepParamsSchema, body: acceptIepGoalsSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await parentIepService.acceptGoals(req.parent!.id, req.params.kidId, req.body));
  })
);
