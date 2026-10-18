# Parent & Kid Onboarding (Planned — Not Yet Built)

**Status: draft spec, nothing on this page is implemented.** Every other page in this manual
describes the live system; this one is the exception, included here so the plan ships alongside
the code it will eventually sit next to, rather than living only in a chat transcript. If you're
looking for how kids are actually created and managed today, see the "Tenant vs. Centre" section
in `03-business-logic.md` — that describes the current, shipped `Kid.tenantId` model this page
proposes changing.

## Goal

Give PravnyaAdmin a household identity (`Parent`) and true multi-centre kid enrollment
(`KidCentreEnrollment`), replacing today's single-owner `Kid.tenantId`. **Parent login is
explicitly deferred** until the parent-facing app itself gets planned — this phase is the data
model plus the centre-initiated (B2B) onboarding flow only.

## Why this is bigger than it first looks

Every feature built in PravnyaAdmin so far assumes **one kid = one owning tenant** —
`Kid.tenantId` is a required, non-nullable foreign key. That assumption is baked into
`kidVisibilityFilter`/`assertCanAccessKid` (today: "every kid where `tenantId` matches mine"), the
Superadmin/Tenant Admin health-stats count (`prisma.kid.count({ where: { tenantId } })`),
`Goal.tenantId`, and `POST /kids` (hard-codes the creating admin's own `tenantId`). True
multi-centre enrollment means a kid is no longer owned by a tenant at all — ownership moves to the
parent/household, and each centre relationship becomes its own row. This is an architecture change
to the tenant-isolation model this whole app is built on, not an additive feature.

## Core entities (new / changed)

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
parent is neither staff nor tenant-scoped.

### `Kid` — ownership moves off `tenantId`

```prisma
model Kid {
  id          String                 @id @default(uuid()) @db.Uuid
  parentId    String                 @db.Uuid
  parent      Parent                 @relation(fields: [parentId], references: [id], onDelete: Cascade)
  firstName   String
  lastName    String
  dob         DateTime?
  enrollments KidCentreEnrollment[]
  therapists  KidTherapist[]
  goals       Goal[]
  // tenantId removed
}
```

### `KidCentreEnrollment` — the actual multi-centre relationship

```prisma
model KidCentreEnrollment {
  id            String           @id @default(uuid()) @db.Uuid
  kidId         String           @db.Uuid
  kid           Kid              @relation(fields: [kidId], references: [id], onDelete: Cascade)
  tenantId      String           @db.Uuid
  tenant        Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  disciplineIds String[]         @default([])
  status        EnrollmentStatus @default(ACTIVE) // ACTIVE | DISCONTINUED
  startDate     DateTime?
  endDate       DateTime?
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt

  @@unique([kidId, tenantId])
  @@index([tenantId])
}
```

A kid with two active rows here is genuinely attending two centres independently — this is the
join table PravnyaAdmin doesn't have today.

## What this breaks / requires rework

- **`kidVisibilityFilter`** — TENANT_ADMIN/VIEWER's "every kid in my tenant" becomes "every kid
  with an ACTIVE `KidCentreEnrollment` at my tenant."
- **Health stats** — "total kids" per tenant becomes "kids with an active enrollment at this
  tenant," not a straight `Kid` count.
- **`POST /kids`** — forks into the B2B flow below instead of one TENANT_ADMIN-only creation
  route.
- **`Goal.tenantId`** — probably stays (a goal is clinical work happening at one specific centre),
  but should likely reference the specific `KidCentreEnrollment` rather than just `tenantId` +
  `kidId` loosely, so goals from two different centres for the same kid aren't ambiguous.
- **`Kid.status`** — not resolved by this spec: does kid-level archived mean the whole household
  left Pravnya, or does that live entirely at the enrollment level with no kid-level status at
  all?
- **`KidTherapist`** — not resolved by this spec: should an assignment scope to "this kid at this
  centre" rather than just "this kid," so a therapist at Centre A doesn't show up as assigned
  against work happening at Centre B?

## This phase's flow: B2B, centre-initiated onboarding

A Tenant Admin or Therapist, while enrolling a new kid at their centre, enters the household info
(email, father name, mother name, mobile, address, city) alongside the kid's own details
(first/last name, DOB) and which therapies/disciplines at this centre. Two sub-cases:

1. **New household** — no `Parent` row exists for that email yet. Creates the `Parent`, the `Kid`,
   and one `KidCentreEnrollment` for this tenant, all in one step. No invite email, no password —
   there's nothing to invite them to yet.
2. **Existing household** — a `Parent` row with that email already exists (a sibling was onboarded
   before, or this same kid is now also attending a second centre). Look up by email first; reuse
   that `Parent` row rather than creating a duplicate, and either add a new `Kid` under it, or add
   a new `KidCentreEnrollment` for this tenant against the existing `Kid`.

For sub-case 2, since there's no parent login yet, a centre can attach a new enrollment to an
existing household purely from the email match, with no parent-side confirmation step — there's no
mechanism for the parent to confirm or dispute it pre-login anyway. This is a known, accepted gap
for this phase, not a solved problem: once parent login exists, add a confirmation step (the
parent approves a new centre's enrollment request from their own account) rather than trusting the
inviting centre's email lookup alone.

## Deferred — parent-facing app

- **Parent login** — no `passwordHash`, no JWT issuance, no invite-acceptance flow for parents.
- **B2C self-registration** — a parent creating their own account directly depends on login
  existing, so it's deferred alongside it.
- Where parents would eventually log in (new role/nav on this same frontend vs. a separate
  application) is a question for that future planning pass, not this one.
- The existing-household consent gap noted above — revisit once login exists.

## Open items not decided by this spec

- `Kid.status` vs. `KidCentreEnrollment.status` split.
- `KidTherapist` scoping to a specific enrollment vs. staying kid-global.
- Weekly schedule — not addressed at all yet. `PranTrackingSystem`'s `WeeklyScheduleEntry` is the
  closest analog, but nothing here proposes an equivalent for PravnyaAdmin.
