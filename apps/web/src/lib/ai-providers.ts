import type { AiProvider } from "@/generated/prisma/enums";

/** The AI providers people can connect with their own API key. Safe to import on the client. */
export const AI_PROVIDERS = {
  ANTHROPIC: {
    label: "Claude",
    company: "Anthropic",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyPattern: /^sk-ant-/,
    keyPlaceholder: "sk-ant-…",
    autoModelHint: "",
    billing: "Usage is billed to your Anthropic account. A Claude chat subscription doesn’t include API access.",
    defaultModel: "claude-opus-5-5",
    models: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
  },
  OPENAI: {
    label: "ChatGPT",
    company: "OpenAI",
    keyUrl: "https://platform.openai.com/api-keys",
    keyPattern: /^sk-/,
    keyPlaceholder: "sk-…",
    autoModelHint: "Best GPT-5 on your key",
    billing: "Usage is billed to your OpenAI account. A ChatGPT subscription doesn’t include API access.",
    // Picked from what the key can use, in this order, when no model is given.
    defaultModel: "",
    models: ["gpt-5.6-terra", "gpt-5.6-sol", "gpt-5.6-luna", "gpt-5.6", "gpt-5.5", "gpt-5.4", "gpt-5"],
  },
  GEMINI: {
    label: "Gemini",
    company: "Google",
    keyUrl: "https://aistudio.google.com/apikey",
    // New AI Studio keys are "auth keys" (AQ.…); older ones start with AIza.
    keyPattern: /^(AQ\.|AIza)/,
    keyPlaceholder: "AQ.…",
    autoModelHint: "Newest Flash on your key",
    billing:
      "Free up to Google’s daily limit, no card needed. On the free tier Google may use your prompts and drafts to improve its models.",
    // Suggestions only; with no model given, the newest Flash model the key can use is picked.
    defaultModel: "",
    models: ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-flash-latest"],
  },
} as const satisfies Record<AiProvider, unknown>;
