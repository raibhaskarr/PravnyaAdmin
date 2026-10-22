import { Router } from "express";
import { asyncHandler } from "../../common/middleware/asyncHandler";
import { validateRequest } from "../../common/middleware/validateRequest";
import { requireParentAuth } from "../../common/middleware/parentAuth";
import { loginSchema, registerSchema, resetPasswordSchema, sendVerificationCodeSchema } from "./parentAuth.schemas";
import { parentAuthService } from "./parentAuth.service";

export const parentAuthRoutes = Router();

// No rate limiting yet (PravnyaAdmin has no rate-limit middleware at all today, unlike
// PranTrackingSystem's auth routes) -- a real gap before this sees real retail traffic, not
// addressed in this pass. The 10-minute single-use code expiry is the only mitigation right now.
parentAuthRoutes.post(
  "/send-verification-code",
  validateRequest({ body: sendVerificationCodeSchema }),
  asyncHandler(async (req, res) => {
    res.json(await parentAuthService.sendVerificationCode(req.body));
  })
);

parentAuthRoutes.post(
  "/register",
  validateRequest({ body: registerSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await parentAuthService.register(req.body));
  })
);

parentAuthRoutes.post(
  "/login",
  validateRequest({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    res.json(await parentAuthService.login(req.body));
  })
);

parentAuthRoutes.post(
  "/reset-password",
  validateRequest({ body: resetPasswordSchema }),
  asyncHandler(async (req, res) => {
    res.json(await parentAuthService.resetPassword(req.body));
  })
);

parentAuthRoutes.get(
  "/me",
  requireParentAuth,
  asyncHandler(async (req, res) => {
    res.json(await parentAuthService.me(req.parent!.id));
  })
);
