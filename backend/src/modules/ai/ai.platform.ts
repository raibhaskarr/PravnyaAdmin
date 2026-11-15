import { createAiPlatform, createAnthropicProvider, createFakeProvider, createGeminiProvider } from "@pravnix/ai-node";
import { env } from "../../config/env";

// Only Claude and Gemini are wired up here -- OpenAI support exists in AIPlatformNode but isn't
// used by this product. Whichever real provider has a key set becomes the default; Claude wins if
// both are configured (more reliable at following structured-output instructions in practice). If
// neither key is set, everything falls back to the deterministic Fake provider -- its canned
// response never matches a real Canonical Skill id, so every feature built on this degrades to a
// clean "no suggestion" rather than crashing. See docs/adr/0001 in AIPlatformNode: this module is
// PravnyaAdmin's own facade -- the platform itself has no opinion on any of this wiring.
// Test-only scripted AI: with NODE_ENV=test every AI call goes to the fake provider, which answers
// with whatever a test scripted for that call's featureId ("companion-message",
// "extract-evidence-from-note", "extract-iep-goals", "goal-skill-suggestion"). Unscripted calls get
// "{}", which fails every schema -- exercising each feature's graceful "AI unavailable" path.
// Integration tests call setTestAiResponse directly; E2E tests use the test-only
// /api/__test__/ai-responses route in app.ts.
const testAiScript = new Map<string, string>();

export function setTestAiResponse(featureId: string, response: unknown) {
  testAiScript.set(featureId, typeof response === "string" ? response : JSON.stringify(response));
}

export function clearTestAiResponses() {
  testAiScript.clear();
}

function buildProviders() {
  if (env.NODE_ENV === "test") {
    const responseSelector = (request: { executionContext?: { featureId?: string } }) =>
      testAiScript.get(request.executionContext?.featureId ?? "") ?? "{}";
    // Registered under the real providers' names too, so a call that forces a provider (e.g. voice
    // notes always go to "gemini") is still answered by the script, never a real API.
    const scripted = ["fake", "gemini", "claude"].map((name) => createFakeProvider({ name, responseSelector }));
    return { providers: scripted, defaultProvider: "fake" };
  }

  const providers = [createFakeProvider()];
  let defaultProvider = "fake";

  if (env.GEMINI_API_KEY) {
    providers.push(createGeminiProvider({ apiKey: env.GEMINI_API_KEY }));
    defaultProvider = "gemini";
  }
  if (env.ANTHROPIC_API_KEY) {
    // Default client timeout (60s) is too short for IEP extraction's image-heavy, large-output
    // calls -- the SDK client's timeout is fixed at construction (no per-request override exists
    // in this provider), so it's raised here for every Claude call this app makes, not just that
    // one. A longer ceiling only matters when a call actually needs it; it doesn't slow anything
    // else down.
    providers.push(createAnthropicProvider({ apiKey: env.ANTHROPIC_API_KEY, timeoutMs: 150_000 }));
    defaultProvider = "claude";
  }

  return { providers, defaultProvider };
}

const { providers, defaultProvider } = buildProviders();

export const { orchestrator } = createAiPlatform({
  providers,
  defaultProvider,
  contentLoggingPolicy: "MetadataOnly"
});
