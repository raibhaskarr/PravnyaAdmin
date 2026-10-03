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

## The three-pass pipeline

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
   unknown), the support level the child needed, the **modality** the child actually used to respond
   (verbal/manual_sign/aac/written/gestural/unknown/not_applicable), and — added 2026-10-03, see
   "Measurement types" below — a type-matched **measurement value** for skills that aren't naturally
   trial-shaped (a count, a duration in seconds, a percentage, a boolean, a 1–5 rating, or a short
   free-text observation).
3. **Item matching** — a second, separate AI call takes each log evidence row's free-text item hint
   and matches it against *that specific skill's own* real `CanonicalSkillItem` candidates (never
   the full item bank — just the one skill's items), so a hint like "ball" only ever gets matched
   against items that already belong to the skill it was tagged to. Records how it resolved:
   `ai` (matched, with a confidence score), `ai_no_match` (a hint existed but no real item fit),
   `no_hint` (the skill tracks items but none was named in this log), or `not_applicable` (this
   skill doesn't track items at all).

Two providers were run through the full pipeline independently — **Gemini** (`gemini-3.8-flash`)
and **Claude** (`claude-sonnet-5`, via AIPlatformNode — see `04-ai-platform.md`) — so a reviewer can
compare tagging quality side by side rather than trusting a single model's output. Both providers
run the exact same prompts (below) — `POC_PROVIDER` only swaps which model executes a given pass,
never the instructions it's given.

## Measurement types

A flat outcome (`correct`/`incorrect`/`partial`/...) is the right representation for a discrete
trial ("point to the named picture"), but it's actively wrong for a skill that isn't trial-shaped —
e.g. a behavior-reduction goal like "Reduces frequency/duration of a target behavior" had every real
evidence row forced through `INCORRECT`, misrepresenting behavior-incident logs as failed trials.

Each of the 148 real Canonical Skills was hand-classified into one of eight measurement types
(`tools/l12-poc-tagging/scripts/skill-measurement-types.ts`, keyed by skill id with a trailing
`// <skill name>` comment for auditability — POC-local only, never written to the real
`CanonicalSkill` table): `TRIALS`, `FREQUENCY`, `DURATION`, `PERCENTAGE`, `PROMPT_LEVEL`, `YES_NO`,
`RATING`, `FREE_OBSERVATION`. The log-evidence-extraction prompt annotates each candidate skill with
its type (e.g. `[measures: frequency]`) and asks the model to fill the matching field(s) — outcome/
supportLevel/modality are always extracted as a universal fallback regardless of type; a type-
matched value is *additionally* extracted only when the skill's declared type calls for one and the
log text actually supports it (left `null` rather than guessed). `TRIALS` and `PROMPT_LEVEL` skills
need no extra field — the outcome/supportLevel fallback already fully captures them, which is why
e.g. every Receptive Language skill (all trial-based: "Identifies colors when named", "Follows
verbal directions", ...) stays `TRIALS` and shows only outcome/support history, unchanged from
before this layer existed.

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
  `itemMatchScore`, `itemMatchMethod`), outcome, support level, modality, confidence,
  `modelProvider`/`modelName`, and (added 2026-10-03) the measurement fields: `measurementType`,
  `measurementValue`, `measurementUnit`, `measurementBoolean`, `measurementText` — all nullable,
  only populated when the matched skill's type calls for one (see "Measurement types" above).
- Enums: `PocGoalTagStatus` (`TAGGED`/`NO_MATCH`/`ERROR`), `PocEvidenceOutcome`, `PocSupportLevel`,
  `PocModality` (mirrors the taxonomy's own `Modality` concept, with two POC-specific additions:
  `UNKNOWN` and `NOT_APPLICABLE`, since not every skill is a communicative response), and
  `PocMeasurementType` (`TRIALS`/`FREQUENCY`/`DURATION`/`PERCENTAGE`/`PROMPT_LEVEL`/`YES_NO`/
  `RATING`/`FREE_OBSERVATION`).

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

## Prompts

The exact system prompts sent for each pass, verbatim from the local pipeline scripts (same text
regardless of which provider is active). User-message content is just the goal/log text plus the
candidate list — these system prompts carry all the task framing and output-shape constraints.

**Goal tagging** (`tools/l12-poc-tagging/scripts/tag-goals.ts`):

> You are helping test a clinical skill taxonomy (Domain > Skill) against real therapy goals written
> by therapists/parents, often copied from an IEP. Given one goal's title and description, pick the
> single best-matching canonicalSkillId from the candidate list provided, or say there is no
> reasonable match at all. This is a product-evidence categorization aid, not a clinical or
> diagnostic judgment. Never invent an id that isn't in the candidate list.
>
> Respond with ONLY a single JSON object, no markdown fences, no prose before or after it, in
> exactly this shape: `{"hasMatch": boolean, "canonicalSkillId": string or null, "confidence":
> number between 0 and 1, "rationale": string}`. canonicalSkillId must be null when hasMatch is
> false, and must be exactly one of the candidate ids when hasMatch is true.

**Log evidence extraction** (`tools/l12-poc-tagging/scripts/extract-log-evidence.ts`):

> You are helping test a clinical skill taxonomy (Domain > Skill) against real daily activity logs
> written by therapists or parents. A single log entry can contain evidence for zero, one, or
> several different skills or items — create ONE separate evidence entry per distinct skill+item
> combination. If a log says "cricket 30%, badminton 70%, skating 100%", that's three entries. If a
> log says "named lego, clay, auto, bus" (all the same skill), that's FOUR separate entries — one
> per item — never bundle multiple items into a single comma-separated itemHint.
>
> For each piece of evidence found, extract: which candidate skill it demonstrates; itemHint — the
> ONE specific, concrete item/word/task actually involved (e.g. "Apple", "Lego", "kick"), never a
> category or group label (e.g. never "fruits", "clothing items", "body parts") — if the log only
> mentions a general category with no specific instance named, set itemHint to null rather than
> guessing a category name; the outcome; the support level the child needed; the modality the child
> actually used to respond — "verbal" (spoke/vocalized/said the word), "manual_sign" (used a formal
> sign), "aac" (used an AAC device, picture exchange, or communication app), "written" (wrote or
> typed), "gestural" (pointed or gestured without AAC or a formal sign), "not_applicable" (this skill
> isn't about a communicative response at all, e.g. a motor, behavioral, or self-care skill), or
> "unknown" (it's a communicative skill but the log doesn't say how the child responded) — infer
> modality only from what the log text actually says, never guess based on the skill name alone; a
> confidence score; and the exact excerpt of the log text that piece of evidence came from. Only
> extract evidence that is actually about skill performance — not attendance notes, scheduling, or
> unrelated remarks. This is a product-evidence categorization aid, not a clinical or diagnostic
> judgment. Never invent a canonicalSkillId that isn't in the candidate list.
>
> Each candidate skill is annotated with its measurement type in brackets, e.g. "[measures:
> frequency]". Always fill outcome/supportLevel/modality as described above regardless of type —
> they're a universal fallback. Additionally, based on the matched skill's declared type, fill
> exactly the matching field(s) below when the log text actually supports it (leave them null rather
> than guessing a number that isn't stated or clearly implied):
> - [measures: trials] or no bracket at all: no extra fields — outcome/supportLevel already cover it.
> - [measures: frequency]: measurementValue = count of occurrences/incidents this log describes for
>   this skill (default 1 for a single described incident), measurementUnit = "times".
> - [measures: duration]: measurementValue = duration in seconds if a duration is stated or clearly
>   implied (e.g. "5 minutes" -> 300), measurementUnit = "seconds". Leave null if no duration is
>   given.
> - [measures: percentage]: measurementValue = 0-100 if a percentage or convertible fraction is
>   stated (e.g. "4 out of 5" -> 80). Leave null otherwise.
> - [measures: prompt_level]: no extra fields — supportLevel already covers it.
> - [measures: yes_no]: measurementBoolean = true/false based on whether the log says the child did
>   or did not complete/achieve it (independently, unless the skill is specifically about
>   independence).
> - [measures: rating]: measurementValue = a 1-5 rating ONLY if the log gives an explicit or clearly
>   ordinal rating (e.g. "rated 4/5", "mostly consistent" ~4, "inconsistent" ~2). Leave null if the
>   log doesn't support picking a specific number.
> - [measures: free_observation]: measurementText = a short (<=200 char) plain restatement of what
>   was actually observed, only when outcome/supportLevel genuinely don't capture it.
>
> Respond with ONLY a single JSON object, no markdown fences, no prose before or after it, in exactly
> this shape: `{"hasEvidence": boolean, "evidence": [{"canonicalSkillId": string, "itemHint": string
> or null, "outcome": one of ["correct","incorrect","partial","attempted","not_observed","unknown"],
> "supportLevel": one of ["independent","visual_prompt","verbal_prompt","gestural_prompt",
> "physical_prompt","partial_assistance","full_assistance","unknown"], "modality": one of
> ["verbal","manual_sign","aac","written","gestural","unknown","not_applicable"], "measurementValue":
> number or null, "measurementUnit": string or null, "measurementBoolean": boolean or null,
> "measurementText": string or null, "confidence": number between 0 and 1, "excerpt": string}]}`.
> "evidence" must be an empty array when hasEvidence is false. Up to 15 evidence items per log.

**Item matching** (`tools/l12-poc-tagging/scripts/tag-items.ts`):

> You are helping test a clinical skill taxonomy's item bank. A piece of evidence has already been
> matched to a specific Canonical Skill; your only job now is picking which ONE item from that
> skill's own candidate item list (if any) the evidence actually refers to, using the original log
> text and a short item hint for context. Pick the closest real match even if the wording differs
> (e.g. hint "ball" can match a candidate like "Catch" if the log context makes that the right
> action) — but say there's no match rather than forcing a wrong one if nothing fits. Never invent an
> itemId that isn't in the candidate list.
>
> Respond with ONLY a single JSON object, no markdown fences, no prose before or after it, in exactly
> this shape: `{"hasMatch": boolean, "itemId": string or null, "confidence": number between 0 and 1,
> "rationale": string}`. itemId must be null when hasMatch is false, and must be exactly one of the
> candidate ids when hasMatch is true.

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
- **Provider billing exhaustion mid-run looks exactly like a code bug**: a full 673-log Gemini run
  failed 298/673 (HTTP 402, "prepayment credits are depleted") and a full Claude run failed 460/673
  (HTTP 400, "credit balance is too low") on the same day, each failing partway through rather than
  from the start — easy to misread as a schema or concurrency regression. Confirmed root cause by
  calling each provider's SDK directly outside the pipeline to read the raw error body (the
  orchestrator's `AiError` normalizes away the real message into a generic `safeMessage`). Fix is
  topping up the account, not retrying — once credits were restored, resuming each run (clear that
  run's `failed` rows from `poc_processed_logs`, then re-run with the same `POC_RUN_ID`) picked up
  exactly the missed logs with a normal success rate (666/673 and 669/673 respectively).

## Status

Live for Ananya and Pranava, both Gemini and Claude passes, including centre tagging, item-level
matching against the real taxonomy, and response modality. Superadmin-only, read-only, not wired to
any tenant-facing feature.

The local pipeline scripts (goal tagging, log evidence extraction, item matching, the
PravnyaAdmin-push script, and the one-off taxonomy-item-review scripts) are committed at
`tools/l12-poc-tagging/` in this repo — see that directory's own `README.md` for setup and run
order. The real decrypted clinical data and the local SQLite snapshot built from it are
deliberately **not** committed (`.gitignore`d) — only the code is.

No decision has been made about promoting any of this into a real product feature (e.g. replacing
or augmenting `growth-beta`'s regex matching, or importing these two children as real Kids) — this
page exists solely to make that future decision an informed one.
