import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { requireAuth, requireTenantScope } from "../../common/middleware/auth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { parentsService } from "./parents.service";
import { parentParamsSchema } from "./parents.schemas";

export const parentsRoutes = Router();

parentsRoutes.use(requireAuth, requireTenantScope);

// Read-only for every tenant-scoped role (same as /kids) -- creating/adding a kid under a
// household still goes through POST /kids, which already does the find-or-create-by-email dance.
parentsRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await parentsService.list(req.user!));
  })
);

parentsRoutes.get(
  "/:parentId",
  validateRequest({ params: parentParamsSchema }),
  asyncHandler(async (req, res) => {
    res.json(await parentsService.get(req.user!, req.params.parentId));
  })
);
