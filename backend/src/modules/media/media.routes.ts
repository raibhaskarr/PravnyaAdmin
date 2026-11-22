import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { blockViewer, requireAuth, requireTenantScope } from "../../common/middleware/auth";
import { requireParentAuth } from "../../common/middleware/parentAuth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { notFound } from "../../common/errors/AppError";
import { mediaService, verifyMediaLink } from "./media.service";
import { searchSymbols, SYMBOL_CREDIT } from "../symbols/symbols";

/** With kidId: a photo for that child. Without: a centre-wide photo, for the centre's templates. */
const uploadSchema = z.object({ kidId: z.string().uuid().optional(), base64: z.string().min(1).max(4_200_000) });

export const mediaRoutes = Router();

// Public, but only with a valid signed link (see mediaPath).
mediaRoutes.get(
  "/:id",
  validateRequest({ params: z.object({ id: z.string().uuid() }), query: z.object({ exp: z.string().max(20), sig: z.string().max(100) }) }),
  asyncHandler(async (req, res) => {
    if (!verifyMediaLink(req.params.id, req.query.exp as string, req.query.sig as string)) throw notFound();
    const { body, mimeType } = await mediaService.read(req.params.id);
    // The apps load pictures from another origin than the API's.
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Cache-Control", "private, max-age=86400, immutable");
    res.type(mimeType).send(body);
  })
);

mediaRoutes.post(
  "/",
  requireAuth,
  requireTenantScope,
  blockViewer,
  validateRequest({ body: uploadSchema }),
  asyncHandler(async (req, res) => res.status(201).json(await mediaService.upload(req.user!, req.body)))
);

// Parent: /api/parent-kids/:kidId/media and /symbols, for schedules the parent makes.
export const parentMediaRoutes = Router();
parentMediaRoutes.use(requireParentAuth);

parentMediaRoutes.post(
  "/:kidId/media",
  validateRequest({ params: z.object({ kidId: z.string().uuid() }), body: z.object({ base64: z.string().min(1).max(4_200_000) }) }),
  asyncHandler(async (req, res) => res.status(201).json(await mediaService.uploadForParent(req.parent!.id, req.params.kidId, req.body.base64)))
);
parentMediaRoutes.get(
  "/:kidId/symbols",
  validateRequest({ params: z.object({ kidId: z.string().uuid() }), query: z.object({ q: z.string().max(60) }) }),
  asyncHandler(async (req, res) => res.json({ credit: SYMBOL_CREDIT, symbols: searchSymbols(req.query.q as string) }))
);
