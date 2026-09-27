import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { validateRequest } from "../../common/middleware/validateRequest";
import { authService } from "./auth.service";
import { loginSchema } from "./auth.schemas";

export const authRoutes = Router();

authRoutes.post(
  "/login",
  validateRequest({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    res.json(await authService.login(req.body));
  })
);
