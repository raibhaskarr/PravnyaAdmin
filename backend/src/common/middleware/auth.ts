import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { UserRole } from "@prisma/client";
import { env } from "../../config/env";
import { forbidden, unauthorized } from "../errors/AppError";

export type AuthUser = {
  id: string;
  role: UserRole;
  // null only for SUPERADMIN -- every other role is scoped to exactly one tenant.
  tenantId: string | null;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw unauthorized();

  try {
    const payload = jwt.verify(header.slice("Bearer ".length), env.JWT_SECRET) as AuthUser;
    req.user = { id: payload.id, role: payload.role, tenantId: payload.tenantId };
    next();
  } catch {
    throw unauthorized("Invalid or expired token");
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) throw forbidden();
    next();
  };
}

// Every tenant-scoped route calls this after requireAuth. SUPERADMIN has no tenantId and is
// blocked outright -- superadmin support/impersonation into a tenant is a separate future
// feature, not built here. Every other role always has a tenantId (enforced at signup).
export function requireTenantScope(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) throw unauthorized();
  if (req.user.role === "SUPERADMIN" || !req.user.tenantId) {
    throw forbidden("This endpoint is scoped to a tenant account");
  }
  next();
}

// VIEWER can read but never mutate. Applied to write routes only, after requireTenantScope.
export function blockViewer(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role === "VIEWER") throw forbidden("Viewers have read-only access");
  next();
}
