"use client";

import { ArrowUp, Check, ChevronDown, ClipboardPaste, ExternalLink, Loader2, Sparkles, Undo2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { aiEditEmail, aiModels, setAiModel } from "@/app/dashboard/ai-actions";
import { chatPrompt, parseChatAnswer } from "@/lib/ai-instructions";
import { cn } from "@/lib/utils";

type Draft = { subject: string; body: string };

const QUICK: { label: string; prompt: string }[] = [
  { label: "Shorter", prompt: "Make it about a third shorter without losing the ask." },
  { label: "More formal", prompt: "Make the tone more formal and professional." },
  { label: "Warmer", prompt: "Make the tone warmer and more personal." },
  { label: "Fix grammar", prompt: "Fix grammar, spelling and punctuation only. Change nothing else." },
  { label: "Better subject", prompt: "Rewrite only the subject line so it's specific and worth opening." },
];

// Chat apps that take a prompt in the link, so people can use their own subscription.
const CHAT_APPS = [
  { name: "ChatGPT", url: (q: string) => `https://chatgpt.com/?q=${q}`, home: "https://chatgpt.com/" },
  { name: "Claude", url: (q: string) => `https://claude.ai/new?q=${q}`, home: "https://claude.ai/new" },
] as const;
type ChatApp = (typeof CHAT_APPS)[number]["name"];
// Past this, links get too long for some browsers; the prompt is on the clipboard either way.
const MAX_LINK_PROMPT = 6000;

/** Composer that writes or rewrites the draft's subject and body with AI. */
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
  const [pasteFrom, setPasteFrom] = useState<ChatApp | null>(null);
  const [pasted, setPasted] = useState("");
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

  const empty = !draft.subject.trim() && !draft.body.trim();
  const canUndo = last && last.after.subject === draft.subject && last.after.body === draft.body;
  const options = models.includes(model) ? models : [model, ...models];
  const label = ai?.label ?? "AI";

  function apply(after: Draft, summary: string) {
    setLast({ before: draft, after, summary });
    onChange(after);
  }

  function run(instruction: string) {
    const text = instruction.trim();
    if (!text || pending || !ai) return;
    setError(null);
    startTransition(async () => {
      const res = await aiEditEmail({ instruction: text, subject: draft.subject, body: draft.body, fields });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      apply({ subject: res.subject, body: res.body }, res.summary);
      setPrompt("");
    });
  }

  function openIn(app: (typeof CHAT_APPS)[number], instruction = prompt) {
    const text = instruction.trim();
    if (!text) {
      setError(`Type what you want first, then open it in ${app.name}.`);
      inputRef.current?.focus();
      return;
    }
    setError(null);
    const full = chatPrompt({ instruction: text, subject: draft.subject, body: draft.body, fields });
    const encoded = encodeURIComponent(full);
    // Open first: browsers only allow pop-ups straight from the click.
    window.open(encoded.length <= MAX_LINK_PROMPT ? app.url(encoded) : app.home, "_blank", "noopener");
    navigator.clipboard?.writeText(full).catch(() => undefined);
    setPasteFrom(app.name);
    setPasted("");
  }

  function applyPasted() {
    const parsed = parseChatAnswer(pasted);
    if (!parsed) {
      setError("Couldn't find SUBJECT: and BODY: in that answer. Copy the whole reply and paste it again.");
      return;
    }
    setError(null);
    apply(parsed, `Applied ${pasteFrom}'s version.`);
    setPasteFrom(null);
    setPasted("");
    setPrompt("");
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
          if (ai) run(prompt);
          else openIn(CHAT_APPS[0]);
        }}
        className={cn(
          "rounded-2xl border bg-ink-sunken/40 transition-[border-color,box-shadow] duration-200",
          "border-line-strong focus-within:border-glow/50 focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--glow)_12%,transparent)]",
        )}
      >
        <label htmlFor="ai-prompt" className="flex items-center gap-2 px-4 pt-3.5 text-[13px] font-medium text-muted">
          <Sparkles className={cn("size-3.5 text-glow", pending && "animate-pulse")} />
          {ai ? (empty ? `Write this email with ${label}` : `Edit with ${label}`) : empty ? "Write this email with AI" : "Edit with AI"}
        </label>
        <textarea
          id="ai-prompt"
          ref={inputRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
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
                onClick={() => (ai ? run(q.prompt) : setPrompt(q.prompt))}
                className="press h-7 rounded-full border border-line-strong px-3 text-xs whitespace-nowrap text-muted transition-colors hover:border-glow/40 hover:text-text disabled:opacity-50"
              >
                {q.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-line py-2 pr-2 pl-1.5">
          {ai ? (
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
          ) : (
            <Link
              href="/dashboard/settings#ai"
              className="rounded-lg px-2.5 py-1.5 text-xs text-muted transition-colors hover:bg-white/[0.05] hover:text-text"
            >
              Add an API key to edit here
            </Link>
          )}

          <div className="flex shrink-0 items-center gap-1">
            {CHAT_APPS.map((app) => (
              <button
                key={app.name}
                type="button"
                disabled={pending}
                onClick={() => openIn(app)}
                title={`Copy the prompt and open it in ${app.name}, using your own subscription`}
                className="press inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-muted transition-colors hover:bg-white/[0.05] hover:text-text disabled:opacity-50"
              >
                {app.name}
                <ExternalLink className="size-3" />
              </button>
            ))}
            {ai && (
              <button
                type="submit"
                disabled={pending || !prompt.trim()}
                aria-label={empty ? "Write email" : "Apply prompt"}
                className={cn(
                  "press ml-1 grid h-8 place-items-center rounded-full bg-glow text-ink shadow-[var(--glow-shadow)] transition-[filter,opacity] hover:brightness-110 disabled:opacity-40 disabled:shadow-none",
                  empty ? "px-4 text-[13px] font-semibold" : "w-8",
                )}
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : empty ? "Write" : <ArrowUp className="size-4" />}
              </button>
            )}
          </div>
        </div>
      </form>

      {pasteFrom && (
        <div className="mt-2.5 rounded-2xl border border-line-strong bg-surface p-3.5">
          <p className="text-[13px] text-muted">
            The prompt is copied and {pasteFrom} is open in a new tab. Send it there, copy {pasteFrom}’s answer, and
            paste it here.
          </p>
          <label htmlFor="ai-paste" className="sr-only">
            {pasteFrom}’s answer
          </label>
          <textarea
            id="ai-paste"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={4}
            placeholder={`SUBJECT: …\nBODY:\n…`}
            className="mt-2.5 block w-full resize-y rounded-xl border border-line-strong bg-ink-sunken/60 px-3 py-2.5 font-mono text-xs leading-relaxed text-text outline-none placeholder:text-faint focus:border-glow/50 focus-visible:outline-none"
          />
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={applyPasted}
              disabled={!pasted.trim()}
              className="press inline-flex h-8 items-center gap-1.5 rounded-full bg-glow px-3.5 text-[13px] font-semibold text-ink shadow-[var(--glow-shadow)] hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
            >
              <ClipboardPaste className="size-3.5" />
              Use this version
            </button>
            <button
              type="button"
              onClick={() => {
                setPasteFrom(null);
                setError(null);
              }}
              className="press h-8 rounded-lg px-3 text-[13px] text-muted hover:bg-white/[0.05] hover:text-text"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {pending && (
        <p role="status" className="mt-2.5 px-1 text-[13px] text-muted">
          {label} is {empty ? "writing" : "editing"} your email…
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
