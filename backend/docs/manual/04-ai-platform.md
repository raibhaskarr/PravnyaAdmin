# AI Platform

Pravnya Admin has no AI features live yet. This page documents the shared AI execution platform
that any future AI feature here will be built on — what LLMs it already supports, how a request
gets routed to one, and how to add another — so the boundary and the mechanics are both clear
before the first feature is built, rather than improvised after.

## AIPlatformNode

`AIPlatformNode` (`github.com/raibhaskarr/AIPlatformNode`) is a separate repo: a TypeScript npm
workspaces monorepo that owns generic AI execution — provider transport, retry, structured-output
parsing and repair, telemetry, error normalization. It has no knowledge that Pravnya Admin exists,
and Pravnya Admin does not depend on it yet. It's the shared execution layer every Pravnix product
(this one, Pravnya, and eventually a rebuilt PranTrackingSystem AI module) is meant to sit on top
of, instead of each product re-solving provider integration independently.

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
| **Claude** | `@pravnix/ai-provider-anthropic` | `@anthropic-ai/sdk` | `ANTHROPIC_API_KEY` | `claude-sonnet-4-5` | ✅ | ✅ (inline base64 only) | ❌ | ❌ | ✅ |
| **Gemini** | `@pravnix/ai-provider-gemini` | `@google/generative-ai` | `GEMINI_API_KEY` | `gemini-2.0-flash` | ✅ | ✅ | ✅ | ✅ | ✅ |
| **OpenAI** | `@pravnix/ai-provider-openai` | `openai` | `OPENAI_API_KEY` | `gpt-4o` | ✅ | ✅ (data URI) | ✅ (inline base64, `input_audio`) | ❌ | ✅ |

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

## The one rule that matters if this ever gets integrated here

**Prompts, schemas, and business validation never live in `AIPlatformNode`.** The platform gives a
product an `orchestrator` with three operations — plain generate, structured generate (parsed
against a `zod` schema you supply, with the automatic repair retry above if the model's output
doesn't parse), and streaming generate. Everything about *what* to ask the model, *how* to validate
the answer, and *what to do* when it fails is the product's own responsibility, built as a facade on
top of the orchestrator — never a controller calling the orchestrator directly.

Concretely, if Pravnya Admin ever adds an AI feature (e.g. "suggest a Canonical Skill for this
free-text goal title"), the prompt for that, the zod schema for the expected response, and the
decision about what happens when the AI call fails (fall back silently? show an error? block the
save?) would all be written and owned inside this repo — `backend/src/modules/`, same as every
other module — not inside `AIPlatformNode`.

## Why this boundary, specifically

A shared platform that also owned prompts would mean every product's prompt wording lived in one
repo with no relationship to that product's own users or data, edited by whoever happens to be
working on the platform rather than whoever owns the product feature. Keeping prompts local to each
product keeps that ownership honest, and keeps `AIPlatformNode` genuinely product-agnostic — it can
be reused by a fourth or fifth product later without any of this platform's code needing to change.

## Status

Not integrated. No route, service, or dependency in this repo references `AIPlatformNode` today.
When a real AI feature is scoped for Pravnya Admin, integrating it means adding `@pravnix/ai-node`
as a dependency, building a small facade module under `backend/src/modules/` (prompt + schema +
failure policy for that one feature), and wiring the orchestrator's provider list from
environment-variable API keys (the table above) — the same pattern already documented in
`AIPlatformNode`'s own `docs/product-integration.md`.
