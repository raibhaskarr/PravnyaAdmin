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
    providers.push(createAnthropicProvider({ apiKey: env.ANTHROPIC_API_KEY }));
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
