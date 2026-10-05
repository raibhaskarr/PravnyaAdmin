import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { blockViewer, requireAuth, requireTenantScope } from "../../common/middleware/auth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { goalsService } from "./goals.service";
import { createEvidenceSchema, createGoalSchema, goalParamsSchema, goalQuerySchema, updateGoalSchema } from "./goals.schemas";

export const goalsRoutes = Router();

goalsRoutes.use(requireAuth, requireTenantScope);

goalsRoutes.get(
  "/",
  validateRequest({ query: goalQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await goalsService.list(req.user!, req.query.kidId as string | undefined));
  })
);

goalsRoutes.get(
  "/:goalId",
  validateRequest({ params: goalParamsSchema }),
  asyncHandler(async (req, res) => {
    res.json(await goalsService.get(req.user!, req.params.goalId));
  })
);

// Tenant Admin and Therapist both manage clinical goals for kids they can access; Viewer is
// read-only everywhere.
goalsRoutes.post(
  "/",
  blockViewer,
  validateRequest({ body: createGoalSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await goalsService.create(req.user!, req.body));
  })
);

goalsRoutes.patch(
  "/:goalId",
  blockViewer,
  validateRequest({ params: goalParamsSchema, body: updateGoalSchema }),
  asyncHandler(async (req, res) => {
    res.json(await goalsService.update(req.user!, req.params.goalId, req.body));
  })
);

goalsRoutes.post(
  "/:goalId/evidence",
  blockViewer,
  validateRequest({ params: goalParamsSchema, body: createEvidenceSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await goalsService.createEvidence(req.user!, req.params.goalId, req.body));
  })
);
