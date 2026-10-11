import assert from "node:assert/strict";
import { test } from "node:test";
import { prisma } from "../../config/prisma";
import { assertCanAccessKid, kidVisibilityFilter } from "./kidAccess";

async function createTenantWithKidsAndTherapist() {
  const tenant = await prisma.tenant.create({ data: { name: "Test Centre", slug: `test-centre-${Date.now()}-${Math.random().toString(36).slice(2)}` } });

  const therapistUser = await prisma.user.create({
    data: { email: `therapist-${Date.now()}@example.com`, name: "Test Therapist", role: "THERAPIST", passwordHash: "x", tenantId: tenant.id }
  });
  const therapist = await prisma.therapist.create({ data: { tenantId: tenant.id, userId: therapistUser.id, name: "Test Therapist" } });

  const assignedKid = await prisma.kid.create({ data: { tenantId: tenant.id, firstName: "Assigned", lastName: "Kid" } });
  const unassignedKid = await prisma.kid.create({ data: { tenantId: tenant.id, firstName: "Unassigned", lastName: "Kid" } });
  await prisma.kidTherapist.create({ data: { kidId: assignedKid.id, therapistId: therapist.id } });

  return { tenant, therapistUser, assignedKid, unassignedKid };
}

test("THERAPIST role only sees kids they're assigned to", async () => {
  const { tenant, therapistUser, assignedKid, unassignedKid } = await createTenantWithKidsAndTherapist();

  const filter = await kidVisibilityFilter({ id: therapistUser.id, role: "THERAPIST", tenantId: tenant.id });
  const visible = await prisma.kid.findMany({ where: filter });

  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, assignedKid.id);

  await assertCanAccessKid({ id: therapistUser.id, role: "THERAPIST", tenantId: tenant.id }, assignedKid.id);
  await assert.rejects(() => assertCanAccessKid({ id: therapistUser.id, role: "THERAPIST", tenantId: tenant.id }, unassignedKid.id));
});

test("TENANT_ADMIN and VIEWER see every kid in the tenant", async () => {
  const { tenant, assignedKid, unassignedKid } = await createTenantWithKidsAndTherapist();

  for (const role of ["TENANT_ADMIN", "VIEWER"] as const) {
    const filter = await kidVisibilityFilter({ id: "admin-user", role, tenantId: tenant.id });
    const visible = await prisma.kid.findMany({ where: filter });
    const ids = visible.map((k) => k.id).sort();
    assert.deepEqual(ids.sort(), [assignedKid.id, unassignedKid.id].sort());
  }
});

test("kid visibility never crosses tenants", async () => {
  const a = await createTenantWithKidsAndTherapist();
  const b = await createTenantWithKidsAndTherapist();

  const filter = await kidVisibilityFilter({ id: "admin-user", role: "TENANT_ADMIN", tenantId: a.tenant.id });
  const visible = await prisma.kid.findMany({ where: filter });

  assert.ok(!visible.some((k) => k.id === b.assignedKid.id || k.id === b.unassignedKid.id));
});

test("THERAPIST role sees a kid in ANOTHER tenant when explicitly linked (guest support-team link)", async () => {
  const home = await createTenantWithKidsAndTherapist();
  const other = await createTenantWithKidsAndTherapist();

  // The home-tenant therapist also gets linked, as a guest, to a kid in a different tenant.
  await prisma.kidTherapist.create({ data: { kidId: other.assignedKid.id, therapistId: (await prisma.therapist.findUniqueOrThrow({ where: { userId: home.therapistUser.id } })).id } });

  const user = { id: home.therapistUser.id, role: "THERAPIST" as const, tenantId: home.tenant.id };
  const filter = await kidVisibilityFilter(user);
  const visible = await prisma.kid.findMany({ where: filter });
  const ids = visible.map((k) => k.id).sort();

  assert.deepEqual(ids, [home.assignedKid.id, other.assignedKid.id].sort());
  // Not linked to the other tenant's second kid -- the join itself is still the only signal, not
  // blanket access to that tenant.
  assert.ok(!ids.includes(other.unassignedKid.id));

  await assertCanAccessKid(user, other.assignedKid.id);
  await assert.rejects(() => assertCanAccessKid(user, other.unassignedKid.id));
});
