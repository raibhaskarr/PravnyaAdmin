import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { requireAuth } from "../../common/middleware/auth";
import { validateRequest } from "../../common/middleware/validateRequest";
import { authService } from "./auth.service";
import { changePasswordSchema, loginSchema } from "./auth.schemas";

export const authRoutes = Router();

authRoutes.post(
  "/login",
  validateRequest({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    res.json(await authService.login(req.body));
  })
);

// No role restriction -- any authenticated user (any role, any tenant or none) can change their
// own password. Self-service only; see the schema comment on changePassword.
authRoutes.patch(
  "/password",
  requireAuth,
  validateRequest({ body: changePasswordSchema }),
  asyncHandler(async (req, res) => {
    await authService.changePassword(req.user!, req.body);
    res.status(204).send();
  })
);
