# L12 AI Tagging POC (Review Page)

Superadmin-only page (**AI Tagging POC Review**, `/admin/poc-review` in the frontend) that lets a
human judge whether an LLM can automatically map real therapy goals and daily-log entries onto
PravnyaAdmin's canonical Skill/Item taxonomy, before any such automation is trusted in a real
product flow. It runs against two real children's real historical data from PranTrackingSystem
(not synthetic, not tenant data), surfaced read-only, side-by-side by AI provider. Nothing here
writes back to a Kid, a Goal, or any tenant-visible record — it's purely a review surface.

## Why this exists

PranTrackingSystem already has regex-based goal/skill matching (`growth-beta` module). This POC
asks a sharper question: how much better does a real LLM do, and is it good enough to eventually
replace or augment that regex layer? The two children were chosen because they have enough real
history (goals + hundreds of daily logs each) to judge tagging quality meaningfully, and because
`GROWTH_BETA_APPROVED_CHILD_IDS` had already established them as the approved pair for this kind of
experiment.

## The two-pass pipeline

Three sequential AI passes, run per provider, over the same source data:

1. **Goal tagging** — each goal's title/description/target-behavior/measurement-method text is
   matched against the full Canonical Skill list (schema-constrained: the model can only return an
   id from the real candidate list, never invent one). Produces one `PocGoalTag` row per goal, with
   a predicted skill (or `NO_MATCH` if the model found no reasonable fit — a real finding, not an
   error), a confidence score, and a one-sentence rationale.
2. **Log evidence extraction** — each daily log's free text can yield zero, one, or several
   `PocLogEvidence` rows (one per distinct skill+item combination mentioned). For each, the model
   extracts: which skill it demonstrates, a free-text item hint (the specific thing named — "Apple",
   never a category like "fruits"), the outcome (correct/incorrect/partial/attempted/not_observed/
   unknown), the support level the child needed, and — added in a later pass — the **modality** the
   child actually used to respond (verbal/manual_sign/aac/written/gestural/unknown/not_applicable).
3. **Item matching** — a second, separate AI call takes each log evidence row's free-text item hint
   and matches it against *that specific skill's own* real `CanonicalSkillItem` candidates (never
   the full item bank — just the one skill's items), so a hint like "ball" only ever gets matched
   against items that already belong to the skill it was tagged to. Records how it resolved:
   `ai` (matched, with a confidence score), `ai_no_match` (a hint existed but no real item fit),
   `no_hint` (the skill tracks items but none was named in this log), or `not_applicable` (this
   skill doesn't track items at all).

Two providers were run through the full pipeline independently — **Gemini** (`gemini-3.8-flash`)
and **Claude** (`claude-sonnet-5`, via AIPlatformNode — see `04-ai-platform.md`) — so a reviewer can
compare tagging quality side by side rather than trusting a single model's output.

## Privacy boundary

`PocLogEvidence` deliberately has **no excerpt or source-text field** — only derived, structured
output (skill, item, outcome, support, modality, confidence) ever leaves PranTrackingSystem's
encrypted storage into PravnyaAdmin's database. The original log free-text and goal description
(both field-encrypted in PranTrackingSystem) are read once, locally, to run the AI pipeline, and
are never written anywhere outside that local process. This was an explicit scope decision, not an
oversight — a reviewer judges tagging quality from the structured fields and the taxonomy, never
from the underlying clinical text.

## Tables added (Prisma schema)

These are new models, not tenant-scoped (no `tenantId` anywhere) and never joined against `Kid`,
`Goal`, or any other tenant table except read-only references into the canonical taxonomy
(`CanonicalSkill`, `CanonicalSkillItem`). Exact current fields, types, and doc comments are always
visible live on the **Database Structure** page of this same Manual (generated straight from the
deployed Prisma schema — see `01-overview.md` for how that works) rather than duplicated here where
it could drift; the summary below is the shape and the *why*, not a field-by-field copy.

- **`PocReviewChild`** — one row per real child being reviewed (currently Ananya and Pranava). Just
  a `label` (first name) and `sourceChildId` (PranTrackingSystem's own child id, unique, kept only
  for traceability) — deliberately not a `Kid` record.
- **`PocGoalTag`** — one row per (goal × provider). Carries the goal's title and its original
  domain/category/centre exactly as entered in PranTrackingSystem (for comparing against what the
  AI predicted), the predicted skill (nullable — `NO_MATCH` is valid), confidence, rationale,
  status, and which `modelProvider`/`modelName` produced this row.
- **`PocLogEvidence`** — one row per extracted piece of evidence (× provider). Carries the log date
  and centre, the predicted skill, the item hint and its match result (`predictedItemId`,
  `itemMatchScore`, `itemMatchMethod`), outcome, support level, modality, confidence, and
  `modelProvider`/`modelName`.
- Three enums: `PocGoalTagStatus` (`TAGGED`/`NO_MATCH`/`ERROR`), `PocEvidenceOutcome`,
  `PocSupportLevel`, plus `PocModality` (mirrors the taxonomy's own `Modality` concept, with two
  POC-specific additions: `UNKNOWN` and `NOT_APPLICABLE`, since not every skill is a communicative
  response).

**Multi-provider coexistence**: `modelProvider` is the thing that lets a Gemini pass and a Claude
pass live side by side for the same child without clobbering each other. Re-importing (`POST
/api/poc-review/import`) wipes and replaces only the rows matching that specific
`childId`+`modelProvider` pair, not the whole child — this is what makes the pass toggle in the UI
possible at all. Each pass is otherwise fully disposable and re-runnable; there's no accumulation of
historical runs in PravnyaAdmin itself (the *local* pipeline's own SQLite snapshot does keep every
run for comparison — see below).

`centreName` (on both tables) and `modality` (on `PocLogEvidence`) were added after the initial
schema in separate migrations, each backfilling existing rows to `NULL`/`UNKNOWN` respectively
rather than requiring a destructive reset.

## Review page (`frontend/src/pages/admin/PocReviewPage.tsx`)

- **Pass toggle** — "Gemini pass" / "Claude pass" / **Compare**, the last one only appearing once
  more than one provider has data for that child. Selecting a single pass filters everything below
  to that provider; Compare shows a side-by-side stats table instead (goal tag/no-match/error
  counts, average self-reported confidence, evidence volume, item-match rate, full outcome/support/
  modality distributions, and a goal-level skill-agreement rate computed by matching goal titles
  across both passes).
- **By skill** (default tab) — one card per Canonical Skill that either a goal or any evidence
  resolved to, showing the goal(s) tagged to it next to every piece of evidence for it, with
  evidence further grouped by matched item (so a reviewer sees "Apple: 6" instead of six identical
  rows) and expandable into a per-row table (date, centre, outcome, support, modality, confidence).
- **Goal tags** / **Log evidence** — flat tables of every row for the selected pass, each column
  with a hover tooltip explaining exactly what it means and how it was derived.

## Taxonomy enrichment

Reviewing "no real item fit" hints surfaced genuine gaps in the live Canonical Skill Item bank, not
just tagging misses — e.g. body parts (Mouth/Nose/Ear/Eye) and colors were entirely absent from the
shared 132-item object-naming bank despite being commonly referenced in real logs. Each gap was
reviewed by hand against that skill's existing item-naming convention (reject anything that doesn't
match the skill's own axis — e.g. a hint describing an object on a skill whose items are all verbs)
before writing it to the real taxonomy via the normal `POST /api/taxonomy/skills/:skillId/items`
API — never a raw database write. Two rounds added 63 and 28 items respectively, after which
item-matching was re-run so previously-unmatched evidence could resolve against the expanded bank.

## Known issues hit and fixed along the way

- **AIPlatformNode sent `temperature` unconditionally**, which `claude-sonnet-5` rejects outright
  ("deprecated for this model", HTTP 400) — every Claude call failed until `temperature` was made
  optional end-to-end (resolved in `AIPlatformNode`, not here).
- **SQLite lock contention**: the local pipeline's SQLite file has no WAL mode or busy-timeout
  configured, so running two of its scripts concurrently against the same file crashes one of them
  with `SQLITE_BUSY`. Fix is procedural, not code: run pipeline scripts strictly serially, never two
  at once against the same `poc.sqlite`.
- **Partial-run push bug**: `push-to-pravnyaadmin.ts` originally picked the *globally latest* run
  per provider, which briefly pushed a crashed, partially-complete Claude run live, overwriting the
  last good complete pass. Fixed by requiring `completed_at IS NOT NULL` when selecting which run to
  push — an in-progress or crashed run is never eligible.

## Status

Live for Ananya and Pranava, both Gemini and Claude passes, including centre tagging, item-level
matching against the real taxonomy, and response modality. Superadmin-only, read-only, not wired to
any tenant-facing feature.

**The local pipeline scripts (goal tagging, log evidence extraction, item matching, the
PravnyaAdmin-push script, and the one-off taxonomy-item-review scripts) live only in an ephemeral
local working directory outside this repo and were never committed anywhere.** If continuing this
work beyond ad hoc review passes, those scripts should be committed somewhere durable first — this
page documents the pipeline's *behavior*, not its exact source.

No decision has been made about promoting any of this into a real product feature (e.g. replacing
or augmenting `growth-beta`'s regex matching, or importing these two children as real Kids) — this
page exists solely to make that future decision an informed one.
