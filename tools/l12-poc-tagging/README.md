# L12 AI Tagging POC — pipeline scripts

Local, never-deployed tooling that produces the data shown on PravnyaAdmin's **AI Tagging POC
Review** page (`/admin/poc-review`). Not part of the build, not part of any deploy — run by hand,
locally, against a local SQLite snapshot. For the full narrative (why this exists, what each pass
does, the tables it feeds, decisions made along the way) see
[`backend/docs/manual/05-l12-poc-ai-tagging-review.md`](../../backend/docs/manual/05-l12-poc-ai-tagging-review.md)
— that page is also served live on PravnyaAdmin's own Manual tab.

## What's deliberately not in this directory

- **`data/`** — the real, decrypted goal/log text for the two real children this POC reviews.
  Decrypted locally from PranTrackingSystem's encrypted storage for pipeline input only; never
  committed, never copied anywhere else. `.gitignore`d.
- **`poc.sqlite`** — the local snapshot database. Contains the same decrypted text once loaded, plus
  every AI run's output (including the `excerpt` column, which PravnyaAdmin's own `PocLogEvidence`
  table deliberately never receives — see the Manual page's "Privacy boundary" section). `.gitignore`d.
- **`.env`** — real API keys and PravnyaAdmin superadmin credentials. Copy `.env.example` and fill
  it in locally; never commit the real file.
- **`*.log`** — scratch output from ad hoc runs.

If you're picking this up without an existing `data/`/`poc.sqlite`, you need to regenerate `data/`
yourself: read-only SSH+psql against PranTrackingSystem's production DB for the two
`GROWTH_BETA_APPROVED_CHILD_IDS` children's goals/logs, decrypted locally with
`FIELD_ENCRYPTION_KEY` (never written to disk anywhere else), shaped into
`iep_goals.decrypted.json` / `daily_logs.decrypted.json` matching the fields `load-source-data.ts`
reads — plus `taxonomy_skills.json` / `taxonomy_items.json` pulled from PravnyaAdmin's own
`/api/taxonomy/*` endpoints. There is no one-command fetch script for this (it was done by hand,
per-field, to keep the amount of real clinical text touched to a minimum) — treat regenerating it as
a deliberate, reviewed action, not routine setup.

## Setup

1. `npm install` in this directory.
2. This tool consumes `@pravnix/ai-core` / `@pravnix/ai-node` from `AIPlatformNode`
   (`github.com/raibhaskarr/AIPlatformNode`) via a sibling `file:` dependency — checkout that repo
   at `tools/AIPlatformNode` (sibling to this directory) and run `npm run build --workspaces` in it
   before installing here. (This is different from how the main `backend/` consumes it — see
   `backend/vendor/pravnix/README.md` — because this tool is never deployed, so the vendored-`.tgz`
   approach that deploy needs isn't necessary here; a plain sibling checkout is simpler for local
   iteration.)
3. `cp .env.example .env` and fill in `GEMINI_API_KEY` and/or `ANTHROPIC_API_KEY`, plus
   `PRAVNYAADMIN_EMAIL`/`PRAVNYAADMIN_PASSWORD` for a real superadmin account (needed only by
   `push-to-pravnyaadmin.ts`).
4. Populate `data/` (see above), then `npx tsx scripts/load-source-data.ts` to load it into a fresh
   `poc.sqlite`.

## Running the pipeline

Each script takes `POC_PROVIDER=gemini|claude` (default `claude`) to pick which registered provider
is the orchestrator's default. Run them **strictly one at a time** — `poc.sqlite` has no WAL mode or
busy-timeout configured, so two of these scripts writing to it concurrently will crash one of them
with `SQLITE_BUSY` (hit once; not a mystery if it recurs — just don't overlap runs).

1. `POC_PROVIDER=gemini npx tsx scripts/tag-goals.ts` — tags every goal against the full Canonical
   Skill list. `POC_LIMIT=10` caps how many goals to process, for a quick smoke test.
2. `POC_PROVIDER=gemini npx tsx scripts/extract-log-evidence.ts` — extracts evidence from every
   daily log. Long-running (hundreds of logs); if it's killed partway, resume with
   `POC_RUN_ID=<id>` (printed at the start of the run) to pick up only the logs not yet processed,
   without redoing finished ones.
3. `POC_PROVIDER=gemini npx tsx scripts/tag-items.ts` — second AI pass matching each evidence row's
   item hint against its own skill's real item bank. Also resumable; also accepts `POC_RUN_ID` to
   target a specific extraction run explicitly once more than one exists (it otherwise defaults to
   the globally-latest `log_evidence_extraction` run, which is only correct when just one provider's
   run is in flight).
4. Repeat 1–3 with `POC_PROVIDER=claude` for the second pass.
5. `npx tsx scripts/push-to-pravnyaadmin.ts` — pushes every provider's **complete** latest run
   (`completed_at IS NOT NULL` — a partial/crashed run is never eligible, so a resume-in-progress
   run never overwrites the last good push) for both children into PravnyaAdmin's real
   `/api/poc-review/import` endpoint. Safe to re-run; it replaces only that child+provider pair.
6. `npx tsx scripts/report.ts` — prints a plain-text summary (counts, confidence distribution, top
   skills) to the terminal; `REPORT.md` in this directory is a point-in-time snapshot from an
   earlier run, kept for reference, not auto-regenerated.

`scripts/match-items.ts` is the original deterministic string-matcher for item hints, superseded by
the AI-based `tag-items.ts` (59% match rate vs. 79%+) but kept for reference/comparison.

### Reviewing and filling real taxonomy gaps

`scripts/add-taxonomy-items.ts` and `scripts/add-taxonomy-items-2.ts` are one-off scripts (two
rounds, run once each) that wrote reviewed, genuine item-bank gaps — found by reading through
`ai_no_match` evidence hints by hand — to PravnyaAdmin's real taxonomy via its normal
`POST /api/taxonomy/skills/:skillId/items` API. They are **not** a generic "run this to add items"
tool; the actual list of items in each file was hand-curated against that skill's existing
naming convention, not generated mechanically. Treat them as a record of what was added and why
(each has a comment above the list explaining the reasoning), not a script to blindly re-run.
After adding real items, `scripts/sync-new-items.ts` pulls them back into the local
`poc_taxonomy_skill_items` snapshot so `tag-items.ts` can use them as match candidates on its next
run — run this, then reset the affected rows' `item_match_method` to `NULL` and re-run `tag-items.ts`
to pick up the new candidates.
