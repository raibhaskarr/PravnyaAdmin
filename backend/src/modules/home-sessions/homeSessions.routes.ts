import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { blockViewer, requireAuth, requireTenantScope } from "../../common/middleware/auth";
import { requireParentAuth } from "../../common/middleware/parentAuth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { homeSessionsService } from "./homeSessions.service";
import {
  draftSessionSchema,
  editSessionSchema,
  listQuerySchema,
  parentKidParamsSchema,
  parentRunParamsSchema,
  parentSessionParamsSchema,
  sessionParamsSchema,
  startPracticeSchema,
  turnSchema
} from "./homeSessions.schemas";

// Staff: /api/home-sessions. Per-kid access (assertCanAccessKid in the service); viewers read only.
export const homeSessionsRoutes = Router();
homeSessionsRoutes.use(requireAuth, requireTenantScope);

homeSessionsRoutes.get(
  "/",
  validateRequest({ query: listQuerySchema }),
  asyncHandler(async (req, res) => res.json(await homeSessionsService.list(req.user!, req.query.kidId as string)))
);
homeSessionsRoutes.post(
  "/draft",
  blockViewer,
  validateRequest({ body: draftSessionSchema }),
  asyncHandler(async (req, res) => res.status(201).json(await homeSessionsService.draft(req.user!, req.body)))
);
homeSessionsRoutes.patch(
  "/:id",
  blockViewer,
  validateRequest({ params: sessionParamsSchema, body: editSessionSchema }),
  asyncHandler(async (req, res) => res.json(await homeSessionsService.edit(req.user!, req.params.id, req.body)))
);
homeSessionsRoutes.post(
  "/:id/publish",
  blockViewer,
  validateRequest({ params: sessionParamsSchema }),
  asyncHandler(async (req, res) => res.json(await homeSessionsService.publish(req.user!, req.params.id)))
);
homeSessionsRoutes.post(
  "/:id/archive",
  blockViewer,
  validateRequest({ params: sessionParamsSchema }),
  asyncHandler(async (req, res) => res.json(await homeSessionsService.archive(req.user!, req.params.id)))
);
homeSessionsRoutes.delete(
  "/:id",
  blockViewer,
  validateRequest({ params: sessionParamsSchema }),
  asyncHandler(async (req, res) => {
    await homeSessionsService.remove(req.user!, req.params.id);
    res.status(204).end();
  })
);

// Parent: /api/parent-kids/:kidId/sessions...
export const parentHomeSessionsRoutes = Router();
parentHomeSessionsRoutes.use(requireParentAuth);

parentHomeSessionsRoutes.get(
  "/:kidId/sessions",
  validateRequest({ params: parentKidParamsSchema }),
  asyncHandler(async (req, res) => res.json(await homeSessionsService.listForParent(req.parent!.id, req.params.kidId)))
);
// Practice sessions Pravnya puts together from the child's goals (at most a couple a day).
parentHomeSessionsRoutes.get(
  "/:kidId/practice",
  validateRequest({ params: parentKidParamsSchema }),
  asyncHandler(async (req, res) => res.json(await homeSessionsService.practiceStatus(req.parent!.id, req.params.kidId)))
);
parentHomeSessionsRoutes.post(
  "/:kidId/practice/start",
  validateRequest({ params: parentKidParamsSchema, body: startPracticeSchema }),
  asyncHandler(async (req, res) => res.json(await homeSessionsService.startPractice(req.parent!.id, req.params.kidId, req.body)))
);
parentHomeSessionsRoutes.post(
  "/:kidId/sessions/:sessionId/start",
  validateRequest({ params: parentSessionParamsSchema }),
  asyncHandler(async (req, res) => res.json(await homeSessionsService.start(req.parent!.id, req.params.kidId, req.params.sessionId)))
);
parentHomeSessionsRoutes.get(
  "/:kidId/session-runs/:runId",
  validateRequest({ params: parentRunParamsSchema }),
  asyncHandler(async (req, res) => res.json(await homeSessionsService.current(req.parent!.id, req.params.kidId, req.params.runId)))
);
parentHomeSessionsRoutes.post(
  "/:kidId/session-runs/:runId/turn",
  validateRequest({ params: parentRunParamsSchema, body: turnSchema }),
  asyncHandler(async (req, res) => res.json(await homeSessionsService.turn(req.parent!.id, req.params.kidId, req.params.runId, req.body)))
);
parentHomeSessionsRoutes.post(
  "/:kidId/session-runs/:runId/end",
  validateRequest({ params: parentRunParamsSchema }),
  asyncHandler(async (req, res) => res.json(await homeSessionsService.end(req.parent!.id, req.params.kidId, req.params.runId)))
);
