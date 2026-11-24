import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { blockViewer, requireAuth, requireTenantScope } from "../../common/middleware/auth";
import { requireParentAuth } from "../../common/middleware/parentAuth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { visualSchedulesService } from "./visualSchedules.service";
import {
  createSchema,
  draftSchema,
  editSchema,
  idParamsSchema,
  listQuerySchema,
  parentCreateSchema,
  parentDraftSchema,
  parentKidParamsSchema,
  parentScheduleParamsSchema,
  useSchema
} from "./visualSchedules.schemas";

// Staff: /api/visual-schedules. Per-kid access (assertCanAccessKid in the service); viewers read only.
export const visualSchedulesRoutes = Router();
visualSchedulesRoutes.use(requireAuth, requireTenantScope);

visualSchedulesRoutes.get(
  "/",
  validateRequest({ query: listQuerySchema }),
  asyncHandler(async (req, res) => res.json(await visualSchedulesService.list(req.user!, req.query.kidId as string)))
);
visualSchedulesRoutes.post(
  "/",
  blockViewer,
  validateRequest({ body: createSchema }),
  asyncHandler(async (req, res) => res.status(201).json(await visualSchedulesService.create(req.user!, req.body)))
);
visualSchedulesRoutes.post(
  "/from-template",
  blockViewer,
  validateRequest({
    body: z.object({
      kidId: z.string().uuid(),
      templateId: z.string().uuid(),
      days: z.array(z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])).max(7).optional(),
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM").nullable().optional(),
      remind: z.boolean().optional()
    })
  }),
  asyncHandler(async (req, res) => res.status(201).json(await visualSchedulesService.fromTemplate(req.user!, req.body)))
);
visualSchedulesRoutes.post(
  "/draft",
  blockViewer,
  validateRequest({ body: draftSchema }),
  asyncHandler(async (req, res) => res.status(201).json(await visualSchedulesService.draft(req.user!, req.body)))
);
visualSchedulesRoutes.patch(
  "/:id",
  blockViewer,
  validateRequest({ params: idParamsSchema, body: editSchema }),
  asyncHandler(async (req, res) => res.json(await visualSchedulesService.edit(req.user!, req.params.id, req.body)))
);
visualSchedulesRoutes.post(
  "/:id/publish",
  blockViewer,
  validateRequest({ params: idParamsSchema }),
  asyncHandler(async (req, res) => res.json(await visualSchedulesService.publish(req.user!, req.params.id)))
);
visualSchedulesRoutes.post(
  "/:id/archive",
  blockViewer,
  validateRequest({ params: idParamsSchema }),
  asyncHandler(async (req, res) => res.json(await visualSchedulesService.archive(req.user!, req.params.id)))
);
visualSchedulesRoutes.delete(
  "/:id",
  blockViewer,
  validateRequest({ params: idParamsSchema }),
  asyncHandler(async (req, res) => {
    await visualSchedulesService.remove(req.user!, req.params.id);
    res.status(204).end();
  })
);

// Parent: /api/parent-kids/:kidId/visual-schedules (published ones, and the parent's own).
export const parentVisualSchedulesRoutes = Router();
parentVisualSchedulesRoutes.use(requireParentAuth);

parentVisualSchedulesRoutes.get(
  "/:kidId/visual-schedules",
  validateRequest({ params: parentKidParamsSchema }),
  asyncHandler(async (req, res) => res.json(await visualSchedulesService.listForParent(req.parent!.id, req.params.kidId)))
);
parentVisualSchedulesRoutes.post(
  "/:kidId/visual-schedules/draft",
  validateRequest({ params: parentKidParamsSchema, body: parentDraftSchema }),
  asyncHandler(async (req, res) => res.json(await visualSchedulesService.draftForParent(req.parent!.id, req.params.kidId, req.body)))
);
parentVisualSchedulesRoutes.post(
  "/:kidId/visual-schedules",
  validateRequest({ params: parentKidParamsSchema, body: parentCreateSchema }),
  asyncHandler(async (req, res) => res.status(201).json(await visualSchedulesService.createForParent(req.parent!.id, req.params.kidId, req.body)))
);
parentVisualSchedulesRoutes.patch(
  "/:kidId/visual-schedules/:id",
  validateRequest({ params: parentScheduleParamsSchema, body: editSchema }),
  asyncHandler(async (req, res) => res.json(await visualSchedulesService.editForParent(req.parent!.id, req.params.kidId, req.params.id, req.body)))
);
parentVisualSchedulesRoutes.delete(
  "/:kidId/visual-schedules/:id",
  validateRequest({ params: parentScheduleParamsSchema }),
  asyncHandler(async (req, res) => {
    await visualSchedulesService.removeForParent(req.parent!.id, req.params.kidId, req.params.id);
    res.status(204).end();
  })
);
parentVisualSchedulesRoutes.post(
  "/:kidId/visual-schedules/:id/uses",
  validateRequest({ params: parentScheduleParamsSchema, body: useSchema }),
  asyncHandler(async (req, res) => res.json(await visualSchedulesService.recordUse(req.parent!.id, req.params.kidId, req.params.id, req.body.event)))
);
