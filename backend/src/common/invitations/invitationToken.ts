import { createHash, randomBytes } from "crypto";
import { prisma } from "../../config/prisma";
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

// Surfaced in the API response (and shown in the UI) everywhere, including production, for now --
// deliberate for this active testing phase so whoever's inviting someone doesn't have to go check
// an inbox each time. Email still sends in parallel (see invitationEmail.service.ts), this is
// purely an additional convenience. Revert to gating this behind `env.NODE_ENV !== "production"`
// once real, non-test invitees are the norm and the link should only ever reach them by email.
export function devInviteUrl(url: string): string | undefined {
  return url;
}
