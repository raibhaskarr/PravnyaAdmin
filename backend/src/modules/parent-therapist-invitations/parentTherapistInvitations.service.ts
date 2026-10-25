import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { AppError, conflict, notFound } from "../../common/errors/AppError";
import { assertOwnsKid } from "../../common/access/parentKidAccess";
import { assertEmailNotTaken, devInviteUrl, expiryDate, hashToken, tokenValue } from "../../common/invitations/invitationToken";
import { invitationEmailService, buildInviteUrl } from "../therapist-invitations/invitationEmail.service";
import { InviteTherapistInput } from "./parentTherapistInvitations.schemas";

export const parentTherapistInvitationsService = {
  async listTherapists(parentId: string, kidId: string) {
    await assertOwnsKid(parentId, kidId);
    const links = await prisma.kidTherapist.findMany({
      where: { kidId },
      include: { therapist: { select: { id: true, name: true, disciplineIds: true, status: true, tenant: { select: { id: true, name: true } } } } }
    });
    return links.map((l) => l.therapist);
  },

  async listInvitations(parentId: string, kidId: string) {
    await assertOwnsKid(parentId, kidId);
    // Every invitation for this kid, admin-sent or parent-sent -- the useful kid-centric view for
    // a parent checking who's already pending before inviting someone new.
    return prisma.therapistInvitation.findMany({ where: { kidId }, orderBy: { createdAt: "desc" } });
  },

  // Mirrors therapistInvitationsService.inviteForKid closely -- same branching (an email that
  // already belongs to a Therapist anywhere gets linked directly, no invite needed; a brand-new
  // email gets a real invite). The one real difference: a parent has no tenant of their own, so a
  // new invitee joins the Pravnix retail tenant instead of "the inviting admin's own tenant".
  async inviteTherapist(parentId: string, kidId: string, input: InviteTherapistInput) {
    await assertOwnsKid(parentId, kidId);
    const kid = await prisma.kid.findUniqueOrThrow({ where: { id: kidId }, select: { firstName: true, lastName: true } });

    const existingTherapist = await prisma.therapist.findFirst({
      where: { user: { email: input.email } },
      include: { user: { select: { email: true, name: true } }, tenant: { select: { id: true, name: true } } }
    });

    if (existingTherapist) {
      await prisma.kidTherapist.createMany({ data: [{ kidId, therapistId: existingTherapist.id }], skipDuplicates: true });
      return { linked: true as const, therapist: existingTherapist };
    }

    if (!env.RETAIL_TENANT_ID) {
      throw new AppError(500, "RETAIL_TENANT_NOT_CONFIGURED", "Inviting a therapist isn't fully configured yet. Contact support.");
    }
    await assertEmailNotTaken(input.email);

    const [tenant, parent] = await Promise.all([
      prisma.tenant.findUniqueOrThrow({ where: { id: env.RETAIL_TENANT_ID }, select: { name: true } }),
      prisma.parent.findUniqueOrThrow({ where: { id: parentId }, select: { displayName: true, email: true } })
    ]);

    const raw = tokenValue();
    const invitation = await prisma.therapistInvitation.create({
      data: {
        tenantId: env.RETAIL_TENANT_ID,
        email: input.email,
        disciplineIds: input.disciplineIds,
        kidId,
        invitedByParentId: parentId,
        tokenHash: hashToken(raw),
        expiresAt: expiryDate()
      }
    });

    const inviteUrl = buildInviteUrl(raw);
    await invitationEmailService.sendTherapistInvitation({
      to: input.email,
      tenantName: tenant.name,
      invitedByName: parent.displayName ?? parent.email,
      inviteUrl,
      kidName: `${kid.firstName} ${kid.lastName}`
    });

    return { linked: false as const, invitation, inviteUrl: devInviteUrl(inviteUrl) };
  },

  // Scoped by kidId, not by who sent it -- listInvitations already shows the parent both
  // admin-sent and parent-sent invitations for their own kid, so letting them cancel either kind
  // here follows the same "it's my kid's care team" ownership logic, same as admin's own revoke
  // (therapistInvitations.service.ts) which only allows revoking a still-PENDING invitation.
  async revokeInvitation(parentId: string, kidId: string, invitationId: string) {
    await assertOwnsKid(parentId, kidId);
    const invitation = await prisma.therapistInvitation.findFirst({ where: { id: invitationId, kidId } });
    if (!invitation) throw notFound("Invitation not found");
    if (invitation.status !== "PENDING") throw conflict("Only a pending invitation can be revoked.");
    return prisma.therapistInvitation.update({ where: { id: invitationId }, data: { status: "REVOKED" } });
  },

  // Issues a fresh token + expiry and re-sends the same email -- the old link stops working the
  // moment this runs, since lookup is by tokenHash. Also the one path that can bring an EXPIRED
  // invitation back to life (not just PENDING), so a parent who let one lapse isn't stuck starting
  // over with a brand-new invite.
  async resendInvitation(parentId: string, kidId: string, invitationId: string) {
    await assertOwnsKid(parentId, kidId);
    const invitation = await prisma.therapistInvitation.findFirst({ where: { id: invitationId, kidId } });
    if (!invitation) throw notFound("Invitation not found");
    if (invitation.status !== "PENDING" && invitation.status !== "EXPIRED") {
      throw conflict("Only a pending or expired invitation can be resent.");
    }

    const kid = await prisma.kid.findUniqueOrThrow({ where: { id: kidId }, select: { firstName: true, lastName: true } });
    const [tenant, parent] = await Promise.all([
      prisma.tenant.findUniqueOrThrow({ where: { id: invitation.tenantId }, select: { name: true } }),
      prisma.parent.findUniqueOrThrow({ where: { id: parentId }, select: { displayName: true, email: true } })
    ]);

    const raw = tokenValue();
    const updated = await prisma.therapistInvitation.update({
      where: { id: invitationId },
      data: { status: "PENDING", tokenHash: hashToken(raw), expiresAt: expiryDate() }
    });

    const inviteUrl = buildInviteUrl(raw);
    await invitationEmailService.sendTherapistInvitation({
      to: invitation.email,
      tenantName: tenant.name,
      invitedByName: parent.displayName ?? parent.email,
      inviteUrl,
      kidName: `${kid.firstName} ${kid.lastName}`
    });

    return { invitation: updated, inviteUrl: devInviteUrl(inviteUrl) };
  },

  async unlinkTherapist(parentId: string, kidId: string, therapistId: string) {
    await assertOwnsKid(parentId, kidId);
    const result = await prisma.kidTherapist.deleteMany({ where: { kidId, therapistId } });
    if (result.count === 0) throw notFound("That therapist isn't on this kid's care team.");
  }
};
