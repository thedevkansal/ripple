"use client";

import { Check, Loader2, Send, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { aiDraftReply, sendReply } from "@/app/dashboard/replies/actions";
import { cn } from "@/lib/utils";

/** Writes and sends a reply in the conversation's Gmail thread, with an optional AI draft. */
export function ReplyComposer({
  messageId,
  ai,
  to,
  from,
}: {
  messageId: string;
  ai: { label: string; model: string } | null;
  to: string;
  from: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [drafting, startDraft] = useTransition();
  const [sending, startSend] = useTransition();
  const busy = drafting || sending;

  function draft() {
    setError(null);
    startDraft(async () => {
      const res = await aiDraftReply({ messageId, instruction, draft: body });
      if (!res.ok) return setError(res.error);
      setBody(res.text ?? "");
      setInstruction("");
    });
  }

  function send() {
    setError(null);
    startSend(async () => {
      const res = await sendReply({ messageId, body });
      if (!res.ok) return setError(res.error);
      setBody("");
      setSent(true);
      // Gmail takes a moment to add the sent reply to the thread.
      setTimeout(() => router.refresh(), 1500);
      setTimeout(() => setSent(false), 6000);
    });
  }

  return (
    <section aria-label="Reply" className="mt-6 rounded-2xl border border-line-strong bg-surface">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-5 py-3 text-xs text-faint">
        <span>
          To <span className="text-muted">{to}</span>
        </span>
        <span>
          From <span className="text-muted">{from}</span>
        </span>
      </div>

      {ai ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            draft();
          }}
          className="flex items-center gap-2 border-b border-line px-3 py-2"
        >
          <Sparkles className={cn("ml-2 size-3.5 shrink-0 text-glow", drafting && "animate-pulse")} />
          <label htmlFor="reply-instruction" className="sr-only">
            What should the reply say?
          </label>
          <input
            id="reply-instruction"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            disabled={busy}
            maxLength={2000}
            placeholder={body ? `Ask ${ai.label} to improve your draft…` : `Tell ${ai.label} what to say, e.g. "yes, propose Tuesday 4pm"`}
            className="h-9 min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-faint focus-visible:outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className="press inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-glow transition-colors hover:bg-glow/10 disabled:opacity-50"
          >
            {drafting ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {body ? "Improve" : "Draft"}
          </button>
        </form>
      ) : (
        <p className="border-b border-line px-5 py-2.5 text-xs text-faint">
          <Link href="/dashboard/settings#ai" className="text-glow hover:underline">
            Connect an AI key
          </Link>{" "}
          to draft replies with Claude, ChatGPT or Gemini.
        </p>
      )}

      <label htmlFor="reply-body" className="sr-only">
        Your reply
      </label>
      <textarea
        id="reply-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={busy}
        rows={7}
        placeholder="Write your reply…"
        className="field-sizing-content block max-h-[28rem] min-h-40 w-full resize-none bg-transparent px-5 py-4 text-sm leading-relaxed text-text outline-none placeholder:text-faint focus-visible:outline-none disabled:opacity-60"
      />

      <div className="flex flex-wrap items-center gap-3 border-t border-line px-3 py-2.5">
        {error && (
          <p role="alert" className="min-w-0 flex-1 px-2 text-[13px] text-red-300">
            {error}
          </p>
        )}
        {sent && !error && (
          <p role="status" className="flex min-w-0 flex-1 items-center gap-1.5 px-2 text-[13px] text-glow">
            <Check className="size-3.5" />
            Sent in the same Gmail thread.
          </p>
        )}
        <button
          type="button"
          onClick={send}
          disabled={busy || !body.trim()}
          className="press ml-auto inline-flex h-9 items-center gap-2 rounded-full bg-glow px-4 text-sm font-semibold text-ink shadow-[var(--glow-shadow)] transition-[filter,opacity] hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
        >
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-3.5" />}
          Send reply
        </button>
      </div>
    </section>
  );
}
