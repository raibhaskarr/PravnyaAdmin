import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { blockViewer, requireAuth, requireTenantScope } from "../../common/middleware/auth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { iepPlansService } from "./iepPlans.service";
import { createPlanSchema, editPlanSchema, listQuerySchema, planParamsSchema } from "./iepPlans.schemas";

// Staff: /api/iep-plans. Access is per kid (assertCanAccessKid inside the service). Viewers read only.
export const iepPlansRoutes = Router();
iepPlansRoutes.use(requireAuth, requireTenantScope);

iepPlansRoutes.get(
  "/",
  validateRequest({ query: listQuerySchema }),
  asyncHandler(async (req, res) => res.json(await iepPlansService.list(req.user!, req.query.kidId as string)))
);

iepPlansRoutes.post(
  "/",
  blockViewer,
  validateRequest({ body: createPlanSchema }),
  asyncHandler(async (req, res) => res.status(201).json(await iepPlansService.createDraft(req.user!, req.body)))
);

iepPlansRoutes.patch(
  "/:id",
  blockViewer,
  validateRequest({ params: planParamsSchema, body: editPlanSchema }),
  asyncHandler(async (req, res) => res.json(await iepPlansService.edit(req.user!, req.params.id, req.body)))
);

iepPlansRoutes.post(
  "/:id/finalise",
  blockViewer,
  validateRequest({ params: planParamsSchema }),
  asyncHandler(async (req, res) => res.json(await iepPlansService.finalise(req.user!, req.params.id)))
);

iepPlansRoutes.delete(
  "/:id",
  blockViewer,
  validateRequest({ params: planParamsSchema }),
  asyncHandler(async (req, res) => {
    await iepPlansService.removeDraft(req.user!, req.params.id);
    res.status(204).end();
  })
);
