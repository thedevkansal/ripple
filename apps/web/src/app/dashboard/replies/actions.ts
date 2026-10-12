"use server";

import { textToHtml } from "@ripple/shared";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AiError, draftReply } from "@/lib/ai";
import { db } from "@/lib/db";
import { GmailReadError, splitQuoted } from "@/lib/gmail-read";
import { GmailSendError, sendViaGmail } from "@/lib/gmail-send";
import { GoogleAuthError } from "@/lib/google";
import { loadConversation } from "@/lib/replies";
import { requireWorkspace } from "@/lib/workspace";

export type ReplyResult = { ok: true; text?: string } | { ok: false; error: string };

async function conversationFor(messageId: string) {
  const { user, workspace } = await requireWorkspace();
  try {
    const convo = await loadConversation(messageId, user.id, workspace.id);
    return { user, convo, error: convo ? null : "This conversation isn't yours or no longer exists." };
  } catch (err) {
    if (err instanceof GoogleAuthError || (err instanceof GmailReadError && err.kind === "auth")) {
      return { user, convo: null, error: "Google signed this Gmail out. Reconnect it in Settings." };
    }
    if (err instanceof GmailReadError && err.kind === "scope") {
      return { user, convo: null, error: "Ripple can't read this Gmail yet. Reconnect it in Settings and allow reading." };
    }
    throw err;
  }
}

const sendInput = z.object({ messageId: z.string().min(1), body: z.string().trim().min(1, "Write a reply first.").max(20_000) });

/** Sends the user's reply in the same Gmail thread, as a normal reply to the latest message. */
export async function sendReply(input: z.input<typeof sendInput>): Promise<ReplyResult> {
  const parsed = sendInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { user, convo, error } = await conversationFor(parsed.data.messageId);
  if (!convo?.items?.length || !convo.token) return { ok: false, error: error ?? "This conversation can't be loaded from Gmail." };

  const theirs = [...convo.items].reverse().find((m) => !m.fromMe);
  const last = convo.items[convo.items.length - 1];
  const to = theirs?.replyTo ?? (theirs ? `${theirs.from.name ? `${theirs.from.name} ` : ""}<${theirs.from.email}>` : null);
  if (!to) return { ok: false, error: "There's no reply from them to answer yet." };
  const toAddress = /<([^>]+)>/.exec(to)?.[1] ?? to;
  const baseSubject = (theirs?.subject || convo.message.subject).replace(/^(re:\s*)+/i, "");

  try {
    await sendViaGmail(
      convo.token,
      {
        from: { email: convo.account.email, name: user.name },
        to: { email: toAddress.trim(), name: theirs?.from.name },
        subject: `Re: ${baseSubject}`,
        text: parsed.data.body,
        html: textToHtml(parsed.data.body),
        inReplyTo: last.rfcId ?? undefined,
        references: [...last.references, ...(last.rfcId ? [last.rfcId] : [])].slice(-20),
      },
      { threadId: convo.message.gmailThreadId! },
    );
  } catch (err) {
    if (err instanceof GmailSendError && err.kind === "auth") {
      return { ok: false, error: "Google signed this Gmail out. Reconnect it in Settings." };
    }
    if (err instanceof GmailSendError) return { ok: false, error: `Gmail didn't send it: ${err.message}` };
    throw err;
  }

  await db.reply.updateMany({ where: { messageId: convo.message.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/dashboard/replies", "layout");
  return { ok: true };
}

const draftInput = z.object({
  messageId: z.string().min(1),
  instruction: z.string().max(2000),
  draft: z.string().max(20_000),
});

/** Drafts a reply with the user's own AI key, from the live conversation. Nothing is sent. */
export async function aiDraftReply(input: z.input<typeof draftInput>): Promise<ReplyResult> {
  const parsed = draftInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That draft can't be used." };
  const { user, convo, error } = await conversationFor(parsed.data.messageId);
  if (!convo?.items?.length) return { ok: false, error: error ?? "This conversation can't be loaded from Gmail." };

  const conn = await db.aiKey.findUnique({ where: { userId: user.id } });
  if (!conn) return { ok: false, error: "Connect Claude, ChatGPT or Gemini in Settings to draft with AI." };

  try {
    const text = await draftReply(conn, {
      senderName: user.name ?? convo.account.email,
      thread: convo.items.slice(-8).map((m) => ({
        from: m.from.name ? `${m.from.name} <${m.from.email}>` : m.from.email,
        date: m.date.toISOString(),
        text: splitQuoted(m.text).main.slice(0, 6000),
        fromMe: m.fromMe,
      })),
      instruction: parsed.data.instruction,
      draft: parsed.data.draft,
    });
    return { ok: true, text };
  } catch (err) {
    if (err instanceof AiError) return { ok: false, error: err.message };
    throw err;
  }
}
