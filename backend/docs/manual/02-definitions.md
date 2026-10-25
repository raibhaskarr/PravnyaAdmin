# Definitions

## Taxonomy (superadmin-managed, shared across every tenant)

**Domain** — a top-level clinical area (e.g. Receptive Language, Gross Motor & Physical
Development). 14 domains, cross-checked against published frameworks (ABLLS-R, VB-MAPP, AFLS,
Ayres Sensory Integration, AOTA OTPF-4). Stable — expected to change rarely, if ever.

**Discipline** — the professional practice that typically delivers a skill: Speech-Language
Pathology (SLP), Occupational Therapy (OT), Applied Behavior Analysis (ABA), Physical Therapy
(PT), Special Education. A skill's `defaultDiscipline` is a suggestion, not exclusive — the same
skill can legitimately be delivered by more than one discipline, and a specific Goal can name a
different discipline than the skill's default.

**Canonical Skill** — the actual clinical target, e.g. "Identifies objects/pictures when named."
Every real-world goal, however it's worded, should resolve to exactly one Skill. Tagged with:
- `sourceTag`: `PROD` (matched an actual goal already written by a real centre) or `FRAMEWORK`
  (added from a published clinical framework, not yet seen in a real goal here — equally
  legitimate clinically, just unconfirmed against this platform's centres yet).
- `supportsItems`: whether this skill is practiced with a pickable vocabulary/stimulus list, or
  tracked by duration/independence instead (e.g. "sustains attention for X minutes" has no items).
- `supportedModalities`: which response modalities make sense for this skill (see Modality below).

**Canonical Skill Item** — the concrete vocabulary under a skill that supports items (e.g. Cow,
Dog, Apple under "Identifies objects/pictures when named"). Shared across every tenant and every
kid — typed once, reused everywhere. Grouped by `semanticGroup` (ANIMALS, FOOD_AND_DRINK, etc.)
for browsing, but the group is just a label on the item, not a separate skill.

**Modality** — *how* a child responds: Verbal, Manual Sign, AAC (device/PECS), Written, or
Gestural (pointing, eye-gaze, reaching — informal, not a learned sign). Only meaningful for
communication-related domains; a sitting-tolerance or sensory-regulation goal isn't "verbal" or
"signed." A skill's `supportedModalities` is a suggested default, same as discipline — the actual
Goal can pick any modality.

## Tenant-scoped (per centre)

**Tenant** — an organization with its own login access and billing relationship with the
platform: a therapy centre (B2B), or Pravnix's own account, which every directly-onboarded retail
family's `Kid` belongs to (B2C) — see `03-business-logic.md`'s "Tenant vs. Centre" section for why
these are kept distinct rather than treating every centre a kid mentions as a tenant. All
tenant-scoped data (`Kid`, `Therapist`, `Goal`, etc.) carries a `tenantId` directly, and every
tenant-scoped query is filtered by it — *implicit* cross-tenant access is never possible. Explicit
cross-tenant access (a kid's support team deliberately including a therapist from another tenant)
is a separate, intentional mechanism — see **Cross-tenant support team** below, not a leak of the
isolation above.

**Tenant Discipline** — which of the platform's disciplines a specific tenant actually offers
(e.g. a pure-SLP centre wouldn't enable OT). Controls which disciplines show up when that tenant
creates therapists and goals.

**Therapist** — a person at a tenant who practices one or more of that tenant's enabled
disciplines. Assigned to specific kids at their own tenant by default, but can also be added as a
guest to a kid at a *different* tenant — see **Cross-tenant support team** below.

**Kid** — a child whose account belongs to one tenant (`tenantId`) — either a centre they
onboarded through (B2B) or Pravnix's own account for a directly-onboarded retail family (B2C).
Visible to that tenant's Admins and Viewers tenant-wide; visible to a Therapist only for kids they
are explicitly assigned to, whether at their own tenant or as a cross-tenant guest.

**Cross-tenant support team** — a kid's `tenantId` only determines whose account they belong to,
not which therapists can work with them: `KidTherapist` can link a kid to a therapist from *any*
tenant, not just their own (e.g. a kid onboarded on a retail account bringing in a therapist from
a centre they separately attend). Deliberately free and unlimited today, independent of either
side's subscription — see `03-business-logic.md` for the billing question this raises and why it's
intentionally deferred rather than solved now.

**Centre** (`Centre` model, referenced by `Goal.centreId` / `GoalItemEvidence.centreId`) — a real
directory entity naming which clinic/organization a goal or logged session actually came from.
Deliberately independent of `Tenant` — existing in this directory never requires being a paying
platform customer (e.g. a clinic that's never signed up). `Tenant.centreId` optionally links a
Tenant back to its own Centre row when/if that clinic does subscribe — "a Tenant is just a Centre
that happens to subscribe." See `03-business-logic.md` for the full rationale and this entity's
history (it replaced an earlier free-text-only version).

**Goal** — a specific clinical target for one kid: which Canonical Skill, which Discipline, which
Modality, plus the therapist's own free-text title (the actual wording they'd use, e.g. copied
from an IEP), status (Active / Achieved / Discontinued), and which Centre it came from (above).
When an AI-assisted flow (IEP upload, or "Suggest skill from title") produced the goal, it also
carries that model's `confidence` (0–1) and `rationale` (its own explanation, or the source
document excerpt) — both null for a goal entered by hand with no AI involved.

**Goal Item** — the concrete, per-kid content a goal is actually practiced with. Two things can
live on one row: a link to a shared Canonical Skill Item (e.g. the "Where" question type), and/or
free `customText` (e.g. the literal question "Where do you live?" — content that's inherently
personal to this kid and was never meant to live in the shared bank). See `03-business-logic.md`
for why this is split into two fields instead of one.

## Roles

| Role | Scope | Can do |
|---|---|---|
| Superadmin | Platform-wide, no tenant | Manage tenants; manage the canonical taxonomy |
| Tenant Admin | One tenant | Everything within that tenant: disciplines offered, therapists, kids, goals |
| Therapist | One tenant, scoped to assigned kids | View/manage goals only for kids they're assigned to — including as a cross-tenant guest on a kid belonging to a different tenant |
| Viewer | One tenant, tenant-wide | Read everything in the tenant; cannot create or edit anything |
