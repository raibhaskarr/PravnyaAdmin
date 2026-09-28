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

**Tenant** — a therapy centre. All tenant-scoped data (`Kid`, `Therapist`, `Goal`, etc.) carries a
`tenantId` directly, so no centre can ever see another's data.

**Tenant Discipline** — which of the platform's disciplines a specific tenant actually offers
(e.g. a pure-SLP centre wouldn't enable OT). Controls which disciplines show up when that tenant
creates therapists and goals.

**Therapist** — a person at a tenant who practices one or more of that tenant's enabled
disciplines, and is assigned to specific kids.

**Kid** — a child at a tenant. Visible to Tenant Admins and Viewers tenant-wide; visible to a
Therapist only for kids they're explicitly assigned to.

**Goal** — a specific clinical target for one kid: which Canonical Skill, which Discipline, which
Modality, plus the therapist's own free-text title (the actual wording they'd use, e.g. copied
from an IEP) and status (Active / Achieved / Discontinued).

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
| Therapist | One tenant, scoped to assigned kids | View/manage goals only for kids they're assigned to |
| Viewer | One tenant, tenant-wide | Read everything in the tenant; cannot create or edit anything |
