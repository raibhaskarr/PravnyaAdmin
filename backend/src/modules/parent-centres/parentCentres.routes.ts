import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { requireParentAuth } from "../../common/middleware/parentAuth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { parentCentresService } from "./parentCentres.service";
import { createCentreSchema } from "./parentCentres.schemas";

// Centre isn't kid-scoped (it's a global directory, not tied to one kid), so this mounts at its
// own flat prefix rather than the shared /api/parent-kids prefix every kid-scoped parent module
// uses.
export const parentCentresRoutes = Router();

parentCentresRoutes.use(requireParentAuth);

parentCentresRoutes.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await parentCentresService.list());
  })
);

parentCentresRoutes.post(
  "/",
  validateRequest({ body: createCentreSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await parentCentresService.create(req.body));
  })
);
