import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { requireAuth, requireTenantScope } from "../../common/middleware/auth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { companionService } from "./companion.service";
import { staffCompanionQuerySchema } from "./companion.schemas";

// Kept as its own router rather than added to companion.routes.ts -- that router is globally
// .use(requireParentAuth), a different auth stack than staff. Read-only: staff see the parent's
// conversation with Pravnya from here, never reply into it.
export const staffCompanionRoutes = Router();

staffCompanionRoutes.use(requireAuth, requireTenantScope);

staffCompanionRoutes.get(
  "/",
  validateRequest({ query: staffCompanionQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await companionService.listForStaff(req.user!, req.query.kidId as string));
  })
);
