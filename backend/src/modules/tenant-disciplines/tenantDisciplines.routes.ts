import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { blockViewer, requireAuth, requireTenantScope } from "../../common/middleware/auth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { assertCanAccessKid } from "../../common/access/kidAccess";
import { tenantDisciplinesService } from "./tenantDisciplines.service";

export const tenantDisciplinesRoutes = Router();

tenantDisciplinesRoutes.use(requireAuth, requireTenantScope);

const disciplineParamsSchema = z.object({ disciplineId: z.string().uuid() });
const listQuerySchema = z.object({ kidId: z.string().uuid().optional() });

tenantDisciplinesRoutes.get(
  "/",
  validateRequest({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    // Plain tenant-settings view (no kidId): the requesting user's own tenant, as always. When
    // creating/suggesting a goal for a specific kid, pass kidId instead -- a guest therapist from
    // another tenant needs the KID's enabled disciplines, not their own.
    const kidId = req.query.kidId as string | undefined;
    const tenantId = kidId ? (await assertCanAccessKid(req.user!, kidId)).tenantId : req.user!.tenantId!;
    res.json(await tenantDisciplinesService.listForTenant(tenantId));
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
