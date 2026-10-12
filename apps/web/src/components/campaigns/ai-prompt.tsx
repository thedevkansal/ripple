"use client";

import { ArrowUp, Sparkles, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { aiEditEmail } from "@/app/dashboard/ai-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Draft = { subject: string; body: string };

const QUICK: { label: string; prompt: string }[] = [
  { label: "Shorter", prompt: "Make it about a third shorter without losing the ask." },
  { label: "More formal", prompt: "Make the tone more formal and professional." },
  { label: "Warmer", prompt: "Make the tone warmer and more personal." },
  { label: "Fix grammar", prompt: "Fix grammar, spelling and punctuation only. Change nothing else." },
  { label: "Better subject", prompt: "Rewrite only the subject line so it's specific and worth opening." },
];

/** Prompt box that rewrites the draft's subject and body with the user's own AI key. */
export function AiPrompt({
  ai,
  draft,
  fields,
  onChange,
}: {
  ai: { label: string; model: string } | null;
  draft: Draft;
  fields: string[];
  onChange: (next: Draft) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  // The draft before the last AI edit, kept until the user changes the result by hand.
  const [last, setLast] = useState<{ before: Draft; after: Draft; summary: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  if (!ai) {
    return (
      <p className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-line px-3.5 py-3 text-sm text-muted">
        <Sparkles className="size-4 text-glow" />
        Write and edit this email with prompts using Claude or ChatGPT.
        <Link href="/dashboard/settings#ai" className="text-glow hover:underline">
          Connect your API key
        </Link>
      </p>
    );
  }

  const empty = !draft.subject.trim() && !draft.body.trim();
  const canUndo = last && last.after.subject === draft.subject && last.after.body === draft.body;

  function run(instruction: string) {
    const text = instruction.trim();
    if (!text || pending) return;
    setError(null);
    startTransition(async () => {
      const before = draft;
      const res = await aiEditEmail({ instruction: text, subject: before.subject, body: before.body, fields });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const after = { subject: res.subject, body: res.body };
      onChange(after);
      setLast({ before, after, summary: res.summary });
      setPrompt("");
    });
  }

  return (
    <div className="mb-5 rounded-xl border border-glow/25 bg-glow/[0.04] p-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(prompt);
        }}
        className="flex items-end gap-2"
      >
        <label htmlFor="ai-prompt" className="sr-only">
          Prompt for {ai.label}
        </label>
        <Sparkles className={cn("mb-2.5 size-4 shrink-0 text-glow", pending && "animate-pulse")} />
        <textarea
          id="ai-prompt"
          ref={inputRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              run(prompt);
            }
          }}
          disabled={pending}
          rows={empty ? 3 : 1}
          maxLength={2000}
          placeholder={
            empty
              ? "Describe the email: who it's for, what you're asking and the key facts. Ctrl+Enter to write."
              : `Ask ${ai.label} to change something, e.g. "mention last year's 8,000 attendees"`
          }
          className="min-h-9 flex-1 resize-none bg-transparent py-2 text-sm text-text outline-none placeholder:text-faint field-sizing-content max-h-40 disabled:opacity-60"
        />
        <Button type="submit" size="sm" disabled={pending || !prompt.trim()} aria-label={empty ? "Write email" : "Apply prompt"}>
          {pending ? "Writing…" : empty ? "Write" : <ArrowUp className="size-3.5" />}
        </Button>
      </form>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-6">
        {!empty &&
          QUICK.map((q) => (
            <button
              key={q.label}
              type="button"
              disabled={pending}
              onClick={() => run(q.prompt)}
              className="press rounded-md border border-line-strong px-2 py-0.5 text-xs text-muted hover:text-text disabled:opacity-50"
            >
              {q.label}
            </button>
          ))}
        <span className="ml-auto text-xs text-faint">{ai.model}</span>
      </div>

      {error && (
        <p role="alert" className="mt-2 pl-6 text-sm text-red-300">
          {error}
        </p>
      )}
      {canUndo && !pending && (
        <p role="status" className="mt-2 flex flex-wrap items-center gap-2 pl-6 text-sm text-muted">
          <span className="min-w-0 flex-1">{last.summary}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(last.before);
              setLast(null);
              inputRef.current?.focus();
            }}
          >
            <Undo2 className="size-3.5" />
            Undo
          </Button>
        </p>
      )}
    </div>
  );
}
