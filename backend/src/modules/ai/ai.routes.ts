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

const extractEvidenceSchema = z
  .object({
    kidId: z.string().uuid(),
    freeText: z.string().min(1).max(8000).optional(),
    media: z
      .object({
        kind: z.enum(["image", "audio"]),
        mimeType: z.string().min(1).max(100),
        base64: z.string().min(1)
      })
      .optional()
  })
  .refine((v) => (v.freeText !== undefined) !== (v.media !== undefined), {
    message: "Provide exactly one of freeText or media"
  });

// Never persists anything -- just returns candidates for the therapist to review. Saving happens
// through the normal POST /goals/:goalId/evidence endpoint, once per approved candidate. media is
// a base64-encoded photo or voice recording; it's only ever forwarded to the AI provider for this
// one request and never written to disk or the DB.
aiRoutes.post(
  "/extract-evidence",
  blockViewer,
  validateRequest({ body: extractEvidenceSchema }),
  asyncHandler(async (req, res) => {
    const input = req.body.freeText !== undefined ? { freeText: req.body.freeText } : { media: req.body.media };
    res.json(await extractEvidenceService.extract(req.user!, req.body.kidId, input));
  })
);
