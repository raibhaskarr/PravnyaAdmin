import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { blockViewer, requireAuth, requireTenantScope } from "../../common/middleware/auth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { goalSkillSuggestionService } from "./goalSkillSuggestion.service";

export const aiRoutes = Router();

aiRoutes.use(requireAuth, requireTenantScope);

const suggestGoalSkillSchema = z.object({ title: z.string().min(1).max(300) });

// Same access rule as creating a goal itself (POST /api/goals) -- Tenant Admin and Therapist can
// ask for a suggestion, Viewer cannot (it never leads anywhere they're allowed to save).
aiRoutes.post(
  "/suggest-goal-skill",
  blockViewer,
  validateRequest({ body: suggestGoalSkillSchema }),
  asyncHandler(async (req, res) => {
    res.json(await goalSkillSuggestionService.suggest(req.user!, req.body.title));
  })
);
