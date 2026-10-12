import type { AiProvider } from "@/generated/prisma/enums";

/** The AI providers people can connect with their own API key. Safe to import on the client. */
export const AI_PROVIDERS = {
  ANTHROPIC: {
    label: "Claude",
    company: "Anthropic",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyPattern: /^sk-ant-/,
    defaultModel: "claude-opus-5-5",
    models: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
  },
  OPENAI: {
    label: "ChatGPT",
    company: "OpenAI",
    keyUrl: "https://platform.openai.com/api-keys",
    keyPattern: /^sk-/,
    // Picked from what the key can use, in this order, when no model is given.
    defaultModel: "",
    models: ["gpt-5.6-terra", "gpt-5.6-sol", "gpt-5.6-luna", "gpt-5.6", "gpt-5.5", "gpt-5.4", "gpt-5"],
  },
} as const satisfies Record<AiProvider, unknown>;
