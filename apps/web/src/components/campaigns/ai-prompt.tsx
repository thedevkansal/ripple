"use client";

import { ArrowUp, Check, ChevronDown, Loader2, Sparkles, Undo2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { aiEditEmail, aiModels, setAiModel } from "@/app/dashboard/ai-actions";
import { cn } from "@/lib/utils";

type Draft = { subject: string; body: string };

const QUICK: { label: string; prompt: string }[] = [
  { label: "Shorter", prompt: "Make it about a third shorter without losing the ask." },
  { label: "More formal", prompt: "Make the tone more formal and professional." },
  { label: "Warmer", prompt: "Make the tone warmer and more personal." },
  { label: "Fix grammar", prompt: "Fix grammar, spelling and punctuation only. Change nothing else." },
  { label: "Better subject", prompt: "Rewrite only the subject line so it's specific and worth opening." },
];

/** Composer that writes or rewrites the draft's subject and body with the user's own AI key. */
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
  const [model, setModel] = useState(ai?.model ?? "");
  const [models, setModels] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!ai) return;
    let live = true;
    aiModels().then((list) => live && setModels(list));
    return () => {
      live = false;
    };
  }, [ai]);

  if (!ai) {
    return (
      <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-dashed border-line-strong px-4 py-3.5 text-sm text-muted">
        <Sparkles className="size-4 text-glow" />
        <span className="flex-1">Write and edit this email with prompts using Claude, ChatGPT or Gemini.</span>
        <Link href="/dashboard/settings#ai" className="font-medium text-glow hover:underline">
          Connect your AI
        </Link>
      </div>
    );
  }

  const empty = !draft.subject.trim() && !draft.body.trim();
  const canUndo = last && last.after.subject === draft.subject && last.after.body === draft.body;
  const options = models.includes(model) ? models : [model, ...models];

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

  function pickModel(next: string) {
    const prev = model;
    setModel(next);
    setError(null);
    setAiModel(next).then((res) => {
      if (!res.ok) {
        setModel(prev);
        setError(res.error);
      }
    });
  }

  return (
    <div className="mb-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(prompt);
        }}
        className={cn(
          "rounded-2xl border bg-ink-sunken/40 transition-[border-color,box-shadow] duration-200",
          "border-line-strong focus-within:border-glow/50 focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--glow)_12%,transparent)]",
        )}
      >
        <label htmlFor="ai-prompt" className="flex items-center gap-2 px-4 pt-3.5 text-[13px] font-medium text-muted">
          <Sparkles className={cn("size-3.5 text-glow", pending && "animate-pulse")} />
          {empty ? `Write this email with ${ai.label}` : `Edit with ${ai.label}`}
        </label>
        <textarea
          id="ai-prompt"
          ref={inputRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              run(prompt);
            }
          }}
          disabled={pending}
          rows={2}
          maxLength={2000}
          placeholder={
            empty
              ? "Who is it for, what are you asking, and the key facts. e.g. invite fintech founders to speak at E-Summit '26 on 14 Feb"
              : "What should change? e.g. mention last year's 8,000 attendees"
          }
          className="field-sizing-content block max-h-48 min-h-[3.5rem] w-full resize-none bg-transparent px-4 pt-1.5 pb-3 text-sm leading-relaxed text-text outline-none placeholder:text-faint focus-visible:outline-none disabled:opacity-60"
        />

        {!empty && (
          <div className="flex flex-wrap gap-1.5 px-4 pb-3">
            {QUICK.map((q) => (
              <button
                key={q.label}
                type="button"
                disabled={pending}
                onClick={() => run(q.prompt)}
                className="press h-7 rounded-full border border-line-strong px-3 text-xs whitespace-nowrap text-muted transition-colors hover:border-glow/40 hover:text-text disabled:opacity-50"
              >
                {q.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-line py-2 pr-2 pl-1.5">
          <div className="relative min-w-0">
            <label htmlFor="ai-model" className="sr-only">
              Model
            </label>
            <select
              id="ai-model"
              value={model}
              disabled={pending}
              onChange={(e) => pickModel(e.target.value)}
              className="h-8 max-w-full cursor-pointer appearance-none truncate rounded-lg bg-transparent pr-6 pl-2.5 font-mono text-[11px] text-muted transition-colors hover:bg-white/[0.05] hover:text-text focus-visible:outline-offset-0"
            >
              {options.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-1.5 size-3.5 -translate-y-1/2 text-faint" />
          </div>

          <button
            type="submit"
            disabled={pending || !prompt.trim()}
            aria-label={empty ? "Write email" : "Apply prompt"}
            className={cn(
              "press grid h-8 shrink-0 place-items-center rounded-full bg-glow text-ink shadow-[var(--glow-shadow)] transition-[filter,opacity] hover:brightness-110 disabled:opacity-40 disabled:shadow-none",
              empty ? "px-4 text-[13px] font-semibold" : "w-8",
            )}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : empty ? (
              "Write"
            ) : (
              <ArrowUp className="size-4" />
            )}
          </button>
        </div>
      </form>

      {pending && (
        <p role="status" className="mt-2.5 px-1 text-[13px] text-muted">
          {ai.label} is {empty ? "writing" : "editing"} your email…
        </p>
      )}
      {error && !pending && (
        <p role="alert" className="mt-2.5 rounded-xl border border-red-400/25 bg-red-400/[0.06] px-3.5 py-2.5 text-[13px] text-red-300">
          {error}
        </p>
      )}
      {canUndo && !pending && (
        <div
          role="status"
          className="mt-2.5 flex items-center gap-3 rounded-xl border border-glow/20 bg-glow/[0.06] py-2 pr-2 pl-3.5 text-[13px]"
        >
          <Check className="size-4 shrink-0 text-glow" />
          <span className="min-w-0 flex-1 text-text">{last.summary}</span>
          <button
            type="button"
            onClick={() => {
              onChange(last.before);
              setLast(null);
              inputRef.current?.focus();
            }}
            className="press inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-muted transition-colors hover:bg-white/[0.05] hover:text-text"
          >
            <Undo2 className="size-3.5" />
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
