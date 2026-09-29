# AI Platform

Pravnya Admin has one live AI feature: on the tenant **Goals** page, typing a free-text goal title
and clicking "Suggest skill from title (AI)" proposes a matching Canonical Skill (plus a derived
Discipline and Modality) from the taxonomy, which the therapist can accept or override before
saving — never blocks manual entry. This page documents the shared AI execution platform that
feature (and any future one) is built on: what LLMs it supports, how a request gets routed, how
Pravnya Admin actually consumes an unpublished sibling repo, and how to add another provider.

## AIPlatformNode

`AIPlatformNode` (`github.com/raibhaskarr/AIPlatformNode`) is a separate repo: a TypeScript npm
workspaces monorepo that owns generic AI execution — provider transport, retry, structured-output
parsing and repair, telemetry, error normalization. It has no knowledge that Pravnya Admin exists.
It's the shared execution layer every Pravnix product (this one, Pravnya, and eventually a rebuilt
PranTrackingSystem AI module) is meant to sit on top of, instead of each product re-solving
provider integration independently.

It ports the architecture of an earlier .NET platform (`pravnix-ai-platform`), built originally for
a different product, and extends it with multimodal input (image/audio/video, not just text) and
token streaming — capabilities the .NET version didn't need yet but that this platform's other
consumers already use in production.

## Supported LLM providers

Every provider is a self-contained npm package implementing the same `AiProvider` interface
(`name`, `supportsStructuredOutput`, `supportsStreaming`, `generate()`, optionally
`generateStream()`). A product picks which ones it wants to use — there's no "install everything"
bundle.

| Provider | Package | SDK | Env var | Default model | Text | Image | Audio | Video | Streaming |
|---|---|---|---|---|---|---|---|---|---|
| **Fake** | `@pravnix/ai-provider-fake` | none — deterministic, in-process | none | `fake-model` | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Claude** | `@pravnix/ai-provider-anthropic` | `@anthropic-ai/sdk` | `ANTHROPIC_API_KEY` | `claude-sonnet-5` | ✅ | ✅ (inline base64 only) | ❌ | ❌ | ✅ |
| **Gemini** | `@pravnix/ai-provider-gemini` | `@google/generative-ai` | `GEMINI_API_KEY` | `gemini-3.8-flash` | ✅ | ✅ | ✅ | ✅ | ✅ |
| **OpenAI** | `@pravnix/ai-provider-openai` | `openai` | `OPENAI_API_KEY` | `gpt-6-astra` | ✅ | ✅ (data URI) | ✅ (inline base64, `input_audio`) | ❌ | ✅ |

Each default tracks that vendor's own current recommended general-purpose model (last checked
2026-09) and can be overridden per-request via `AiRequestOptions.modelOverride` without needing a
platform change. Vendors ship new model lines faster than this page can track in real time —
verify against `AIPlatformNode`'s own `packages/providers/*/src/options.ts` if precision matters
for a specific integration.

Notes:

- **Fake** never makes a network call. It's what every unit test in `AIPlatformNode` itself — and
  every product test that shouldn't depend on a live API key — runs against. Its response is a
  configurable callback (`responseSelector`), so a test can make it return whatever JSON/text the
  test needs.
- **Claude** and **OpenAI** reject audio/video and video input respectively with an explicit
  `InvalidConfiguration` error rather than silently dropping the content — a caller that sends the
  wrong modality to the wrong provider finds out immediately, not from a confused model response.
- Every real provider fails loudly at construction (throws) if its API key is missing — never a
  silent fallback to an unauthenticated or half-configured state.
- Every real provider wraps its network call in a bounded exponential-backoff retry (429 / 5xx /
  timeout only) before the orchestrator ever sees a failure. This is the *only* retry layer — see
  "Why there's no second retry layer" below.

## How Pravnya Admin actually consumes it

`AIPlatformNode` isn't published to any registry yet, and two interim approaches that looked viable
turned out not to work for a production deploy:

- **npm's `<git-url>#<commit>:<subdirectory>` syntax** silently ignores the subdirectory and
  installs the whole (private, unbuilt) monorepo root — confirmed by testing it directly.
- **A sibling git checkout via a `file:` dependency** works great locally, but this repo's deploy
  script only has access to what `git` delivers to the server — there's no sibling `AIPlatformNode`
  checkout there, and creating one would require editing the deploy script, which is out of reach
  (see `reference_prod_db_ssh_access` — same server, same restriction).

What's actually used: **`backend/vendor/pravnix/*.tgz`** — `npm pack` output for all 11 packages
`@pravnix/ai-node` transitively needs, committed directly into this repo. `git reset --hard` on the
server brings them along automatically, and `npm ci` resolves everything with zero server-side
setup. See `backend/vendor/pravnix/README.md` for exactly how to regenerate these after an
`AIPlatformNode` change (they need re-packing and re-committing — this doesn't happen automatically
on every deploy).

## How a request gets routed to a provider

A product calls the shared `orchestrator` (from `@pravnix/ai-node`'s `createAiPlatform`) with an
`AiOperation` that optionally names a `provider` (e.g. `"claude"`). If it doesn't name one, the
orchestrator falls back to whatever `defaultProvider` the product configured when it called
`createAiPlatform`. Routing is name-based lookup only — an unregistered provider name fails
explicitly (`UnsupportedProvider`); the orchestrator never silently substitutes a different
provider than the one asked for.

Picking a *specific model* within a provider (e.g. a faster/cheaper Claude model for one call) is
done per-request via `AiRequestOptions.modelOverride` — a raw, provider-specific model name string.
There is no tier system ("fast"/"premium"/etc.) built into the platform itself; if Pravnya Admin
ever wants that, tier→model-name mapping is a decision that belongs in Pravnya Admin's own facade
code, not in `AIPlatformNode` — consistent with the prompt-ownership boundary below.

## Adding a new LLM provider

This is done inside `AIPlatformNode`, not inside Pravnya Admin. Steps, following the exact pattern
the four existing providers already use (e.g. `packages/providers/gemini/`):

1. **New package**: `packages/providers/<name>/` with its own `package.json` (name
   `@pravnix/ai-provider-<name>`) and `tsconfig.json` referencing `../../core`,
   `../../abstractions`, and `../../provider-support`.
2. **Options** (`options.ts`): a `resolve<Name>Options()` function that throws at construction if
   required config (API key) is missing, and applies defaults for model/maxTokens/temperature/
   retries — same shape as `packages/providers/anthropic/src/options.ts`.
3. **Mapping** (`mapping.ts`): translate `AiMessage[]`/`AiContentPart[]` into that SDK's own
   request shape. For any modality the SDK genuinely can't accept, throw
   `new AiProviderError(createAiError("InvalidConfiguration", "..."))` rather than dropping the
   content silently.
4. **Provider class** (`<name>Provider.ts`): implement `AiProvider` —
   `generate()` wraps the SDK call in `@pravnix/ai-provider-support`'s `withRetry`, and
   `generateStream()` (if the SDK supports streaming) yields `AiStreamChunk`s and a final chunk
   carrying usage. Both catch SDK errors and normalize them via `mapHttpStatusToAiError` (or a
   provider-specific status extractor) into an `AiProviderError` — never let a raw SDK exception
   escape to the orchestrator.
5. **Tests**: apply the shared `runProviderContractTests()` suite from `@pravnix/ai-provider-support`
   against the new provider, gated by an env var (`skipNetworkTests: !process.env.<NAME>_API_KEY`)
   so CI doesn't need a real key — see any existing `*Provider.test.ts` for the pattern.
6. **Wire it into `@pravnix/ai-node`**: add a `create<Name>Provider()` factory function to
   `packages/node/src/providerFactories.ts` and export it, add the new package as a dependency of
   `@pravnix/ai-node`, and add the tsconfig project reference.
7. **Nothing else changes.** The orchestrator, structured-output parsing, telemetry, and every
   other provider are completely unaffected — this is the entire point of routing every provider
   through the same `AiProvider` interface.

Once that's merged and released from `AIPlatformNode`, a consuming product (Pravnya Admin,
eventually) picks it up by adding `create<Name>Provider({ apiKey: process.env.<NAME>_API_KEY! })`
to the `providers` array it passes into `createAiPlatform()` — no other code changes required on
the product side.

### Why there's no second retry layer at the orchestrator level

Each real provider already retries transient failures (429/5xx/timeout) itself before the
orchestrator sees anything. The orchestrator does not wrap that in a second retry loop — two
independent retry layers stacked on the same transient failure is a retry storm waiting to happen.
The only retry-shaped behavior above the provider is the *structured-output repair loop*, which is
a different mechanism entirely (the model produced text that doesn't parse against the requested
schema — a semantic problem, not a network one) and is independently bounded
(`maxRepairAttempts`, default 1).

## The one rule that matters, applied

**Prompts, schemas, and business validation never live in `AIPlatformNode`.** The platform gives a
product an `orchestrator` with three operations — plain generate, structured generate (parsed
against a `zod` schema you supply, with the automatic repair retry above if the model's output
doesn't parse), and streaming generate. Everything about *what* to ask the model, *how* to validate
the answer, and *what to do* when it fails is the product's own responsibility, built as a facade on
top of the orchestrator — never a controller calling the orchestrator directly.

`backend/src/modules/ai/` is that facade:

- **`ai.platform.ts`** — builds the provider list from `env.ANTHROPIC_API_KEY`/`env.GEMINI_API_KEY`
  (whichever is set; Claude wins as `defaultProvider` if both are), always also registers the fake
  provider as an ultimate fallback so the feature degrades instead of crashing when neither key is
  configured. Only Claude and Gemini are wired up — OpenAI support exists in the platform but isn't
  used here.
- **`goalSkillSuggestion.service.ts`** — the prompt, the zod schema (constrained to the actual
  candidate skill ids fetched from the DB, so a hallucinated id is rejected before it ever reaches
  the client), and the failure policy (any AI failure — no key configured, model output that never
  parses, network error — returns `{ suggestion: null, reason }`; the frontend falls back to manual
  selection, it never blocks or errors the page). Discipline and Modality are deliberately **not**
  asked of the model at all — they're derived server-side from the chosen skill's own
  `defaultDisciplineId`/`supportedModalities` (the "default, not exclusive" pattern from
  `03-business-logic.md`), narrowed to what the tenant has enabled. This keeps the model's actual
  job to exactly one constrained choice.
- **`ai.routes.ts`** — `POST /api/ai/suggest-goal-skill`, same access rule as creating a goal
  (Tenant Admin and Therapist; Viewer blocked).

## Why this boundary, specifically

A shared platform that also owned prompts would mean every product's prompt wording lived in one
repo with no relationship to that product's own users or data, edited by whoever happens to be
working on the platform rather than whoever owns the product feature. Keeping prompts local to each
product keeps that ownership honest, and keeps `AIPlatformNode` genuinely product-agnostic — it can
be reused by a fourth or fifth product later without any of this platform's code needing to change.

## Status

Integrated and deployed. The Goal → Canonical Skill suggestion feature is live in the UI and the
API responds correctly — but it's running against the fake provider only, because neither
`ANTHROPIC_API_KEY` nor `GEMINI_API_KEY` has been added to the server's environment yet. Until one
is, every suggestion request returns `{ suggestion: null, reason: "Couldn't generate a suggestion
right now -- pick manually below." }` — the fake provider's canned response never matches a real
Canonical Skill id, by design, so this fails closed rather than returning nonsense.

To make it actually suggest real skills: add `ANTHROPIC_API_KEY` and/or `GEMINI_API_KEY` to the
server's backend `.env` (same file `DATABASE_URL`/`JWT_SECRET` already live in) and restart the
backend service. No code or deploy changes needed — `ai.platform.ts` picks up whichever key(s) are
present at boot.
