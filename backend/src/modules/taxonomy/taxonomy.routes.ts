import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { requireAuth, requireRole } from "../../common/middleware/auth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { taxonomyService } from "./taxonomy.service";
import {
  createDisciplineSchema,
  createDomainSchema,
  createItemSchema,
  createSkillSchema,
  idParamsSchema,
  skillIdParamsSchema,
  updateDisciplineSchema,
  updateDomainSchema,
  updateItemSchema,
  updateSkillSchema
} from "./taxonomy.schemas";

export const taxonomyRoutes = Router();

// Every authenticated user (superadmin and every tenant role) can read the taxonomy -- it's
// what tenant users pick from when toggling disciplines or building goals.
taxonomyRoutes.use(requireAuth);

taxonomyRoutes.get("/disciplines", asyncHandler(async (_req, res) => res.json(await taxonomyService.listDisciplines())));
taxonomyRoutes.get("/domains", asyncHandler(async (_req, res) => res.json(await taxonomyService.listDomains())));
taxonomyRoutes.get(
  "/skills",
  asyncHandler(async (req, res) => {
    const domainId = typeof req.query.domainId === "string" ? req.query.domainId : undefined;
    res.json(await taxonomyService.listSkills(domainId));
  })
);
taxonomyRoutes.get(
  "/skills/:id",
  validateRequest({ params: idParamsSchema }),
  asyncHandler(async (req, res) => res.json(await taxonomyService.getSkill(req.params.id)))
);

// Everything below mutates the master list -- superadmin only.
const superadminOnly = Router();
superadminOnly.use(requireRole("SUPERADMIN"));

superadminOnly.post("/disciplines", validateRequest({ body: createDisciplineSchema }), asyncHandler(async (req, res) => {
  res.status(201).json(await taxonomyService.createDiscipline(req.body));
}));
superadminOnly.patch("/disciplines/:id", validateRequest({ params: idParamsSchema, body: updateDisciplineSchema }), asyncHandler(async (req, res) => {
  res.json(await taxonomyService.updateDiscipline(req.params.id, req.body));
}));

superadminOnly.post("/domains", validateRequest({ body: createDomainSchema }), asyncHandler(async (req, res) => {
  res.status(201).json(await taxonomyService.createDomain(req.body));
}));
superadminOnly.patch("/domains/:id", validateRequest({ params: idParamsSchema, body: updateDomainSchema }), asyncHandler(async (req, res) => {
  res.json(await taxonomyService.updateDomain(req.params.id, req.body));
}));

superadminOnly.post("/skills", validateRequest({ body: createSkillSchema }), asyncHandler(async (req, res) => {
  res.status(201).json(await taxonomyService.createSkill(req.body));
}));
superadminOnly.patch("/skills/:id", validateRequest({ params: idParamsSchema, body: updateSkillSchema }), asyncHandler(async (req, res) => {
  res.json(await taxonomyService.updateSkill(req.params.id, req.body));
}));

superadminOnly.post(
  "/skills/:skillId/items",
  validateRequest({ params: skillIdParamsSchema, body: createItemSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await taxonomyService.createItem(req.params.skillId, req.body));
  })
);
superadminOnly.patch("/items/:id", validateRequest({ params: idParamsSchema, body: updateItemSchema }), asyncHandler(async (req, res) => {
  res.json(await taxonomyService.updateItem(req.params.id, req.body));
}));
superadminOnly.delete("/items/:id", validateRequest({ params: idParamsSchema }), asyncHandler(async (req, res) => {
  await taxonomyService.deleteItem(req.params.id);
  res.status(204).send();
}));

taxonomyRoutes.use(superadminOnly);
