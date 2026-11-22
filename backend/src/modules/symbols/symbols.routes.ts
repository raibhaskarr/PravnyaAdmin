import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { requireAuth, requireTenantScope } from "../../common/middleware/auth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { searchSymbols, SYMBOL_CREDIT } from "./symbols";

export const symbolsRoutes = Router();
symbolsRoutes.use(requireAuth, requireTenantScope);

symbolsRoutes.get(
  "/",
  validateRequest({ query: z.object({ q: z.string().max(60) }) }),
  asyncHandler(async (req, res) => res.json({ credit: SYMBOL_CREDIT, symbols: searchSymbols(req.query.q as string) }))
);
