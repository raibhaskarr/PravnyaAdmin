import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { requireAuth, requireRole } from "../../common/middleware/auth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { pocReviewService } from "./pocReview.service";

export const pocReviewRoutes = Router();

// Not tenant-scoped -- superadmin only. These two children aren't PravnyaAdmin Kids yet.
pocReviewRoutes.use(requireAuth, requireRole("SUPERADMIN"));

pocReviewRoutes.get("/children", asyncHandler(async (_req, res) => res.json(await pocReviewService.listChildren())));

const childParamsSchema = z.object({ childId: z.string().uuid() });

pocReviewRoutes.get(
  "/children/:childId",
  validateRequest({ params: childParamsSchema }),
  asyncHandler(async (req, res) => res.json(await pocReviewService.getChildDetail(req.params.childId)))
);

const importSchema = z.object({
  label: z.string().min(1).max(100),
  sourceChildId: z.string().uuid(),
  modelProvider: z.string().min(1).max(50),
  modelName: z.string().min(1).max(100),
  goalTags: z.array(
    z.object({
      sourceGoalId: z.string().uuid().nullable(),
      goalTitle: z.string().min(1).max(300),
      originalDomainName: z.string().max(200).nullable(),
      originalCategory: z.string().max(200).nullable(),
      centreName: z.string().max(200).nullable(),
      predictedSkillId: z.string().uuid().nullable(),
      confidence: z.number().min(0).max(1).nullable(),
      rationale: z.string().max(1000).nullable(),
      status: z.enum(["TAGGED", "NO_MATCH", "ERROR"])
    })
  ),
  logEvidence: z.array(
    z.object({
      logDate: z.string().nullable(),
      centreName: z.string().max(200).nullable(),
      predictedSkillId: z.string().uuid().nullable(),
      itemHint: z.string().max(200).nullable(),
      predictedItemId: z.string().uuid().nullable(),
      itemMatchScore: z.number().min(0).max(1).nullable(),
      itemMatchMethod: z.string().max(50).nullable(),
      outcome: z.enum(["CORRECT", "INCORRECT", "PARTIAL", "ATTEMPTED", "NOT_OBSERVED", "UNKNOWN"]),
      supportLevel: z.enum(["INDEPENDENT", "VISUAL_PROMPT", "VERBAL_PROMPT", "GESTURAL_PROMPT", "PHYSICAL_PROMPT", "PARTIAL_ASSISTANCE", "FULL_ASSISTANCE", "UNKNOWN"]),
      modality: z.enum(["VERBAL", "MANUAL_SIGN", "AAC", "WRITTEN", "GESTURAL", "UNKNOWN", "NOT_APPLICABLE"]),
      measurementType: z.enum(["TRIALS", "FREQUENCY", "DURATION", "PERCENTAGE", "PROMPT_LEVEL", "YES_NO", "RATING", "FREE_OBSERVATION"]).nullable(),
      measurementNumerator: z.number().int().nullable(),
      measurementDenominator: z.number().int().nullable(),
      measurementValue: z.number().nullable(),
      measurementUnit: z.string().max(50).nullable(),
      measurementBoolean: z.boolean().nullable(),
      measurementText: z.string().max(500).nullable(),
      confidence: z.number().min(0).max(1).nullable()
    })
  )
});

pocReviewRoutes.post(
  "/import",
  validateRequest({ body: importSchema }),
  asyncHandler(async (req, res) => res.status(201).json(await pocReviewService.importData(req.body)))
);

const suggestionImportSchema = z.object({
  sourceChildId: z.string().uuid(),
  modelProvider: z.string().min(1).max(50),
  modelName: z.string().min(1).max(100),
  suggestions: z.array(
    z.object({
      canonicalSkillId: z.string().uuid(),
      suggestedGoalId: z.string().uuid().nullable(),
      suggestedGoalTitle: z.string().max(300).nullable(),
      confidence: z.number().min(0).max(1).nullable(),
      rationale: z.string().max(1000).nullable()
    })
  )
});

pocReviewRoutes.post(
  "/evidence-goal-suggestions/import",
  validateRequest({ body: suggestionImportSchema }),
  asyncHandler(async (req, res) => res.status(201).json(await pocReviewService.importGoalSuggestions(req.body)))
);

pocReviewRoutes.get(
  "/children/:childId/review-flags",
  validateRequest({ params: childParamsSchema }),
  asyncHandler(async (req, res) => res.json(await pocReviewService.getReviewFlags(req.params.childId)))
);

const resolveFlagSchema = z
  .object({
    kind: z.enum(["GOAL_DISAGREEMENT", "EVIDENCE_WITHOUT_GOAL"]),
    sourceGoalId: z.string().uuid().nullable().default(null),
    canonicalSkillId: z.string().uuid().nullable().default(null),
    resolvedSkillId: z.string().uuid().nullable().default(null),
    resolvedSourceGoalId: z.string().uuid().nullable().default(null),
    resolvedSource: z.string().min(1).max(30),
    note: z.string().max(500).nullable().default(null)
  })
  .superRefine((value, ctx) => {
    if (value.kind === "GOAL_DISAGREEMENT" && !value.sourceGoalId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "sourceGoalId is required for GOAL_DISAGREEMENT" });
    }
    if (value.kind === "EVIDENCE_WITHOUT_GOAL" && !value.canonicalSkillId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "canonicalSkillId is required for EVIDENCE_WITHOUT_GOAL" });
    }
  });

pocReviewRoutes.post(
  "/children/:childId/review-flags/resolve",
  validateRequest({ params: childParamsSchema, body: resolveFlagSchema }),
  asyncHandler(async (req, res) => res.json(await pocReviewService.resolveReviewFlag(req.params.childId, req.user!.id, req.body)))
);
