# Business Logic

## The skill-splitting rule

Split into a separate Canonical Skill only when the underlying cognitive/linguistic/motor demand
is genuinely different — never just because the vocabulary theme changes. "Identify animals,"
"identify transport," and "identify fruits" all ask the child to do the exact same thing (hear a
word, find the matching picture), so they collapse into one skill — "Identifies objects/pictures
when named" — with the category as an item tag (`semanticGroup`), not three separate skills.
"Identify body parts" and "follow an instruction" ask for genuinely different capabilities
(different stimulus, different response, different clinical milestone), so they're separate
skills.

Applying this consistently is what keeps the taxonomy from re-fragmenting the same way the
original, per-centre goal data had fragmented before this system existed.

## "Default, not exclusive": discipline and modality

Both `CanonicalSkill.defaultDiscipline` and `CanonicalSkill.supportedModalities` are *suggestions*,
never hard constraints:

- The same skill can legitimately be delivered by more than one discipline (e.g. Expressive
  Language goals show up from both SLP and ABA providers in real data).
- A skill's suggested modalities narrow the Goal-creation dropdown to what's likely relevant, but
  never remove the other options — a therapist can always override.

This mirrors how the underlying clinical reality actually works: these are useful defaults for a
fast, low-friction goal-creation flow, not clinical rules to enforce.

## Access control

Three layers, enforced server-side (never trust client-side role checks alone):

1. **`requireAuth`** — every route requires a valid JWT.
2. **`requireRole(...)`** — some routes are restricted to specific roles (e.g. only `SUPERADMIN`
   can mutate the taxonomy; only `TENANT_ADMIN` can create therapists or kids).
3. **`requireTenantScope` + `kidVisibilityFilter`** — every tenant-scoped query is filtered by
   `tenantId` so no cross-tenant data can ever leak, and for `THERAPIST`-role users specifically,
   further filtered to only the kids they're assigned to via `KidTherapist`. `TENANT_ADMIN` and
   `VIEWER` see every kid in their tenant; `VIEWER` is additionally blocked from every mutating
   route (`blockViewer`) regardless of what it can see.

## Why Goal Item has two fields instead of one

A goal's concrete content is either shared vocabulary (an animal name, a phoneme, a WH-question
*type*) or content that's inherently personal to one kid (the literal question "Where do you
live?", built from that kid's own family/school/routine). Pre-populating the personal kind into
the shared Canonical Skill Item bank wouldn't make sense — there's no single canonical answer to
"where do you live." So `GoalItem` carries both `canonicalSkillItemId` (optional, links to the
shared bank) and `customText` (optional, free text) — either, or both, can be set on one row. This
mirrors how the original client app's `ActivityCard.items` already handled the same distinction.

## Deployment note

Every schema or business-rule change described here ships through the same CI/CD pipeline as any
other code change: push to `main` → build on the GitHub Actions runner → deploy script on the
server runs `git reset --hard` (picking up these markdown files and any schema changes) → `prisma
migrate deploy` → restart. There is no separate manual-sync step for these docs to be forgotten.
