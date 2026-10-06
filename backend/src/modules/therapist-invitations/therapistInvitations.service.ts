import { createHash, randomBytes } from "crypto";
import { UserRole } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { conflict, gone, notFound } from "../../common/errors/AppError";
import { AuthUser, signToken } from "../../common/middleware/auth";
import { assertCanAccessKid } from "../../common/access/kidAccess";
import { authService } from "../auth/auth.service";
import { invitationEmailService, buildInviteUrl } from "./invitationEmail.service";
import type { AcceptInvitationInput, InviteForKidInput, InviteGeneralInput } from "./therapistInvitations.schemas";

const INVITATION_EXPIRY_DAYS = 14;

function tokenValue() {
  return randomBytes(32).toString("base64url");
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function expiryDate() {
  const date = new Date();
  date.setDate(date.getDate() + INVITATION_EXPIRY_DAYS);
  return date;
}

// Dev convenience only -- in production the invite link only ever reaches the invitee via the
// actual email, never through an API response.
function devInviteUrl(url: string) {
  return env.NODE_ENV === "production" ? undefined : url;
}

async function assertEmailNotTaken(email: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw conflict("That email already has an account.", "EMAIL_TAKEN");
}

async function markExpiredIfNeeded<T extends { id: string; status: string; expiresAt: Date }>(invitation: T): Promise<T> {
  if (invitation.status === "PENDING" && invitation.expiresAt <= new Date()) {
    await prisma.therapistInvitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } });
    return { ...invitation, status: "EXPIRED" };
  }
  return invitation;
}

export const therapistInvitationsService = {
  list(tenantId: string) {
    return prisma.therapistInvitation.findMany({
      where: { tenantId },
      include: { kid: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" }
    });
  },

  async revoke(user: AuthUser, invitationId: string) {
    const invitation = await prisma.therapistInvitation.findFirst({ where: { id: invitationId, tenantId: user.tenantId! } });
    if (!invitation) throw notFound("Invitation not found");
    if (invitation.status !== "PENDING") throw conflict("Only a pending invitation can be revoked.");
    return prisma.therapistInvitation.update({ where: { id: invitationId }, data: { status: "REVOKED" } });
  },

  // Flow 1: the general "invite a therapist" form on the Therapists page. The admin already
  // knows this person and can set their disciplines up front.
  async inviteGeneral(user: AuthUser, input: InviteGeneralInput) {
    await assertEmailNotTaken(input.email);

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId! }, select: { name: true } });
    const invitedBy = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true } });

    const raw = tokenValue();
    const invitation = await prisma.therapistInvitation.create({
      data: {
        tenantId: user.tenantId!,
        email: input.email,
        name: input.name,
        disciplineIds: input.disciplineIds,
        invitedById: user.id,
        tokenHash: hashToken(raw),
        expiresAt: expiryDate()
      }
    });

    const inviteUrl = buildInviteUrl(raw);
    await invitationEmailService.sendTherapistInvitation({ to: input.email, tenantName: tenant.name, invitedByName: invitedBy.name, inviteUrl });

    return { invitation, inviteUrl: devInviteUrl(inviteUrl) };
  },

  // Flow 2: inviting someone onto one specific kid's support team by email only. If that email
  // already belongs to a therapist in this tenant, just link them straight to the kid -- no
  // invite needed. Otherwise send a real invite, scoped to just this one kid on acceptance.
  async inviteForKid(user: AuthUser, kidId: string, input: InviteForKidInput) {
    const kid = await assertCanAccessKid(user, kidId);

    const existingTherapist = await prisma.therapist.findFirst({
      where: { tenantId: user.tenantId!, user: { email: input.email } },
      include: { user: { select: { email: true, name: true } } }
    });

    if (existingTherapist) {
      await prisma.kidTherapist.createMany({ data: [{ kidId, therapistId: existingTherapist.id }], skipDuplicates: true });
      return { linked: true as const, therapist: existingTherapist };
    }

    await assertEmailNotTaken(input.email);

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId! }, select: { name: true } });
    const invitedBy = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true } });

    const raw = tokenValue();
    const invitation = await prisma.therapistInvitation.create({
      data: {
        tenantId: user.tenantId!,
        email: input.email,
        disciplineIds: input.disciplineIds,
        kidId,
        invitedById: user.id,
        tokenHash: hashToken(raw),
        expiresAt: expiryDate()
      }
    });

    const inviteUrl = buildInviteUrl(raw);
    await invitationEmailService.sendTherapistInvitation({
      to: input.email,
      tenantName: tenant.name,
      invitedByName: invitedBy.name,
      inviteUrl,
      kidName: `${kid.firstName} ${kid.lastName}`
    });

    return { linked: false as const, invitation, inviteUrl: devInviteUrl(inviteUrl) };
  },

  async previewByToken(token: string) {
    const invitation = await prisma.therapistInvitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { tenant: { select: { name: true } }, kid: { select: { firstName: true, lastName: true } } }
    });
    if (!invitation) throw notFound("This invite link isn't valid.");
    const current = await markExpiredIfNeeded(invitation);
    if (current.status !== "PENDING") throw gone("This invite has already been used or is no longer valid.");

    return {
      email: invitation.email,
      name: invitation.name,
      tenantName: invitation.tenant.name,
      kidName: invitation.kid ? `${invitation.kid.firstName} ${invitation.kid.lastName}` : null
    };
  },

  async accept(token: string, input: AcceptInvitationInput) {
    const invitation = await prisma.therapistInvitation.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!invitation) throw notFound("This invite link isn't valid.");
    const current = await markExpiredIfNeeded(invitation);
    if (current.status !== "PENDING") throw gone("This invite has already been used or is no longer valid.");

    await assertEmailNotTaken(invitation.email);

    const passwordHash = await authService.hashPassword(input.password);

    const therapist = await prisma.$transaction(async (tx) => {
      const therapistRecord = await tx.therapist.create({
        data: {
          tenant: { connect: { id: invitation.tenantId } },
          name: input.name,
          disciplineIds: invitation.disciplineIds,
          user: {
            create: {
              email: invitation.email,
              name: input.name,
              role: UserRole.THERAPIST,
              passwordHash,
              tenant: { connect: { id: invitation.tenantId } }
            }
          }
        },
        include: { user: true }
      });

      if (invitation.kidId) {
        await tx.kidTherapist.create({ data: { kidId: invitation.kidId, therapistId: therapistRecord.id } });
      }

      await tx.therapistInvitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });

      return therapistRecord;
    });

    const authUser: AuthUser = { id: therapist.user.id, role: therapist.user.role, tenantId: therapist.user.tenantId };
    const jwt = signToken(authUser);

    return {
      token: jwt,
      user: { id: therapist.user.id, email: therapist.user.email, name: therapist.user.name, role: therapist.user.role, tenantId: therapist.user.tenantId }
    };
  }
};
