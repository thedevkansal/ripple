"use client";

import { Globe, Loader2, RotateCw, Sparkles, Square } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { aiPersonalLine } from "@/app/dashboard/ai-actions";
import { inputClass } from "@/components/dashboard/forms";
import { Button } from "@/components/ui/button";
import type { RecipientRow } from "@/lib/csv";
import { cn } from "@/lib/utils";

export const PERSONAL_FIELD = "{{personal_line}}";

// One at a time: Next runs a page's server actions in sequence anyway, and free tiers only
// allow a handful of requests a minute.
const RATE_LIMIT_PAUSE_MS = 30_000;
const MAX_RATE_LIMIT_RETRIES = 2;
const PAGE = 50;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Puts {{personal_line}} after the greeting, or at the top if there isn't one. */
export function insertPersonalField(body: string) {
  const paragraphs = body.split(/\n{2,}/);
  const first = paragraphs[0]?.trim() ?? "";
  const isGreeting = first.length > 0 && first.length <= 60 && !first.includes("\n") && /[,!:]$/.test(first);
  if (isGreeting) paragraphs.splice(1, 0, PERSONAL_FIELD);
  else paragraphs.unshift(PERSONAL_FIELD);
  return paragraphs.join("\n\n");
}

/**
 * Writes and reviews one AI line per recipient. Lines live on the recipient rows, so they're
 * saved with the draft and fill {{personal_line}} when each email is sent.
 */
export function PersonalLines({
  ai,
  recipients,
  setRecipients,
  draft,
  onInsertField,
}: {
  ai: { label: string } | null;
  recipients: RecipientRow[];
  setRecipients: (update: (rows: RecipientRow[]) => RecipientRow[]) => void;
  draft: { subject: string; body: string };
  onInsertField: () => void;
}) {
  const [brief, setBrief] = useState("");
  const [research, setResearch] = useState(false);
  const [running, setRunning] = useState<{ done: number; total: number; note?: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(PAGE);
  const stopRef = useRef(false);

  const written = recipients.filter((r) => r.personal?.trim()).length;
  const missing = recipients.filter((r) => !r.personal?.trim());
  const usesField = (draft.subject + draft.body).includes("{{personal_line");

  function setLine(email: string, personal: string) {
    setRecipients((rows) => rows.map((r) => (r.email === email ? { ...r, personal } : r)));
  }

  async function writeOne(row: RecipientRow, onPause?: (note: string) => void): Promise<"ok" | "error" | "stop"> {
    setBusy((b) => new Set(b).add(row.email));
    try {
      for (let attempt = 0; ; attempt++) {
        const res = await aiPersonalLine({
          brief,
          research,
          subject: draft.subject,
          body: draft.body,
          recipient: { email: row.email, name: row.name, org: row.org, fields: row.fields },
        });
        if (res.ok) {
          setLine(row.email, res.line);
          setErrors((e) => {
            const next = { ...e };
            delete next[row.email];
            return next;
          });
          return "ok";
        }
        if (res.rateLimited && attempt < MAX_RATE_LIMIT_RETRIES && !stopRef.current) {
          onPause?.(`${ai?.label ?? "The AI"} asked Ripple to slow down. Waiting 30 seconds…`);
          await sleep(RATE_LIMIT_PAUSE_MS);
          onPause?.("");
          continue;
        }
        setErrors((e) => ({ ...e, [row.email]: res.error }));
        return res.rateLimited ? "stop" : "error";
      }
    } finally {
      setBusy((b) => {
        const next = new Set(b);
        next.delete(row.email);
        return next;
      });
    }
  }

  async function writeMany(rows: RecipientRow[]) {
    if (!rows.length || running) return;
    stopRef.current = false;
    setErrors((e) => {
      const next = { ...e };
      delete next._run;
      return next;
    });
    let done = 0;
    let stoppedForLimit = false;
    setRunning({ done, total: rows.length });
    const note = (text: string) => setRunning((r) => (r ? { ...r, note: text || undefined } : r));

    for (const row of rows) {
      if (stopRef.current) break;
      const result = await writeOne(row, note);
      done++;
      setRunning((r) => (r ? { ...r, done } : r));
      if (result === "stop") {
        stoppedForLimit = true;
        break;
      }
    }
    setRunning(null);
    if (stoppedForLimit) {
      setErrors((e) => ({
        ...e,
        _run: `Stopped: ${ai?.label ?? "the AI"} keeps rate limiting this key. Lines so far are kept; continue in a minute.`,
      }));
    }
  }

  if (!ai) {
    return (
      <p className="text-sm text-muted">
        Ripple can write a personal opening line for each recipient from their CSV details.{" "}
        <Link href="/dashboard/settings#ai" className="text-glow hover:underline">
          Connect an AI key
        </Link>{" "}
        to use it. Gemini’s free tier works.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-muted">
        {ai.label} writes one opening line for each person from their row in your list, and it fills{" "}
        <code className="text-text">{PERSONAL_FIELD}</code>. Read them before you send.
      </p>

      <label className="flex flex-col gap-1.5 text-sm text-muted">
        What should each line do? <span className="sr-only">(optional)</span>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="Optional. e.g. connect their company's work to our fintech track and mention why they'd enjoy the audience"
          className={cn(inputClass, "field-sizing-content h-auto min-h-16 w-full resize-none py-2.5 leading-relaxed")}
        />
      </label>

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={research}
          onChange={(e) => setResearch(e.target.checked)}
          className="mt-0.5 size-4 accent-[var(--glow)]"
        />
        <span>
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Globe className="size-3.5 text-glow" />
            Look each person up on the web first
          </span>
          <span className="block text-muted">Better lines for well-known people and companies. Slower, and check the facts.</span>
        </span>
      </label>

      {!usesField && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warn/25 bg-warn/5 px-3.5 py-2.5 text-sm text-warn">
          <span className="flex-1">
            Your message doesn’t use <code>{PERSONAL_FIELD}</code> yet, so the lines won’t appear.
          </span>
          <Button size="sm" variant="secondary" onClick={onInsertField}>
            Add after greeting
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {running ? (
          <>
            <div className="flex min-w-48 flex-1 flex-col gap-1.5">
              <p className="flex items-center gap-2 text-sm">
                <Loader2 className="size-3.5 animate-spin text-glow" />
                Writing {Math.min(running.done + 1, running.total)} of {running.total}…
              </p>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-glow transition-[width] duration-300"
                  style={{ width: `${(running.done / running.total) * 100}%` }}
                />
              </div>
              {running.note && <p className="text-xs text-muted">{running.note}</p>}
            </div>
            <Button size="sm" variant="secondary" onClick={() => (stopRef.current = true)}>
              <Square className="size-3" />
              Stop
            </Button>
          </>
        ) : (
          <>
            {missing.length > 0 && (
              <Button size="sm" onClick={() => writeMany(missing)}>
                <Sparkles className="size-3.5" />
                {written ? `Write the other ${missing.length}` : `Write ${recipients.length} lines`}
              </Button>
            )}
            {written > 0 && (
              <Button
                size="sm"
                variant={missing.length ? "ghost" : "secondary"}
                onClick={() => {
                  if (confirm(`Rewrite all ${recipients.length} lines? Your edits will be replaced.`)) writeMany(recipients);
                }}
              >
                Rewrite all
              </Button>
            )}
            <span className="ml-auto text-xs text-faint tabular">
              {written} of {recipients.length} written
            </span>
          </>
        )}
      </div>

      {errors._run && !running && (
        <p role="alert" className="rounded-xl border border-red-400/25 bg-red-400/[0.06] px-3.5 py-2.5 text-[13px] text-red-300">
          {errors._run}
        </p>
      )}

      {written > 0 || Object.keys(errors).some((k) => k !== "_run") ? (
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line">
          {recipients.slice(0, shown).map((r) => (
            <li key={r.email} className="flex flex-col gap-1.5 px-3.5 py-3">
              <div className="flex items-center gap-2 text-xs">
                <span className="min-w-0 truncate font-medium text-text">{r.name || r.email}</span>
                {r.org && <span className="truncate text-faint">{r.org}</span>}
                <button
                  type="button"
                  disabled={busy.has(r.email) || !!running}
                  onClick={() => writeOne(r)}
                  aria-label={`Rewrite the line for ${r.email}`}
                  title="Rewrite this line"
                  className="press ml-auto grid size-7 shrink-0 place-items-center rounded-md text-faint transition-colors hover:bg-white/[0.05] hover:text-text disabled:opacity-40"
                >
                  {busy.has(r.email) ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
                </button>
              </div>
              <label className="sr-only" htmlFor={`pl-${r.email}`}>
                Personal line for {r.email}
              </label>
              <textarea
                id={`pl-${r.email}`}
                value={r.personal ?? ""}
                onChange={(e) => setLine(r.email, e.target.value)}
                rows={1}
                maxLength={600}
                placeholder="Not written yet"
                className="field-sizing-content w-full resize-none rounded-lg bg-transparent px-0 text-sm leading-relaxed text-text outline-none placeholder:text-faint focus-visible:outline-none"
              />
              {errors[r.email] && <p className="text-xs text-red-300">{errors[r.email]}</p>}
            </li>
          ))}
          {recipients.length > shown && (
            <li className="px-3.5 py-2.5 text-center">
              <button type="button" onClick={() => setShown((n) => n + PAGE)} className="text-sm text-glow hover:underline">
                Show {Math.min(PAGE, recipients.length - shown)} more
              </button>
            </li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
