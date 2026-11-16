import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { requireAuth, requireRole } from "../../common/middleware/auth";
import { requireParentAuth } from "../../common/middleware/parentAuth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { homeGuidesService } from "./homeGuides.service";
import { saveGuideSchema, skillParamsSchema, walkthroughParamsSchema } from "./homeGuides.schemas";

// Parent: /api/parent-kids/:kidId/goals/:goalId/walkthrough
export const parentWalkthroughRoutes = Router();
parentWalkthroughRoutes.use(requireParentAuth);
parentWalkthroughRoutes.get(
  "/:kidId/goals/:goalId/walkthrough",
  validateRequest({ params: walkthroughParamsSchema }),
  asyncHandler(async (req, res) => res.json(await homeGuidesService.walkthrough(req.parent!.id, req.params.kidId, req.params.goalId)))
);

// Staff: /api/home-guides -- guides are shared by every centre, so only the platform team edits them.
export const homeGuidesRoutes = Router();
homeGuidesRoutes.use(requireAuth, requireRole("SUPERADMIN"));

homeGuidesRoutes.get("/", asyncHandler(async (_req, res) => res.json(await homeGuidesService.listForReview())));

homeGuidesRoutes.get(
  "/:skillId",
  validateRequest({ params: skillParamsSchema }),
  asyncHandler(async (req, res) => res.json(await homeGuidesService.getForReview(req.params.skillId)))
);

homeGuidesRoutes.post(
  "/:skillId/draft",
  validateRequest({ params: skillParamsSchema }),
  asyncHandler(async (req, res) => res.json(await homeGuidesService.draftForReview(req.params.skillId, req.user!.tenantId ?? null)))
);

homeGuidesRoutes.put(
  "/:skillId",
  validateRequest({ params: skillParamsSchema, body: saveGuideSchema }),
  asyncHandler(async (req, res) => res.json(await homeGuidesService.save(req.params.skillId, req.user!.id, req.body)))
);
