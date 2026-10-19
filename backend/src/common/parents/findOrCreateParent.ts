import { prisma } from "../../config/prisma";

export type ParentFieldsInput = {
  parentEmail: string;
  parentMobile: string;
  fatherName?: string;
  motherName?: string;
  addressLine1?: string;
  city?: string;
};

// Find-or-create by email, silently -- shared by kid creation/linking (kids.service.ts) and
// standalone parent creation (parents.service.ts). Never overwrites an existing parent's info
// (including createdByTenantId, so provenance always reflects whoever created the record first)
// with whatever this request happened to send, and the response is identical whether the email
// was brand new or already existed -- this tenant's admin shouldn't be able to tell, from this
// call alone, whether a parent record already existed elsewhere (see
// docs/manual/06-parent-kid-onboarding-spec.md).
export function findOrCreateParent(input: ParentFieldsInput & { actorTenantId: string }) {
  return prisma.parent.upsert({
    where: { email: input.parentEmail },
    update: {},
    create: {
      email: input.parentEmail,
      mobile: input.parentMobile,
      fatherName: input.fatherName,
      motherName: input.motherName,
      addressLine1: input.addressLine1,
      city: input.city,
      createdByTenantId: input.actorTenantId
    }
  });
}
