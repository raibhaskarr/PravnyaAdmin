import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { validateRequest } from "../../common/middleware/validateRequest";
import { requireParentAuth } from "../../common/middleware/parentAuth";
import { createParentKidSchema, parentKidParamsSchema, updateParentKidSchema } from "./parentKids.schemas";
import { parentKidsService } from "./parentKids.service";

export const parentKidsRoutes = Router();

parentKidsRoutes.use(requireParentAuth);

parentKidsRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await parentKidsService.listMyKids(req.parent!.id));
  })
);

parentKidsRoutes.post(
  "/",
  validateRequest({ body: createParentKidSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await parentKidsService.createFirstKid(req.parent!.id, req.body));
  })
);

parentKidsRoutes.patch(
  "/:kidId",
  validateRequest({ params: parentKidParamsSchema, body: updateParentKidSchema }),
  asyncHandler(async (req, res) => {
    res.json(await parentKidsService.updateMyKid(req.parent!.id, req.params.kidId, req.body));
  })
);
