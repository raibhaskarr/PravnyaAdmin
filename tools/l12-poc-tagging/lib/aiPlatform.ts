import "dotenv/config";
import { createAiPlatform, createAnthropicProvider, createGeminiProvider } from "@pravnix/ai-node";

// POC_PROVIDER=claude|gemini selects which one is the active default -- both are always
// registered (when a key is present) so re-running with the other is a one-line env change,
// which is the whole point of keeping this swappable for comparison.
const requested = (process.env.POC_PROVIDER ?? "claude").toLowerCase();

const providers = [];
if (process.env.ANTHROPIC_API_KEY) providers.push(createAnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY }));
if (process.env.GEMINI_API_KEY) providers.push(createGeminiProvider({ apiKey: process.env.GEMINI_API_KEY }));
if (providers.length === 0) {
  throw new Error("Set ANTHROPIC_API_KEY and/or GEMINI_API_KEY in .env before running this script.");
}

const defaultProvider = requested === "gemini" ? "gemini" : "claude";
if (!providers.some((p) => p.name === defaultProvider)) {
  throw new Error(`POC_PROVIDER=${requested} requested but no matching API key is set in .env.`);
}

export const { orchestrator } = createAiPlatform({ providers, defaultProvider, contentLoggingPolicy: "None" });
export const ACTIVE_PROVIDER = defaultProvider;
