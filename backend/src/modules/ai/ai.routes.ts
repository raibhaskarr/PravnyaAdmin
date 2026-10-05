import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { blockViewer, requireAuth, requireTenantScope } from "../../common/middleware/auth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { goalSkillSuggestionService } from "./goalSkillSuggestion.service";
import { extractEvidenceService } from "./extractEvidence.service";

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

const extractEvidenceSchema = z.object({ kidId: z.string().uuid(), freeText: z.string().min(1).max(8000) });

// Never persists anything -- just returns candidates for the therapist to review. Saving happens
// through the normal POST /goals/:goalId/evidence endpoint, once per approved candidate.
aiRoutes.post(
  "/extract-evidence",
  blockViewer,
  validateRequest({ body: extractEvidenceSchema }),
  asyncHandler(async (req, res) => {
    res.json(await extractEvidenceService.extract(req.user!, req.body.kidId, req.body.freeText));
  })
);
