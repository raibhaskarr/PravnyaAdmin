# Parent & Kid Onboarding (Planned — Not Yet Built)

**Status: draft spec, nothing on this page is implemented.** Every other page in this manual
describes the live system; this one is the exception, included here so the plan ships alongside
the code it will eventually sit next to, rather than living only in a chat transcript. If you're
looking for how kids are actually created and managed today, see the "Tenant vs. Centre" section
in `03-business-logic.md`.

## Goal

Give PravnyaAdmin a household identity (`Parent`) so one login can see multiple kids, and capture
richer onboarding info (father/mother name, mobile, address, city) than exists today — without
touching kid-tenant ownership at all. **Parent login is explicitly deferred** until the
parent-facing app itself gets planned; this phase is the data model plus the centre-initiated
(B2B) onboarding flow only.

## Kid ownership does not change

**A kid belongs to exactly one tenant — `Kid.tenantId` stays required, non-nullable, unchanged.**
An earlier draft of this spec proposed a `KidCentreEnrollment` join table so one kid could be
independently enrolled at multiple centres. That's scrapped: "a kid can involve multiple centres"
already means something that's fully built and shipped — a **guest therapist**. Example: Kid A is
onboarded with ACE (`Kid.tenantId = ACE`, unchanged, forever, unless the kid is formally
transferred). Kid A can *also* have a therapist from VListen on their support team — that's an
ordinary `KidTherapist` row pointing at a therapist whose own `tenantId` is VListen, which
`kidVisibilityFilter` already allows (see `03-business-logic.md`'s Access Control section). No
schema or access-control change needed for this — it already works.

Because of this, `kidVisibilityFilter`, the Superadmin/Tenant Admin health-stats count, `Goal.tenantId`,
and `POST /kids` are all **unaffected by this spec**. Everything below is additive: a new `Parent`
table, and a new `parentId` column on `Kid` — nothing existing is removed or restructured.

## Core entities (new)

### `Parent` — household identity, no login yet

```prisma
model Parent {
  id            String   @id @default(uuid()) @db.Uuid
  email         String   @unique
  fatherName    String?
  motherName    String?
  mobile        String
  addressLine1  String?
  city          String?
  kids          Kid[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

Deliberately no `passwordHash` in this phase — login is deferred, so there's nothing to
authenticate yet. Captured by centre staff during B2B onboarding (below). A new top-level table,
not a row in the existing `User` table: `User` is unconditionally centre staff (`role: SUPERADMIN
| TENANT_ADMIN | THERAPIST | VIEWER`, every non-superadmin row requires a `tenantId`), and a
parent is neither staff nor tenant-scoped — a household can, in principle, have kids at different
tenants (sibling A at ACE, sibling B at VListen), so `Parent` itself can't be tenant-scoped either.

### `Kid` — one new column, nothing removed

```prisma
model Kid {
  id         String          @id @default(uuid()) @db.Uuid
  tenantId   String          @db.Uuid     // unchanged -- still required, still single-owner
  tenant     Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  parentId   String?         @db.Uuid     // new
  parent     Parent?         @relation(fields: [parentId], references: [id], onDelete: SetNull)
  firstName  String
  lastName   String
  dob        DateTime?
  therapists KidTherapist[]
  goals      Goal[]
}
```

`parentId` is nullable: every kid created before this ships has no household attached, and a kid
created by this flow could in principle still be made without one (e.g. a centre that doesn't
collect full household info today). `onDelete: SetNull`, not `Cascade` — deleting a `Parent` record
should never take a `Kid` (and that kid's goals/evidence) down with it.

## This phase's flow: B2B, centre-initiated onboarding

A Tenant Admin, while onboarding a new kid at their centre, enters the household info (email,
father name, mother name, mobile, address, city) alongside the kid's own details (first/last name,
DOB) exactly as today — the only change is these new fields get captured and a `Parent` row gets
created or reused. Two sub-cases:

1. **New household** — no `Parent` row exists for that email yet. Creates the `Parent` and the
   `Kid` (with `tenantId` set to the creating admin's own tenant, same as today) in one step. No
   invite email, no password — there's nothing to invite them to yet.
2. **Existing household** — a `Parent` row with that email already exists (a sibling was onboarded
   before, possibly at a *different* tenant). Look up by email first; reuse that `Parent` row
   rather than creating a duplicate, and attach the new `Kid` to it (still with its own
   `tenantId` — the new kid is NOT retroactively linked to the sibling's tenant).

Sub-case 2 raises a real cross-tenant data question worth flagging rather than deciding here: does
a Tenant Admin at ACE, onboarding a new kid, get to find out that this parent's email already has
a household record — possibly one created by VListen's staff, about a sibling ACE has no
relationship with at all? A plain "email already exists, reuse it" lookup is the simplest
implementation, but it means one tenant's onboarding flow can observe that *some* household exists
at another tenant, even if it reveals nothing about which tenant or which kid. Worth a deliberate
decision before building, not an accidental byproduct of the lookup.

## Update: parent login has shipped

The "deferred" items below described this phase's intentional scope cut. They're no longer
deferred — the parent-facing app (a separate `parent-app/` frontend, not this admin frontend)
now has self-service email/password registration, email verification, and login, built in
`modules/parent-auth/`. `Parent.passwordHash`/`emailVerifiedAt` are real columns.

This resolved the cross-tenant household-lookup question flagged below exactly the way this spec
predicted: registration is **parent-initiated**, not staff-initiated. A parent registering with an
email that already has a `Parent` row (created earlier by some tenant's admin) proves ownership via
the emailed verification code, then claims that existing row -- no tenant staff ever performs this
lookup, so the cross-tenant leakage concern doesn't apply to this flow. The B2B lookup (a Tenant
Admin's own "Add parent" form doing the same `findOrCreateParent`-style reuse) still has the
original concern and remains unresolved, unchanged from below.

A self-registered parent's kids are created under a fixed retail/direct tenant
(`RETAIL_TENANT_ID` env var, "Pravnix Labs Pvt Ltd" in production) rather than a tenant they
choose -- centre selection stays optional/deferred in onboarding, consistent with "Kid ownership
does not change" above. If they later add a real centre, that's a guest-therapist link
(`KidTherapist`), same mechanism as any cross-tenant guest therapist -- the kid's home tenant never
changes.

## Deferred — parent-facing app (original scope cut, see update above)

- ~~**Parent login** — no `passwordHash`, no JWT issuance, no invite-acceptance flow for parents.~~
- ~~**B2C self-registration** — a parent creating their own account directly depends on login
  existing, so it's deferred alongside it.~~
- Where parents log in: a separate `parent-app/` frontend (Capacitor + web), not this admin
  frontend -- decided when that app was planned.
- The cross-tenant household-lookup question above — resolved for the B2C path (see update above);
  still open for the B2B (Tenant Admin) path.

## Open items not decided by this spec

- Weekly schedule — not addressed at all yet. `PranTrackingSystem`'s `WeeklyScheduleEntry` is the
  closest analog, but nothing here proposes an equivalent for PravnyaAdmin.
- What a Tenant Admin sees/can do when the email lookup in sub-case 2 above finds an existing
  household (full reuse vs. a lighter "this email is already registered, contact support" path).
