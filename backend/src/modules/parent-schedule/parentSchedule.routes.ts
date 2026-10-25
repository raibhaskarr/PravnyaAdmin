import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { requireParentAuth } from "../../common/middleware/parentAuth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { parentScheduleService } from "./parentSchedule.service";
import { createScheduleSlotSchema, scheduleKidParamsSchema, scheduleSlotParamsSchema } from "./parentSchedule.schemas";

export const parentScheduleRoutes = Router();

parentScheduleRoutes.use(requireParentAuth);

parentScheduleRoutes.get(
  "/:kidId/schedule",
  validateRequest({ params: scheduleKidParamsSchema }),
  asyncHandler(async (req, res) => {
    res.json(await parentScheduleService.list(req.parent!.id, req.params.kidId));
  })
);

parentScheduleRoutes.post(
  "/:kidId/schedule",
  validateRequest({ params: scheduleKidParamsSchema, body: createScheduleSlotSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await parentScheduleService.create(req.parent!.id, req.params.kidId, req.body));
  })
);

parentScheduleRoutes.patch(
  "/:kidId/schedule/:slotId",
  validateRequest({ params: scheduleSlotParamsSchema, body: createScheduleSlotSchema }),
  asyncHandler(async (req, res) => {
    res.json(await parentScheduleService.update(req.parent!.id, req.params.kidId, req.params.slotId, req.body));
  })
);

parentScheduleRoutes.delete(
  "/:kidId/schedule/:slotId",
  validateRequest({ params: scheduleSlotParamsSchema }),
  asyncHandler(async (req, res) => {
    await parentScheduleService.remove(req.parent!.id, req.params.kidId, req.params.slotId);
    res.status(204).send();
  })
);
