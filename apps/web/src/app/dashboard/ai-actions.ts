"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { AiError, editEmail, type EmailEdit, listModels, verifyKey, writePersonalLine } from "@/lib/ai";
import { AI_PROVIDERS } from "@/lib/ai-providers";
import { decrypt, encrypt } from "@/lib/crypto";
import { requireUser, requireWorkspace } from "@/lib/workspace";
import type { ActionResult } from "./actions";

const keySchema = z.object({
  provider: z.enum(["ANTHROPIC", "OPENAI", "GEMINI"]),
  apiKey: z.string().trim().max(500),
  model: z.string().trim().max(80).regex(/^[\w.:-]*$/, "That doesn't look like a model name."),
});

/** Saves the user's own AI key after checking it works. Leave the key blank to only change the model. */
export async function saveAiKey(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = keySchema.safeParse({
    provider: form.get("provider"),
    apiKey: form.get("apiKey") ?? "",
    model: form.get("model") ?? "",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { provider, apiKey, model } = parsed.data;
  const info = AI_PROVIDERS[provider];

  const existing = await db.aiKey.findUnique({ where: { userId: user.id } });
  let key = apiKey;
  if (!key) {
    if (!existing || existing.provider !== provider) return { ok: false, error: `Paste your ${info.company} API key.` };
    key = decrypt(existing.encryptedKey);
  } else if (!info.keyPattern.test(key)) {
    return { ok: false, error: `That doesn't look like a ${info.company} API key. Copy it again from ${new URL(info.keyUrl).host}.` };
  }

  let resolved: string;
  try {
    resolved = await verifyKey(provider, key, model || undefined);
  } catch (err) {
    if (err instanceof AiError) return { ok: false, error: err.message };
    throw err;
  }

  const data = { provider, encryptedKey: encrypt(key), keyHint: key.slice(-4), model: resolved };
  await db.aiKey.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
  revalidatePath("/dashboard/settings");
  return { ok: true, message: `Connected. Prompt edits will use ${resolved}.` };
}

export async function removeAiKey() {
  const user = await requireUser();
  await db.aiKey.deleteMany({ where: { userId: user.id } });
  revalidatePath("/dashboard/settings");
}

const editInput = z.object({
  instruction: z.string().trim().min(1, "Tell the AI what to change.").max(2000, "Keep the prompt under 2,000 characters."),
  subject: z.string().max(500),
  body: z.string().max(20_000, "The email is too long to edit with AI."),
  fields: z.array(z.string().max(64)).max(50),
});

export type AiEditResult = ({ ok: true } & EmailEdit) | { ok: false; error: string };

/** Rewrites the campaign draft's subject and body with the user's own AI key. Nothing is saved. */
export async function aiEditEmail(input: z.input<typeof editInput>): Promise<AiEditResult> {
  const { user } = await requireWorkspace();
  const parsed = editInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const conn = await db.aiKey.findUnique({ where: { userId: user.id } });
  if (!conn) return { ok: false, error: "Connect Claude, ChatGPT or Gemini in Settings first." };

  try {
    const edit = await editEmail(conn, parsed.data);
    return { ok: true, ...edit };
  } catch (err) {
    if (err instanceof AiError) return { ok: false, error: err.message };
    throw err;
  }
}

/** Models the user's key can use, for the picker in the editor. */
export async function aiModels(): Promise<string[]> {
  const user = await requireUser();
  const conn = await db.aiKey.findUnique({ where: { userId: user.id } });
  if (!conn) return [];
  return listModels(conn.provider, decrypt(conn.encryptedKey));
}

/** Switches the model prompt edits use. Only models the key lists are accepted. */
export async function setAiModel(model: string): Promise<ActionResult> {
  const user = await requireUser();
  const conn = await db.aiKey.findUnique({ where: { userId: user.id } });
  if (!conn) return { ok: false, error: "Connect an AI key in Settings first." };
  const available = await listModels(conn.provider, decrypt(conn.encryptedKey));
  if (!available.includes(model)) return { ok: false, error: "That model isn't available on your key." };
  await db.aiKey.update({ where: { userId: user.id }, data: { model } });
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

const personalInput = z.object({
  brief: z.string().max(1000),
  subject: z.string().max(500),
  body: z.string().max(20_000),
  research: z.boolean(),
  recipient: z.object({
    email: z.string().max(254),
    name: z.string().max(120).optional(),
    org: z.string().max(120).optional(),
    fields: z.record(z.string().max(60), z.string().max(500)).optional(),
  }),
});

export type PersonalLineResult = { ok: true; line: string } | { ok: false; error: string; rateLimited?: boolean };

/** Writes one recipient's {{personal_line}} with the user's own AI key. The editor calls it per row. */
export async function aiPersonalLine(input: z.input<typeof personalInput>): Promise<PersonalLineResult> {
  const { user } = await requireWorkspace();
  const parsed = personalInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Those recipient details can't be used." };

  const conn = await db.aiKey.findUnique({ where: { userId: user.id } });
  if (!conn) return { ok: false, error: "Connect Claude, ChatGPT or Gemini in Settings first." };

  try {
    return { ok: true, line: await writePersonalLine(conn, parsed.data) };
  } catch (err) {
    if (err instanceof AiError) return { ok: false, error: err.message, rateLimited: err.rateLimited };
    throw err;
  }
}
