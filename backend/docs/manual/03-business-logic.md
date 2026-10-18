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
   `tenantId` so *implicit* cross-tenant data access is never possible, and for `THERAPIST`-role
   users specifically, further filtered to only the kids they're assigned to via `KidTherapist`.
   `TENANT_ADMIN` and `VIEWER` see every kid in their tenant; `VIEWER` is additionally blocked from
   every mutating route (`blockViewer`) regardless of what it can see. The one deliberate exception
   is `KidTherapist` itself: a kid's support team can explicitly include a therapist from a
   *different* tenant (see "Tenant vs. Centre, and cross-tenant support" below) — that's an
   intentional, explicit grant, not a gap in the isolation above.

## Tenant vs. Centre: two different concepts, kept deliberately separate

`Tenant` means "has its own login, billing, and subscription with the platform." That's true for
every onboarded therapy centre (B2B), and also for Pravnix's own account, which every
directly-onboarded retail family's `Kid` belongs to (B2C) — Pravnix is "just another tenant" in the
data model, not a special case.

But a goal or a logged session can legitimately reference a clinic that *isn't* a tenant at all —
e.g. an IEP uploaded from a clinic that's never signed up with the platform. Forcing that clinic to
become a full `Tenant` record (with its own login, KYC fields, subscription) just so a goal can
reference where it came from would be backwards: most of these centres will never subscribe, and
the goal/session data shouldn't be blocked on an administrative step a parent or guest therapist
has no ability to complete.

So `Goal.centreName` / `GoalItemEvidence.centreName` are plain free text, not a foreign key to
`Tenant` — see `02-definitions.md`'s **Centre** entry. The tradeoff: no autocomplete, no
deduplication ("vListen" vs "V-Listen" are different strings), no way to query "every goal from
this centre" as a join. Revisit if that friction becomes real — the natural fix is a lightweight
`Centre` directory table (name, maybe city) that `Tenant` optionally references when a centre
*does* subscribe, so promoting a centre to a tenant is attaching a `Tenant` row to an existing
`Centre`, not migrating data — every kid/goal/evidence already pointing at that `Centre` keeps
working unchanged. Not built yet because the free-text version already unblocks the real need
(showing and correcting which clinic something came from) at a fraction of the schema/migration
cost, and it's not yet clear the autocomplete/dedup/reporting value is worth that cost.

A related, larger open question: today a `Kid` belongs to exactly one tenant, period. See
`06-parent-kid-onboarding-spec.md` for a draft proposal (not yet built) that would let one kid be
independently enrolled at multiple centres, which changes this single-owner model more
fundamentally than the `Centre` directory idea above does.

## Cross-tenant support team: free today, not solved for billing yet

A kid's support team (`KidTherapist`) can include a therapist from a different tenant than the
kid's own — e.g. a kid onboarded directly with Pravnix (retail) who's also seeing a therapist at a
separate centre, or a centre-onboarded kid bringing in an outside specialist. This is currently
**free and unlimited**: no cap, no billing event, no gating on either side's subscription tier.

That's a deliberate simplification, not a final answer. The real question it ducks: who should pay
when a kid's home-tenant relationship doesn't involve the centre actually contributing the
work? Charging the family directly would mean building a whole new consumer billing flow that
doesn't exist anywhere else in the product. Charging the kid's home tenant doesn't fit either —
they usually didn't initiate the cross-tenant link and aren't the one benefiting. The more aligned
option, if this ever needs monetizing, is a referral fee charged to the *contributing* tenant (the
one gaining a new engagement it wouldn't otherwise have had) — B2B-to-B2B, reusing billing
infrastructure that already exists for tenant subscriptions, rather than inventing a new
family-facing payment flow. Left free for now because there's no usage data yet to justify building
either path, and a free, friction-free cross-tenant link is also the feature actually getting
adopted right now.

## AI provenance on Goal

`Goal.confidence` and `Goal.rationale` persist the AI's own judgment when a goal came from an
AI-assisted flow (IEP upload, or "Suggest skill from title") — previously this was shown
transiently in the review UI and then thrown away once the goal was created, an intentional
tradeoff made and then revisited once it became clear that losing confidence/rationale made the
live product strictly worse for this than the POC review tooling it's meant to replace, which
already persisted both. Null for any goal entered by hand with no AI involved — there's no
confidence number to show for a fact someone just typed in.

The ~100 goals migrated from the reviewed POC tagging pipeline predate these columns, so they were
backfilled from the same source (`PocGoalTag`, linked via `Goal.sourceGoalId`) in
`backend/prisma/backfill-goal-centre-name.ts` (also backfills `centreName` the same way, from the
same source). Centre name is an objective fact about the source document, so any `PocGoalTag` row
for that `sourceGoalId` is equally valid and a conflict means dirty source data, worth flagging
rather than guessing. Confidence/rationale are each model's own opinion and genuinely differ
between providers even when they agree on the final skill, so the backfill only considers tags
that predicted the skill the goal actually ended up with, preferring the `claude` tag when more
than one provider agrees (same default `ai.platform.ts` uses everywhere else) rather than treating
provider disagreement as a conflict to skip.

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
