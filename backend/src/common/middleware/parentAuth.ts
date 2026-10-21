import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { unauthorized } from "../errors/AppError";

// Deliberately separate from common/middleware/auth.ts's requireAuth/AuthUser -- a parent is not
// a User row (see Parent's doc comment in schema.prisma), so it gets its own token shape
// (`kind: "parent"`, no role/tenantId) and its own request property, rather than overloading
// req.user with a different meaning depending on who's calling.

export type ParentAuthUser = {
  id: string;
  kind: "parent";
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      parent?: ParentAuthUser;
    }
  }
}

export function signParentToken(parentId: string): string {
  const payload: ParentAuthUser = { id: parentId, kind: "parent" };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions);
}

export function requireParentAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw unauthorized();

  try {
    const payload = jwt.verify(header.slice("Bearer ".length), env.JWT_SECRET) as Partial<ParentAuthUser>;
    // Same JWT_SECRET as staff tokens (simpler secret management than a second one to rotate),
    // but a staff token has no `kind` field -- reject it here so a leaked/misused staff token
    // can never be replayed against parent-only routes, and vice versa (requireAuth never checks
    // `kind`, but a parent token also has no `role`, which requireAuth's callers all need).
    if (payload.kind !== "parent" || !payload.id) throw unauthorized();
    req.parent = { id: payload.id, kind: "parent" };
    next();
  } catch {
    throw unauthorized("Invalid or expired token");
  }
}
