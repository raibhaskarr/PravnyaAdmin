import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/AppError";
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
  }
};
