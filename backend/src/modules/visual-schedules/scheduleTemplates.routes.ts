import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { blockViewer, requireAuth } from "../../common/middleware/auth";
import { requireParentAuth } from "../../common/middleware/parentAuth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { forbidden } from "../../common/errors/AppError";
import { scheduleTemplatesService } from "./scheduleTemplates.service";
import { DAYS, KINDS, LANGUAGES, stepSchema, STEP_LIMITS } from "./visualSchedules.schemas";

// /api/schedule-templates: a superadmin manages Pravnya's templates; centre staff see Pravnya's and
// their centre's, and make their own (admins can change any of their centre's, therapists their own).
export const scheduleTemplatesRoutes = Router();
scheduleTemplatesRoutes.use(requireAuth, (req, _res, next) => {
  if (req.user!.role !== "SUPERADMIN" && !req.user!.tenantId) throw forbidden();
  next();
});

const fields = {
  title: z.string().trim().min(1).max(80),
  kind: z.enum(KINDS),
  language: z.enum(LANGUAGES),
  steps: z.array(stepSchema).min(1).max(16),
  days: z.array(z.enum(DAYS)).max(7),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM").nullable()
};
const createSchema = z
  .object({ ...fields, language: fields.language.default("en"), days: fields.days.default([]), time: fields.time.default(null) })
  .superRefine((v, ctx) => {
    const [min, max] = STEP_LIMITS[v.kind];
    if (v.steps.length < min || v.steps.length > max) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["steps"], message: "Wrong number of steps" });
  });
const editSchema = z
  .object({ title: fields.title.optional(), kind: fields.kind.optional(), language: fields.language.optional(), steps: fields.steps.optional(), days: fields.days.optional(), time: fields.time.optional() })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to change");
const idParams = z.object({ id: z.string().uuid() });
const languageQuery = z.object({ language: z.enum(LANGUAGES).optional() });

scheduleTemplatesRoutes.get(
  "/",
  validateRequest({ query: languageQuery }),
  asyncHandler(async (req, res) => res.json(await scheduleTemplatesService.list(req.user!, req.query.language as "en" | "hi" | undefined)))
);
scheduleTemplatesRoutes.post(
  "/",
  blockViewer,
  validateRequest({ body: createSchema }),
  asyncHandler(async (req, res) => res.status(201).json(await scheduleTemplatesService.create(req.user!, req.body)))
);
scheduleTemplatesRoutes.post(
  "/draft",
  blockViewer,
  validateRequest({ body: z.object({ kind: z.enum(KINDS).nullable().default(null), language: z.enum(LANGUAGES).default("en"), request: z.string().trim().min(3).max(500) }) }),
  asyncHandler(async (req, res) => res.status(201).json(await scheduleTemplatesService.draft(req.user!, req.body)))
);
scheduleTemplatesRoutes.post(
  "/from-schedule/:id",
  blockViewer,
  validateRequest({ params: idParams, body: z.object({ title: z.string().trim().min(1).max(80).optional() }) }),
  asyncHandler(async (req, res) => res.status(201).json(await scheduleTemplatesService.fromSchedule(req.user!, req.params.id, req.body.title)))
);
scheduleTemplatesRoutes.patch(
  "/:id",
  blockViewer,
  validateRequest({ params: idParams, body: editSchema }),
  asyncHandler(async (req, res) => res.json(await scheduleTemplatesService.edit(req.user!, req.params.id, req.body)))
);
scheduleTemplatesRoutes.delete(
  "/:id",
  blockViewer,
  validateRequest({ params: idParams }),
  asyncHandler(async (req, res) => {
    await scheduleTemplatesService.remove(req.user!, req.params.id);
    res.status(204).end();
  })
);

// Parent: /api/parent-kids/:kidId/schedule-templates -- Pravnya's and the child's centre's.
export const parentScheduleTemplatesRoutes = Router();
parentScheduleTemplatesRoutes.use(requireParentAuth);
parentScheduleTemplatesRoutes.get(
  "/:kidId/schedule-templates",
  validateRequest({ params: z.object({ kidId: z.string().uuid() }), query: languageQuery }),
  asyncHandler(async (req, res) => res.json(await scheduleTemplatesService.listForParent(req.parent!.id, req.params.kidId, req.query.language as "en" | "hi" | undefined)))
);
