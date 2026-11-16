import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { requireParentAuth } from "../../common/middleware/parentAuth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { parentAccountService } from "./parentAccount.service";
import { deleteAccountSchema, exportQuerySchema } from "./parentAccount.schemas";

// /api/parent-account: the signed-in parent's own account -- delete (with a 30-day grace period),
// cancel that, and download a copy of their data.
export const parentAccountRoutes = Router();

// Opened by the browser itself (a plain link), so it carries a short-lived signed token instead of
// the Authorization header.
parentAccountRoutes.get(
  "/export",
  validateRequest({ query: exportQuerySchema }),
  asyncHandler(async (req, res) => {
    const data = await parentAccountService.exportFromLink(req.query.token as string);
    res.setHeader("Content-Disposition", `attachment; filename="pravnya-data-${data.exportedAt.slice(0, 10)}.json"`);
    res.setHeader("Cache-Control", "no-store");
    res.type("application/json").send(JSON.stringify(data, null, 2));
  })
);

parentAccountRoutes.use(requireParentAuth);

parentAccountRoutes.post(
  "/export-link",
  asyncHandler(async (req, res) => res.json(parentAccountService.exportLink(req.parent!.id)))
);

parentAccountRoutes.post(
  "/delete",
  validateRequest({ body: deleteAccountSchema }),
  asyncHandler(async (req, res) => res.json(await parentAccountService.requestDeletion(req.parent!.id, req.body.password)))
);

parentAccountRoutes.post(
  "/cancel-deletion",
  asyncHandler(async (req, res) => res.json(await parentAccountService.cancelDeletion(req.parent!.id)))
);
