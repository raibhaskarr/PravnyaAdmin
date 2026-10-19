import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { requireAuth, requireRole, requireTenantScope } from "../../common/middleware/auth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { parentsService } from "./parents.service";
import { createParentSchema, parentParamsSchema } from "./parents.schemas";

export const parentsRoutes = Router();

parentsRoutes.use(requireAuth, requireTenantScope);

// Read-only for every tenant-scoped role (same as /kids). Adding a kid (with or without a parent
// attached) still goes through POST /kids; this only covers "Add parent" with no first kid.
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

parentsRoutes.post(
  "/",
  requireRole("TENANT_ADMIN"),
  validateRequest({ body: createParentSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await parentsService.create(req.user!, req.body));
  })
);
