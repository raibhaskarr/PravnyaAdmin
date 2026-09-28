# AI Platform

Pravnya Admin has no AI features live yet. This page documents the shared AI execution platform
that any future AI feature here will be built on, so the boundary is clear before the first
feature is built rather than improvised after.

## AIPlatformNode

`AIPlatformNode` (`github.com/raibhaskarr/AIPlatformNode`) is a separate repo: a TypeScript library
that owns generic AI execution — provider transport, retry, structured-output parsing and repair,
telemetry, error normalization. It has no knowledge that Pravnya Admin exists, and Pravnya Admin
does not depend on it yet. It's the shared execution layer every Pravnix product (this one,
Pravnya, and eventually a rebuilt PranTrackingSystem AI module) is meant to sit on top of, instead
of each product re-solving provider integration independently.

It ports the architecture of an earlier .NET platform (`pravnix-ai-platform`), built originally for
a different product, and extends it with multimodal input (image/audio/video, not just text) and
token streaming — capabilities the .NET version didn't need yet but that this platform's other
consumers already use in production.

Providers wired up so far: a deterministic **Fake** provider (for tests — no network, no API key),
**Claude** (Anthropic), **Gemini** (Google), and a generic **OpenAI** provider.

## The one rule that matters if this ever gets integrated here

**Prompts, schemas, and business validation never live in `AIPlatformNode`.** The platform gives a
product an `orchestrator` with three operations — plain generate, structured generate (parsed
against a schema you supply, with an automatic repair retry if the model's output doesn't parse),
and streaming generate. Everything about *what* to ask the model, *how* to validate the answer, and
*what to do* when it fails is the product's own responsibility, built as a facade on top of the
orchestrator — never a controller calling the orchestrator directly.

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
When a real AI feature is scoped for Pravnya Admin, integrating it means adding
`@pravnix/ai-node` as a dependency, building a small facade module under `backend/src/modules/`
(prompt + schema + failure policy for that one feature), and wiring the orchestrator's provider
list from environment-variable API keys — the same pattern already documented in
`AIPlatformNode`'s own `docs/product-integration.md`.
