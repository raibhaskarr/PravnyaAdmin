import { UserRole } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { conflict, gone, notFound } from "../../common/errors/AppError";
import { AuthUser, signToken } from "../../common/middleware/auth";
import { assertEmailNotTaken, devInviteUrl, expiryDate, hashToken, tokenValue } from "../../common/invitations/invitationToken";
import { authService } from "../auth/auth.service";
import { invitationEmailService, buildTenantSignupUrl } from "../therapist-invitations/invitationEmail.service";
import type { AcceptTenantInvitationInput, InviteTenantInput } from "./tenantInvitations.schemas";

async function assertSlugNotTaken(slug: string) {
  const existing = await prisma.tenant.findUnique({ where: { slug } });
  if (existing) throw conflict("That slug is already in use.", "SLUG_TAKEN");
}

async function markExpiredIfNeeded<T extends { id: string; status: string; expiresAt: Date }>(invitation: T): Promise<T> {
  if (invitation.status === "PENDING" && invitation.expiresAt <= new Date()) {
    await prisma.tenantInvitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } });
    return { ...invitation, status: "EXPIRED" };
  }
  return invitation;
}

export const tenantInvitationsService = {
  list() {
    return prisma.tenantInvitation.findMany({ orderBy: { createdAt: "desc" } });
  },

  async revoke(invitationId: string) {
    const invitation = await prisma.tenantInvitation.findUnique({ where: { id: invitationId } });
    if (!invitation) throw notFound("Invitation not found");
    if (invitation.status !== "PENDING") throw conflict("Only a pending invitation can be revoked.");
    return prisma.tenantInvitation.update({ where: { id: invitationId }, data: { status: "REVOKED" } });
  },

  // No real Tenant row is created yet -- just the offer. The real Tenant + TENANT_ADMIN User only
  // get created on accept, once the invitee has set their own password.
  async invite(user: AuthUser, input: InviteTenantInput) {
    await assertSlugNotTaken(input.slug);
    await assertEmailNotTaken(input.email);

    const invitedBy = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true } });

    const raw = tokenValue();
    const invitation = await prisma.tenantInvitation.create({
      data: {
        name: input.name,
        slug: input.slug,
        email: input.email,
        invitedById: user.id,
        tokenHash: hashToken(raw),
        expiresAt: expiryDate()
      }
    });

    const signupUrl = buildTenantSignupUrl(raw);
    await invitationEmailService.sendTenantInvitation({ to: input.email, tenantName: input.name, invitedByName: invitedBy.name, signupUrl });

    return { invitation, signupUrl: devInviteUrl(signupUrl) };
  },

  async previewByToken(token: string) {
    const invitation = await prisma.tenantInvitation.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!invitation) throw notFound("This invite link isn't valid.");
    const current = await markExpiredIfNeeded(invitation);
    if (current.status !== "PENDING") throw gone("This invite has already been used or is no longer valid.");

    return { name: invitation.name, slug: invitation.slug, email: invitation.email };
  },

  async accept(token: string, input: AcceptTenantInvitationInput) {
    const invitation = await prisma.tenantInvitation.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!invitation) throw notFound("This invite link isn't valid.");
    const current = await markExpiredIfNeeded(invitation);
    if (current.status !== "PENDING") throw gone("This invite has already been used or is no longer valid.");

    // Race safety -- re-check both, same as accepting a therapist invitation.
    await assertSlugNotTaken(invitation.slug);
    await assertEmailNotTaken(invitation.email);

    const passwordHash = await authService.hashPassword(input.password);

    const tenant = await prisma.$transaction(async (tx) => {
      const tenantRecord = await tx.tenant.create({
        data: {
          name: invitation.name,
          slug: invitation.slug,
          leadOwnerName: input.adminName,
          leadOwnerEmail: invitation.email,
          users: {
            create: {
              email: invitation.email,
              name: input.adminName,
              role: UserRole.TENANT_ADMIN,
              passwordHash
            }
          }
        },
        include: { users: true }
      });

      await tx.tenantInvitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });

      return tenantRecord;
    });

    const adminUser = tenant.users[0];
    const authUser: AuthUser = { id: adminUser.id, role: adminUser.role, tenantId: adminUser.tenantId };
    const jwt = signToken(authUser);

    return {
      token: jwt,
      user: { id: adminUser.id, email: adminUser.email, name: adminUser.name, role: adminUser.role, tenantId: adminUser.tenantId }
    };
  }
};
