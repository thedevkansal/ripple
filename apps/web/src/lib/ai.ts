import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { ApiError as GeminiApiError, GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { AiProvider } from "@/generated/prisma/client";
import { AI_PROVIDERS } from "@/lib/ai-providers";
import { decrypt } from "@/lib/crypto";

export class AiError extends Error {}

const TIMEOUT_MS = 90_000;

const anthropic = (key: string) => new Anthropic({ apiKey: key, timeout: TIMEOUT_MS, maxRetries: 1 });
const openai = (key: string) => new OpenAI({ apiKey: key, timeout: TIMEOUT_MS, maxRetries: 1 });
const gemini = (key: string) => new GoogleGenAI({ apiKey: key, httpOptions: { timeout: TIMEOUT_MS } });

/** Friendly message for a provider error, or null to rethrow. */
function explain(err: unknown, provider: AiProvider): string | null {
  const name = AI_PROVIDERS[provider].company;
  const status =
    err instanceof Anthropic.APIError || err instanceof OpenAI.APIError || err instanceof GeminiApiError
      ? (err.status as number | undefined)
      : undefined;
  // Google answers a bad key with 400 rather than 401.
  const badGoogleKey = status === 400 && /API key (not valid|expired)/i.test((err as Error).message);
  if (status === 401 || status === 403 || badGoogleKey) return `${name} rejected the API key. Check it in Settings.`;
  if (status === 404) return `${name} doesn't offer that model to this key. Pick another in Settings.`;
  if (status === 429) return `${name} is rate limiting this key, or it's out of credit. Try again shortly.`;
  if (status === 400 && /credit|billing|balance/i.test((err as Error).message)) {
    return `This ${name} key is out of credit. Add some on the ${name} console.`;
  }
  if (status && status >= 500) return `${name} had a problem answering. Try again in a moment.`;
  if (
    err instanceof Anthropic.APIConnectionError ||
    err instanceof OpenAI.APIConnectionError ||
    (err instanceof TypeError && /fetch failed/i.test(err.message))
  ) {
    return `Couldn't reach ${name}. Try again in a moment.`;
  }
  return null;
}

/**
 * Checks the key works and settles which model to use: the one asked for, or the provider's
 * default (for OpenAI and Gemini, the first preferred model the key can use).
 */
export async function verifyKey(provider: AiProvider, key: string, model?: string): Promise<string> {
  try {
    if (provider === "ANTHROPIC") {
      const id = model || AI_PROVIDERS.ANTHROPIC.defaultModel;
      await anthropic(key).models.retrieve(id);
      return id;
    }
    if (provider === "GEMINI") return await pickGeminiModel(key, model);
    const client = openai(key);
    if (model) {
      await client.models.retrieve(model);
      return model;
    }
    const available = new Set<string>();
    for await (const m of client.models.list()) available.add(m.id);
    const pick = AI_PROVIDERS.OPENAI.models.find((m) => available.has(m));
    if (!pick) throw new AiError("Couldn't find a GPT-5 model on this key. Type the model name you want to use.");
    return pick;
  } catch (err) {
    if (err instanceof AiError) throw err;
    const msg = explain(err, provider);
    if (msg) throw new AiError(msg);
    throw err;
  }
}

async function pickGeminiModel(key: string, model?: string) {
  const client = gemini(key);
  if (model) {
    await client.models.get({ model });
    return model;
  }
  const available: string[] = [];
  for await (const m of await client.models.list()) {
    if (m.name && m.supportedActions?.includes("generateContent")) available.push(m.name.replace(/^models\//, ""));
  }
  // The newest stable "gemini-<version>-flash" the key offers (free-tier keys get Flash models).
  const version = (id: string) => Number(/^gemini-(\d+(?:\.\d+)?)-flash$/.exec(id)?.[1] ?? NaN);
  const newest = available.filter((id) => !Number.isNaN(version(id))).sort((a, b) => version(b) - version(a))[0];
  const pick = newest ?? AI_PROVIDERS.GEMINI.models.find((m) => available.includes(m));
  if (!pick) throw new AiError("Couldn't find a Gemini Flash model on this key. Type the model name you want to use.");
  return pick;
}

// Chat models only: drop audio, image, embedding, realtime and similar variants.
const NOT_CHAT = /(audio|realtime|transcribe|tts|image|embed|search|codex|vision|live|aqa|robotics|computer|moderation|instruct|nano-banana)/i;

/** Text models this key can use, for the model picker. Best effort: an empty list just hides the choice. */
export async function listModels(provider: AiProvider, key: string): Promise<string[]> {
  const ids: string[] = [];
  try {
    if (provider === "ANTHROPIC") {
      for await (const m of anthropic(key).models.list()) ids.push(m.id);
    } else if (provider === "OPENAI") {
      for await (const m of openai(key).models.list()) if (/^(gpt-5|o\d)/.test(m.id)) ids.push(m.id);
      ids.sort().reverse();
    } else {
      for await (const m of await gemini(key).models.list()) {
        const id = m.name?.replace(/^models\//, "");
        if (id?.startsWith("gemini-") && m.supportedActions?.includes("generateContent")) ids.push(id);
      }
      ids.sort().reverse();
    }
  } catch {
    return [];
  }
  return ids.filter((id) => !NOT_CHAT.test(id)).slice(0, 20);
}

export const editSchema = z.object({
  subject: z.string().describe("The full subject line."),
  body: z.string().describe("The full email body in Ripple's plain-text format."),
  summary: z.string().describe("One short sentence telling the user what you changed."),
});
export type EmailEdit = z.infer<typeof editSchema>;

const SYSTEM = `You edit outreach emails inside Ripple, an email tool. The user is writing one email that is sent to many recipients, and gives you an instruction about it.

Return the complete revised subject and body, not a diff. If the draft is empty, write a new email from the instruction.

The body is plain text that Ripple turns into HTML:
- A blank line starts a new paragraph. A single line break stays a line break.
- [text](https://example.com) makes a link. Bare URLs also become links.
- **text** makes bold. No other markdown, HTML, headings or bullet symbols other than "- ".
- Merge fields look like {{field}} or {{field|fallback}} and are filled per recipient. Use only the fields listed as available. Give a fallback when a field may be empty in a greeting, as in {{first_name|there}}. Never invent field names or put placeholders like [Name] in square brackets.

Keep every link and merge field the user already has unless the instruction says to change them. Keep the user's facts, names, numbers and dates; never make up new ones. If a fact is missing, write around it instead of guessing.
Write like a person, not a marketing template: short sentences, a clear ask, no filler openers like "I hope this email finds you well".
Only change what the instruction asks for. If it asks for one thing, leave the rest as it was.

The summary is one plain sentence, under 20 words, addressed to the user.`;

function userMessage(input: { instruction: string; subject: string; body: string; fields: string[] }) {
  const fields = input.fields.length
    ? input.fields.map((f) => `{{${f}}}`).join(", ")
    : "none yet (no recipient list). Only {{first_name|there}} is safe to use.";
  return [
    `Available merge fields: ${fields}`,
    "",
    `<subject>${input.subject}</subject>`,
    `<body>\n${input.body}\n</body>`,
    "",
    `Instruction: ${input.instruction}`,
  ].join("\n");
}

// Models that take `effort` and server-side refusal fallbacks.
const CURRENT_CLAUDE = /^claude-(opus|sonnet|haiku|fable)-5/;
const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

export async function editEmail(
  conn: { provider: AiProvider; encryptedKey: string; model: string },
  input: { instruction: string; subject: string; body: string; fields: string[] },
): Promise<EmailEdit> {
  const key = decrypt(conn.encryptedKey);
  try {
    if (conn.provider === "ANTHROPIC") {
      const current = CURRENT_CLAUDE.test(conn.model);
      const fallback = FALLBACK_MODELS.has(conn.model);
      const res = await anthropic(key).beta.messages.parse({
        model: conn.model,
        max_tokens: 16000,
        system: SYSTEM,
        messages: [{ role: "user", content: userMessage(input) }],
        output_config: {
          format: betaZodOutputFormat(editSchema),
          // A rewrite is a quick task; low effort keeps the editor responsive.
          ...(current ? { effort: "low" as const } : {}),
        },
        ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      });
      if (res.stop_reason === "refusal") throw new AiError("Claude declined this request. Try rewording it.");
      if (res.stop_reason === "max_tokens" || !res.parsed_output) {
        throw new AiError("Claude's answer came back incomplete. Try again.");
      }
      return res.parsed_output;
    }

    if (conn.provider === "GEMINI") {
      const schema = z.toJSONSchema(editSchema);
      delete schema.$schema;
      const res = await gemini(key).models.generateContent({
        model: conn.model,
        contents: userMessage(input),
        config: { systemInstruction: SYSTEM, responseMimeType: "application/json", responseJsonSchema: schema },
      });
      const finish = res.candidates?.[0]?.finishReason;
      if (finish === "SAFETY" || finish === "PROHIBITED_CONTENT" || res.promptFeedback?.blockReason) {
        throw new AiError("Gemini declined this request. Try rewording it.");
      }
      let json: unknown;
      try {
        json = JSON.parse(res.text ?? "");
      } catch {
        json = null;
      }
      const parsed = editSchema.safeParse(json);
      if (!parsed.success) throw new AiError("Gemini's answer came back incomplete. Try again.");
      return parsed.data;
    }

    const res = await openai(key).responses.parse({
      model: conn.model,
      instructions: SYSTEM,
      input: userMessage(input),
      text: { format: zodTextFormat(editSchema, "email_edit") },
    });
    if (!res.output_parsed) throw new AiError("ChatGPT's answer came back incomplete or was declined. Try again.");
    return res.output_parsed;
  } catch (err) {
    if (err instanceof AiError) throw err;
    const msg = explain(err, conn.provider);
    if (msg) throw new AiError(msg);
    console.error("AI edit failed", err);
    throw new AiError("The AI edit failed. Try again.");
  }
}
