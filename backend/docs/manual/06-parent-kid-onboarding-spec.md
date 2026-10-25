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

## Update: Companion AI, Care Team, and the weekly Schedule have shipped

Three more parent-facing pieces have shipped since the update above, all in the same
`parent-app/` frontend, all following the same pattern as parent-auth: a parent-side module that
hand-duplicates (never imports) the admin-side schema/logic it mirrors, so the two sides can evolve
independently. None of these required any change to `Kid.tenantId` ownership.

**Companion AI** (`backend/src/modules/companion/`) — a real chat on the parent app's Home screen,
not just another digest card. A parent types a question or a log, and `companion.service.ts` asks
the shared AI platform (see `04-ai-platform.md`) to classify intent first: a logging message routes
into the existing log-a-session flow, anything else gets a real model-generated reply. This is
explicitly scoped broader than the kid's own logged data — general parenting/therapy questions are
in scope too, which is why `companion.service.ts`'s system prompt is the first genuinely explicit
safety boundary in this codebase (never diagnose, never discuss medication, never make a
safety-critical judgment call — redirect to the kid's own therapist instead). Every message,
parent and assistant, persists to a new `CompanionMessage` table, scoped by `kidId`.

Separately, Home also has a deterministic, non-AI "opener" (`parent-app/src/home/opener.tsx`) that
proactively surfaces a new growth milestone or a same-day schedule slot as if Pravnya spoke first —
not a model call, just a templated message, same spirit as the existing onboarding nudge. It's
client-side only: "already shown" lives in local storage per kid, not synced across devices, a
deliberate scope cut to avoid the backend work of detecting-and-persisting a trigger server-side.

**Care Team** (`backend/src/modules/parent-therapist-invitations/`) — a parent can invite a
therapist onto their kid's support team directly from the parent app, mirroring the admin side's own
`therapistInvitationsService.inviteForKid` closely: an email that already belongs to a `Therapist`
anywhere gets linked immediately (no invite), a brand-new email gets a real invite. The one real
difference is where a new invitee lands — a parent has no tenant of their own, so `TherapistInvitation.invitedByParentId`
(new, nullable, alongside the existing `invitedById`) is set instead, and the new therapist joins
`RETAIL_TENANT_ID` on acceptance rather than "the inviting admin's own tenant." Full lifecycle now
exists: revoke (pending only, same 409-if-already-acted-on rule the admin side's own revoke uses),
resend (pending *or* expired — deliberately revives a lapsed invite rather than leaving it a dead
end), and unlink (remove an already-linked therapist from the kid's care team).

**Weekly Schedule** (`backend/src/modules/parent-schedule/`) — resolves the "Weekly schedule — not
addressed at all yet" item below. Recurring weekly slots ("Speech therapy, every Tuesday 4pm"), not
dated calendar appointments, via a new `ScheduleSlot` model (`kidId`, `label`, `dayOfWeek` as
`"Mon".."Sun"` text — same convention `Kid.selfReportedScheduleDays` already used — plain `"HH:MM"`
`startTime`, optional `therapistId`). Parent-managed only; a slot's `therapistId` must already be a
real Care Team link (`KidTherapist`), checked server-side, not just any `Therapist` id. Two gaps from
the first pass were closed in a follow-up: editing a slot was originally delete-and-recreate (now a
real full-replace `PATCH`), and nothing stopped two slots at the same day+time for the same kid
(now a same-kid/day/time clash check, 409, shared by create and edit).

**Admin-side read visibility** — until now, staff had zero visibility into either of the two
features above even though the data sits in the same database their own admin panel already reads
from. The Kid detail page (`admin.pravnya.com`) now has two read-only tabs, Schedule and Companion,
reusing the exact same `assertCanAccessKid`/`kidVisibilityFilter` access control every other
kid-scoped read (Goals, Kids) already uses — Tenant Admin/Viewer see any kid in their tenant,
Therapist only kids they're linked to via `KidTherapist`. Staff can see what a parent scheduled and
asked Pravnya; they can't create, edit, or reply from this view.

## Deferred — parent-facing app (original scope cut, see update above)

- ~~**Parent login** — no `passwordHash`, no JWT issuance, no invite-acceptance flow for parents.~~
- ~~**B2C self-registration** — a parent creating their own account directly depends on login
  existing, so it's deferred alongside it.~~
- Where parents log in: a separate `parent-app/` frontend (Capacitor + web), not this admin
  frontend -- decided when that app was planned.
- The cross-tenant household-lookup question above — resolved for the B2C path (see update above);
  still open for the B2B (Tenant Admin) path.

## Open items not decided by this spec

- ~~Weekly schedule — not addressed at all yet.~~ Shipped — see "Update: Companion AI, Care Team,
  and the weekly Schedule have shipped" above.
- What a Tenant Admin sees/can do when the email lookup in sub-case 2 above finds an existing
  household (full reuse vs. a lighter "this email is already registered, contact support" path).
