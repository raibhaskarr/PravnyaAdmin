import { createHash, randomBytes } from "crypto";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { conflict } from "../errors/AppError";

// Shared by every email-invite flow (therapist invitations, tenant invitations, ...) -- same
// random-token-hashed-at-rest, 14-day-expiry convention throughout.
export const INVITATION_EXPIRY_DAYS = 14;

export function tokenValue(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function expiryDate(days = INVITATION_EXPIRY_DAYS): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

export async function assertEmailNotTaken(email: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw conflict("That email already has an account.", "EMAIL_TAKEN");
}

// Dev convenience only -- in production an invite link only ever reaches the invitee via the
// actual email, never through an API response.
export function devInviteUrl(url: string): string | undefined {
  return env.NODE_ENV === "production" ? undefined : url;
}
