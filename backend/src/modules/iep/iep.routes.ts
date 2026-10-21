import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { blockViewer, requireAuth, requireTenantScope } from "../../common/middleware/auth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { assertCanAccessKid } from "../../common/access/kidAccess";
import { iepExtractionService } from "./iepExtraction.service";
import { extractIepGoalsSchema } from "./iepExtraction.schemas";

export const iepRoutes = Router();

iepRoutes.use(requireAuth, requireTenantScope);

iepRoutes.post(
  "/extract",
  blockViewer,
  validateRequest({ body: extractIepGoalsSchema }),
  asyncHandler(async (req, res) => {
    const kid = await assertCanAccessKid(req.user!, req.body.kidId);
    res.json(await iepExtractionService.extract(kid, req.body.source));
  })
);
