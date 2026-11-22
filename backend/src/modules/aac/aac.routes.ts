import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { blockViewer, requireAuth, requireTenantScope } from "../../common/middleware/auth";
import { requireParentAuth } from "../../common/middleware/parentAuth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { forbidden } from "../../common/errors/AppError";
import { aacBoardsService, aacTemplatesService } from "./aac.service";
import { boardFieldsSchema, createBoardSchema, LANGUAGES, parentCreateBoardSchema, saveBoardSchema } from "./aac.schemas";

const idParams = z.object({ id: z.string().uuid() });
const languageQuery = z.object({ language: z.enum(LANGUAGES).optional() });

// Staff: /api/aac-boards (a child's board; per-kid access in the service; viewers read only).
export const aacBoardsRoutes = Router();
aacBoardsRoutes.use(requireAuth, requireTenantScope);
aacBoardsRoutes.get(
  "/",
  validateRequest({ query: z.object({ kidId: z.string().uuid() }) }),
  asyncHandler(async (req, res) => res.json({ board: await aacBoardsService.getForStaff(req.user!, req.query.kidId as string) }))
);
aacBoardsRoutes.post(
  "/",
  blockViewer,
  validateRequest({ body: createBoardSchema }),
  asyncHandler(async (req, res) => res.status(201).json(await aacBoardsService.createForStaff(req.user!, req.body)))
);
aacBoardsRoutes.put(
  "/:id",
  blockViewer,
  validateRequest({ params: idParams, body: saveBoardSchema }),
  asyncHandler(async (req, res) => res.json(await aacBoardsService.saveForStaff(req.user!, req.params.id, req.body)))
);
aacBoardsRoutes.delete(
  "/:id",
  blockViewer,
  validateRequest({ params: idParams }),
  asyncHandler(async (req, res) => {
    await aacBoardsService.removeForStaff(req.user!, req.params.id);
    res.status(204).end();
  })
);

// /api/aac-templates: a superadmin manages Pravnya's; centre staff see Pravnya's and their centre's.
export const aacTemplatesRoutes = Router();
aacTemplatesRoutes.use(requireAuth, (req, _res, next) => {
  if (req.user!.role !== "SUPERADMIN" && !req.user!.tenantId) throw forbidden();
  next();
});
aacTemplatesRoutes.get(
  "/",
  validateRequest({ query: languageQuery }),
  asyncHandler(async (req, res) => res.json(await aacTemplatesService.list(req.user!, req.query.language as "en" | "hi" | undefined)))
);
aacTemplatesRoutes.post(
  "/",
  blockViewer,
  validateRequest({ body: boardFieldsSchema }),
  asyncHandler(async (req, res) => res.status(201).json(await aacTemplatesService.create(req.user!, req.body)))
);
aacTemplatesRoutes.post(
  "/from-board/:id",
  blockViewer,
  validateRequest({ params: idParams, body: z.object({ name: z.string().trim().min(1).max(60).optional() }) }),
  asyncHandler(async (req, res) => res.status(201).json(await aacTemplatesService.fromBoard(req.user!, req.params.id, req.body.name)))
);
aacTemplatesRoutes.put(
  "/:id",
  blockViewer,
  validateRequest({ params: idParams, body: boardFieldsSchema }),
  asyncHandler(async (req, res) => res.json(await aacTemplatesService.edit(req.user!, req.params.id, req.body)))
);
aacTemplatesRoutes.delete(
  "/:id",
  blockViewer,
  validateRequest({ params: idParams }),
  asyncHandler(async (req, res) => {
    await aacTemplatesService.remove(req.user!, req.params.id);
    res.status(204).end();
  })
);

// Parent: /api/parent-kids/:kidId/aac-board and /aac-templates.
export const parentAacRoutes = Router();
parentAacRoutes.use(requireParentAuth);
const kidParams = z.object({ kidId: z.string().uuid() });
const kidBoardParams = z.object({ kidId: z.string().uuid(), id: z.string().uuid() });
parentAacRoutes.get(
  "/:kidId/aac-board",
  validateRequest({ params: kidParams }),
  asyncHandler(async (req, res) => res.json(await aacBoardsService.getForParent(req.parent!.id, req.params.kidId)))
);
parentAacRoutes.post(
  "/:kidId/aac-board",
  validateRequest({ params: kidParams, body: parentCreateBoardSchema }),
  asyncHandler(async (req, res) => res.status(201).json(await aacBoardsService.createForParent(req.parent!.id, req.params.kidId, req.body)))
);
parentAacRoutes.put(
  "/:kidId/aac-board/:id",
  validateRequest({ params: kidBoardParams, body: saveBoardSchema }),
  asyncHandler(async (req, res) => res.json(await aacBoardsService.saveForParent(req.parent!.id, req.params.kidId, req.params.id, req.body)))
);
parentAacRoutes.delete(
  "/:kidId/aac-board/:id",
  validateRequest({ params: kidBoardParams }),
  asyncHandler(async (req, res) => {
    await aacBoardsService.removeForParent(req.parent!.id, req.params.kidId, req.params.id);
    res.status(204).end();
  })
);
parentAacRoutes.get(
  "/:kidId/aac-templates",
  validateRequest({ params: kidParams, query: languageQuery }),
  asyncHandler(async (req, res) => res.json(await aacTemplatesService.listForParent(req.parent!.id, req.params.kidId, req.query.language as "en" | "hi" | undefined)))
);
