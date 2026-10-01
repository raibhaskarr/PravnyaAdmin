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
      goalTitle: z.string().min(1).max(300),
      originalDomainName: z.string().max(200).nullable(),
      originalCategory: z.string().max(200).nullable(),
      predictedSkillId: z.string().uuid().nullable(),
      confidence: z.number().min(0).max(1).nullable(),
      rationale: z.string().max(1000).nullable(),
      status: z.enum(["TAGGED", "NO_MATCH", "ERROR"])
    })
  ),
  logEvidence: z.array(
    z.object({
      logDate: z.string().nullable(),
      predictedSkillId: z.string().uuid().nullable(),
      itemHint: z.string().max(200).nullable(),
      predictedItemId: z.string().uuid().nullable(),
      itemMatchScore: z.number().min(0).max(1).nullable(),
      itemMatchMethod: z.string().max(50).nullable(),
      outcome: z.enum(["CORRECT", "INCORRECT", "PARTIAL", "ATTEMPTED", "NOT_OBSERVED", "UNKNOWN"]),
      supportLevel: z.enum(["INDEPENDENT", "VISUAL_PROMPT", "VERBAL_PROMPT", "GESTURAL_PROMPT", "PHYSICAL_PROMPT", "PARTIAL_ASSISTANCE", "FULL_ASSISTANCE", "UNKNOWN"]),
      confidence: z.number().min(0).max(1).nullable()
    })
  )
});

pocReviewRoutes.post(
  "/import",
  validateRequest({ body: importSchema }),
  asyncHandler(async (req, res) => res.status(201).json(await pocReviewService.importData(req.body)))
);
