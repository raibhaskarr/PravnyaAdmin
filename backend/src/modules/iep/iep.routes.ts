import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { blockViewer, requireAuth, requireTenantScope } from "../../common/middleware/auth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { iepExtractionService } from "./iepExtraction.service";
import { extractIepGoalsSchema } from "./iepExtraction.schemas";

export const iepRoutes = Router();

iepRoutes.use(requireAuth, requireTenantScope);

iepRoutes.post(
  "/extract",
  blockViewer,
  validateRequest({ body: extractIepGoalsSchema }),
  asyncHandler(async (req, res) => {
    res.json(await iepExtractionService.extract(req.user!, req.body.kidId, req.body.source));
  })
);
