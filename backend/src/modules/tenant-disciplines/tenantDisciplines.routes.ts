import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { blockViewer, requireAuth, requireTenantScope } from "../../common/middleware/auth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { tenantDisciplinesService } from "./tenantDisciplines.service";

export const tenantDisciplinesRoutes = Router();

tenantDisciplinesRoutes.use(requireAuth, requireTenantScope);

const disciplineParamsSchema = z.object({ disciplineId: z.string().uuid() });

tenantDisciplinesRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await tenantDisciplinesService.listForTenant(req.user!.tenantId!));
  })
);

tenantDisciplinesRoutes.post(
  "/:disciplineId/enable",
  blockViewer,
  validateRequest({ params: disciplineParamsSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await tenantDisciplinesService.enable(req.user!.tenantId!, req.params.disciplineId));
  })
);

tenantDisciplinesRoutes.post(
  "/:disciplineId/disable",
  blockViewer,
  validateRequest({ params: disciplineParamsSchema }),
  asyncHandler(async (req, res) => {
    await tenantDisciplinesService.disable(req.user!.tenantId!, req.params.disciplineId);
    res.status(204).send();
  })
);
