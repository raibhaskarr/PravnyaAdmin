import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { blockViewer, requireAuth, requireTenantScope } from "../../common/middleware/auth";
import { requireParentAuth } from "../../common/middleware/parentAuth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { progressUpdatesService } from "./progressUpdates.service";
import {
  createDraftSchema,
  editDraftSchema,
  listQuerySchema,
  parentListParamsSchema,
  parentUpdateParamsSchema,
  updateParamsSchema
} from "./progressUpdates.schemas";

// Staff: /api/progress-updates. Access is per kid (assertCanAccessKid inside the service): Tenant
// Admin/Viewer see any kid in their tenant, a therapist only kids they're linked to. Viewers read only.
export const progressUpdatesRoutes = Router();
progressUpdatesRoutes.use(requireAuth, requireTenantScope);

progressUpdatesRoutes.get(
  "/",
  validateRequest({ query: listQuerySchema }),
  asyncHandler(async (req, res) => res.json(await progressUpdatesService.listForStaff(req.user!, req.query.kidId as string)))
);

progressUpdatesRoutes.get(
  "/due",
  asyncHandler(async (req, res) => res.json(await progressUpdatesService.due(req.user!)))
);

progressUpdatesRoutes.post(
  "/",
  blockViewer,
  validateRequest({ body: createDraftSchema }),
  asyncHandler(async (req, res) => res.status(201).json(await progressUpdatesService.createDraft(req.user!, req.body)))
);

progressUpdatesRoutes.patch(
  "/:id",
  blockViewer,
  validateRequest({ params: updateParamsSchema, body: editDraftSchema }),
  asyncHandler(async (req, res) => res.json(await progressUpdatesService.editDraft(req.user!, req.params.id, req.body.body)))
);

progressUpdatesRoutes.post(
  "/:id/send",
  blockViewer,
  validateRequest({ params: updateParamsSchema }),
  asyncHandler(async (req, res) => res.json(await progressUpdatesService.send(req.user!, req.params.id)))
);

progressUpdatesRoutes.delete(
  "/:id",
  blockViewer,
  validateRequest({ params: updateParamsSchema }),
  asyncHandler(async (req, res) => {
    await progressUpdatesService.removeDraft(req.user!, req.params.id);
    res.status(204).end();
  })
);

// Parent: /api/parent-kids/:kidId/updates -- sent updates only.
export const parentProgressUpdatesRoutes = Router();
parentProgressUpdatesRoutes.use(requireParentAuth);

parentProgressUpdatesRoutes.get(
  "/:kidId/updates",
  validateRequest({ params: parentListParamsSchema }),
  asyncHandler(async (req, res) => res.json(await progressUpdatesService.listForParent(req.parent!.id, req.params.kidId)))
);

parentProgressUpdatesRoutes.post(
  "/:kidId/updates/:updateId/read",
  validateRequest({ params: parentUpdateParamsSchema }),
  asyncHandler(async (req, res) => res.json(await progressUpdatesService.markRead(req.parent!.id, req.params.kidId, req.params.updateId)))
);
