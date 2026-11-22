import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { requireParentAuth } from "../../common/middleware/parentAuth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { pushService } from "./push.service";

// Parent: /api/parent-push. The app asks for the public key, then registers the browser's subscription.
export const parentPushRoutes = Router();
parentPushRoutes.use(requireParentAuth);

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith("https://"), "Must be https"),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) })
});

parentPushRoutes.get(
  "/",
  asyncHandler(async (_req, res) => res.json({ publicKey: pushService.publicKey() }))
);
parentPushRoutes.post(
  "/subscriptions",
  validateRequest({ body: subscriptionSchema }),
  asyncHandler(async (req, res) => {
    await pushService.subscribe(req.parent!.id, req.body);
    res.status(204).end();
  })
);
parentPushRoutes.delete(
  "/subscriptions",
  validateRequest({ body: z.object({ endpoint: z.string().max(1000) }) }),
  asyncHandler(async (req, res) => {
    await pushService.unsubscribe(req.parent!.id, req.body.endpoint);
    res.status(204).end();
  })
);
