import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { requireAuth } from "../../common/middleware/auth";
import { manualService } from "./manual.service";

export const manualRoutes = Router();

// Documentation isn't sensitive -- any authenticated user (superadmin or any tenant role) can
// read it.
manualRoutes.use(requireAuth);

manualRoutes.get("/docs", asyncHandler(async (_req, res) => res.json(manualService.listDocs())));
manualRoutes.get("/db-structure", asyncHandler(async (_req, res) => res.json(manualService.dbStructure())));
