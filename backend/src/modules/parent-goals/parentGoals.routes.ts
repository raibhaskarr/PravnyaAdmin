import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { validateRequest } from "../../common/middleware/validateRequest";
import { requireParentAuth } from "../../common/middleware/parentAuth";
import { parentCreateEvidenceSchema, parentGoalEvidenceParamsSchema, parentGoalListParamsSchema } from "./parentGoals.schemas";
import { parentGoalsService } from "./parentGoals.service";

export const parentGoalsRoutes = Router();

parentGoalsRoutes.use(requireParentAuth);

parentGoalsRoutes.get(
  "/:kidId/goals",
  validateRequest({ params: parentGoalListParamsSchema }),
  asyncHandler(async (req, res) => {
    res.json(await parentGoalsService.listGoals(req.parent!.id, req.params.kidId));
  })
);

parentGoalsRoutes.post(
  "/:kidId/goals/:goalId/evidence",
  validateRequest({ params: parentGoalEvidenceParamsSchema, body: parentCreateEvidenceSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await parentGoalsService.createEvidence(req.parent!.id, req.params.kidId, req.params.goalId, req.body));
  })
);
