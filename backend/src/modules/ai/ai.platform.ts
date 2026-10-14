import { createAiPlatform, createAnthropicProvider, createFakeProvider, createGeminiProvider } from "@pravnix/ai-node";
import { env } from "../../config/env";

// Only Claude and Gemini are wired up here -- OpenAI support exists in AIPlatformNode but isn't
// used by this product. Whichever real provider has a key set becomes the default; Claude wins if
// both are configured (more reliable at following structured-output instructions in practice). If
// neither key is set, everything falls back to the deterministic Fake provider -- its canned
// response never matches a real Canonical Skill id, so every feature built on this degrades to a
// clean "no suggestion" rather than crashing. See docs/adr/0001 in AIPlatformNode: this module is
// PravnyaAdmin's own facade -- the platform itself has no opinion on any of this wiring.
function buildProviders() {
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
