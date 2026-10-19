import { prisma } from "../../config/prisma";
import { conflict, notFound } from "../../common/errors/AppError";
import { AuthUser } from "../../common/middleware/auth";
import { assertCanAccessKid, kidVisibilityFilter } from "../../common/access/kidAccess";
import { recordAuditLog } from "../../common/audit/auditLog.service";
import { CreateKidInput, UpdateKidInput } from "./kids.schemas";

// Shared across list/get -- includes each assigned therapist's own tenant so the frontend can
// label a cross-tenant ("guest") therapist, since a kid's support team is no longer guaranteed to
// all share the kid's own tenant, plus disciplineIds/status so the support team table can render
// a discipline and an active/deactivated role without a second lookup against the home roster
// (which wouldn't even cover a cross-tenant guest). See kidAccess.ts. Also includes the kid's
// parent, which may be null -- not every kid has one.
const kidDetailInclude = {
  therapists: {
    include: { therapist: { select: { id: true, name: true, disciplineIds: true, status: true, tenant: { select: { id: true, name: true } } } } }
  },
  parent: true
};

type ParentFieldsInput = {
  parentEmail: string;
  parentMobile: string;
  fatherName?: string;
  motherName?: string;
  addressLine1?: string;
  city?: string;
};

// Find-or-create by email, silently -- shared by create() (onboarding) and update() (linking a
// parent to a kid that was added without one). Never overwrites an existing parent's info with
// whatever this request happened to send, and the response is identical whether the email was
// brand new or already existed -- this tenant's admin shouldn't be able to tell, from this call
// alone, whether a parent record already existed elsewhere (see
// docs/manual/06-parent-kid-onboarding-spec.md).
function findOrCreateParent(input: ParentFieldsInput) {
  return prisma.parent.upsert({
    where: { email: input.parentEmail },
    update: {},
    create: {
      email: input.parentEmail,
      mobile: input.parentMobile,
      fatherName: input.fatherName,
      motherName: input.motherName,
      addressLine1: input.addressLine1,
      city: input.city
    }
  });
}

export const kidsService = {
  async list(user: AuthUser) {
    const filter = await kidVisibilityFilter(user);
    return prisma.kid.findMany({
      where: filter,
      include: kidDetailInclude,
      orderBy: { firstName: "asc" }
    });
  },

  async get(user: AuthUser, kidId: string) {
    await assertCanAccessKid(user, kidId);
    const kid = await prisma.kid.findUnique({
      where: { id: kidId },
      include: { ...kidDetailInclude, goals: true }
    });
    if (!kid) throw notFound("Kid not found");
    return kid;
  },

  async create(actor: AuthUser, input: CreateKidInput) {
    let parentId: string | undefined;
    if (input.parentEmail) {
      // Schema-guaranteed non-null whenever parentEmail is set (see createKidSchema's refine).
      const parent = await findOrCreateParent({ ...input, parentEmail: input.parentEmail, parentMobile: input.parentMobile! });
      parentId = parent.id;
    }

    const kid = await prisma.kid.create({
      data: {
        tenantId: actor.tenantId!,
        parentId,
        firstName: input.firstName,
        lastName: input.lastName,
        dob: input.dob ? new Date(input.dob) : undefined,
        therapists: { create: input.therapistIds.map((therapistId) => ({ therapistId })) }
      },
      include: { therapists: true }
    });
    // No kid name here -- this AuditLog table is shared with the superadmin's per-tenant Activity
    // view (tenants.service.ts's auditLog()), which is deliberately kept blind to individual kid
    // identity (see health()'s own comment). The event itself is fine to surface; a child's name
    // is not.
    await recordAuditLog(actor, { tenantId: actor.tenantId!, action: "KID_ADDED", fromValue: null, toValue: null });
    return kid;
  },

  async update(user: AuthUser, kidId: string, input: UpdateKidInput) {
    const existing = await assertCanAccessKid(user, kidId);

    let parentId: string | undefined;
    if (input.parentEmail) {
      // Linking a parent is for a kid that doesn't have one yet -- reassigning a kid that already
      // has a parent on file to a *different* parent is a more sensitive operation (could be a
      // typo'd email silently repointing clinical history at the wrong family) and isn't what this
      // path is for.
      if (existing.parentId) throw conflict("This kid already has a parent on file");
      const parent = await findOrCreateParent({ ...input, parentEmail: input.parentEmail, parentMobile: input.parentMobile! });
      parentId = parent.id;
      await recordAuditLog(user, { tenantId: user.tenantId!, action: "PARENT_LINKED", fromValue: null, toValue: null });
    }

    if (input.therapistIds !== undefined) {
      // Therapist ids are intentionally not tenant-scoped here -- a kid's support team can
      // include a guest therapist from another tenant (see kidAccess.ts). Still worth a clean
      // existence check up front rather than letting a bad id fail as a raw FK error.
      const existingCount = await prisma.therapist.count({ where: { id: { in: input.therapistIds } } });
      if (existingCount !== input.therapistIds.length) throw notFound("One or more selected therapists do not exist");

      await prisma.kidTherapist.deleteMany({ where: { kidId } });
      await prisma.kidTherapist.createMany({
        data: input.therapistIds.map((therapistId) => ({ kidId, therapistId }))
      });
    }

    return prisma.kid.update({
      where: { id: kidId },
      data: {
        ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
        ...(input.dob !== undefined ? { dob: input.dob ? new Date(input.dob) : null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(parentId !== undefined ? { parentId } : {})
      },
      include: kidDetailInclude
    });
  }
};
