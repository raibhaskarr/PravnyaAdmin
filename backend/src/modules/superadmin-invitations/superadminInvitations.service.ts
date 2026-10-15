import { UserRole } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { conflict, gone, notFound } from "../../common/errors/AppError";
import { AuthUser, signToken } from "../../common/middleware/auth";
import { assertEmailNotTaken, devInviteUrl, expiryDate, hashToken, tokenValue } from "../../common/invitations/invitationToken";
import { authService } from "../auth/auth.service";
import { invitationEmailService, buildSuperadminSignupUrl } from "../therapist-invitations/invitationEmail.service";
import type { AcceptSuperadminInvitationInput, InviteSuperadminInput } from "./superadminInvitations.schemas";

async function markExpiredIfNeeded<T extends { id: string; status: string; expiresAt: Date }>(invitation: T): Promise<T> {
  if (invitation.status === "PENDING" && invitation.expiresAt <= new Date()) {
    await prisma.superadminInvitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } });
    return { ...invitation, status: "EXPIRED" };
  }
  return invitation;
}

export const superadminInvitationsService = {
  // No tenant to filter by -- SUPERADMIN is the one role with tenantId null, so this is just
  // every User row with that role.
  listSuperadmins() {
    return prisma.user.findMany({ where: { role: "SUPERADMIN" }, orderBy: { createdAt: "desc" }, select: { id: true, email: true, name: true, createdAt: true } });
  },

  list() {
    return prisma.superadminInvitation.findMany({ orderBy: { createdAt: "desc" } });
  },

  async revoke(invitationId: string) {
    const invitation = await prisma.superadminInvitation.findUnique({ where: { id: invitationId } });
    if (!invitation) throw notFound("Invitation not found");
    if (invitation.status !== "PENDING") throw conflict("Only a pending invitation can be revoked.");
    return prisma.superadminInvitation.update({ where: { id: invitationId }, data: { status: "REVOKED" } });
  },

  // No real User row is created yet -- just the offer. The real User only gets created on accept,
  // once the invitee has set their own password -- same discipline as tenant/therapist invites.
  async invite(user: AuthUser, input: InviteSuperadminInput) {
    await assertEmailNotTaken(input.email);

    const invitedBy = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true } });

    const raw = tokenValue();
    const invitation = await prisma.superadminInvitation.create({
      data: {
        email: input.email,
        invitedById: user.id,
        tokenHash: hashToken(raw),
        expiresAt: expiryDate()
      }
    });

    const signupUrl = buildSuperadminSignupUrl(raw);
    await invitationEmailService.sendSuperadminInvitation({ to: input.email, invitedByName: invitedBy.name, signupUrl });

    return { invitation, signupUrl: devInviteUrl(signupUrl) };
  },

  async previewByToken(token: string) {
    const invitation = await prisma.superadminInvitation.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!invitation) throw notFound("This invite link isn't valid.");
    const current = await markExpiredIfNeeded(invitation);
    if (current.status !== "PENDING") throw gone("This invite has already been used or is no longer valid.");

    return { email: invitation.email };
  },

  async accept(token: string, input: AcceptSuperadminInvitationInput) {
    const invitation = await prisma.superadminInvitation.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!invitation) throw notFound("This invite link isn't valid.");
    const current = await markExpiredIfNeeded(invitation);
    if (current.status !== "PENDING") throw gone("This invite has already been used or is no longer valid.");

    // Race safety -- re-check, same as accepting a tenant/therapist invitation.
    await assertEmailNotTaken(invitation.email);

    const passwordHash = await authService.hashPassword(input.password);

    const [user] = await prisma.$transaction([
      prisma.user.create({
        data: { email: invitation.email, name: input.name, role: UserRole.SUPERADMIN, passwordHash }
      }),
      prisma.superadminInvitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } })
    ]);

    const authUser: AuthUser = { id: user.id, role: user.role, tenantId: user.tenantId };
    const jwt = signToken(authUser);

    return {
      token: jwt,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, tenantId: user.tenantId }
    };
  }
};
