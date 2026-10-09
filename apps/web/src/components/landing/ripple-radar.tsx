"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Kind = "open" | "click" | "prefetch";

interface Recipient {
  name: string;
  role: string;
  /** Polar position on the radar: angle in degrees, radius as fraction of half-width. */
  angle: number;
  radius: number;
}

const RECIPIENTS: Recipient[] = [
  { name: "Priya", role: "Speaker", angle: -58, radius: 0.62 },
  { name: "Arjun", role: "Sponsor", angle: 18, radius: 0.78 },
  { name: "Meera", role: "Investor", angle: 128, radius: 0.55 },
  { name: "Kabir", role: "Speaker", angle: 198, radius: 0.8 },
  { name: "Sana", role: "Partner", angle: 72, radius: 0.42 },
  { name: "Rohan", role: "Sponsor", angle: -128, radius: 0.48 },
  { name: "Leah", role: "Mentor", angle: 250, radius: 0.66 },
];

interface ScriptEvent {
  who: number;
  kind: Kind;
  detail: string;
}

const SCRIPT: ScriptEvent[] = [
  { who: 0, kind: "open", detail: "opened in Gmail" },
  { who: 1, kind: "open", detail: "opened for the 2nd time" },
  { who: 2, kind: "prefetch", detail: "Apple Mail prefetch, not counted" },
  { who: 0, kind: "click", detail: "clicked Speaker brief" },
  { who: 3, kind: "open", detail: "opened on Outlook mobile" },
  { who: 5, kind: "open", detail: "opened for the 3rd time" },
  { who: 4, kind: "click", detail: "clicked Sponsor deck" },
  { who: 6, kind: "open", detail: "opened in Gmail" },
];

const STEP_MS = 2200;
const FEED_SIZE = 4;

interface FeedItem extends ScriptEvent {
  id: number;
  time: string;
}

function clock(step: number) {
  const minutes = 9 * 60 + 41 + step * 3;
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

const toFeedItem = (step: number): FeedItem => ({
  ...SCRIPT[step % SCRIPT.length],
  id: step,
  time: clock(step),
});

const KIND_STYLE: Record<Kind, { dot: string; text: string }> = {
  open: { dot: "bg-glow shadow-[0_0_12px_var(--glow)]", text: "text-glow" },
  click: { dot: "bg-dusk shadow-[0_0_12px_var(--dusk)]", text: "text-dusk" },
  prefetch: { dot: "border border-warn/80 bg-transparent", text: "text-warn" },
};

export function RippleRadar() {
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState(FEED_SIZE - 1);

  useEffect(() => {
    const id = setInterval(() => setStep((s) => s + 1), STEP_MS);
    return () => clearInterval(id);
  }, []);

  const feed: FeedItem[] = [];
  for (let s = step; s >= Math.max(0, step - FEED_SIZE + 1); s--) feed.push(toFeedItem(s));

  // Latest state per recipient, from everything played so far in this loop.
  const lit = new Map<number, Kind>();
  const loopStart = step - (step % SCRIPT.length);
  for (let s = loopStart; s <= step; s++) {
    const e = SCRIPT[s % SCRIPT.length];
    if (lit.get(e.who) !== "click") lit.set(e.who, e.kind);
  }
  const current = SCRIPT[step % SCRIPT.length];

  return (
    <div className="relative mx-auto w-full max-w-[560px]">
      <div
        className="relative aspect-square w-full"
        role="img"
        aria-label="Animated radar: rings spread from a sent email and recipients light up as they open it."
      >
        {/* Water glow */}
        <div className="absolute inset-[8%] rounded-full bg-[radial-gradient(closest-side,rgb(124_243_224/0.16),rgb(139_124_255/0.07)_55%,transparent)] blur-2xl" />

        {/* Static depth rings */}
        {[0.25, 0.5, 0.75, 1].map((r) => (
          <div
            key={r}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-line"
            style={{ width: `${r * 100}%`, height: `${r * 100}%` }}
          />
        ))}

        {/* Expanding ripples */}
        {[0, 1.6, 3.2].map((delay, i) => (
          <div
            key={delay}
            className="ripple-ring"
            style={{ animationDelay: `${delay}s`, ["--static-scale" as string]: 0.35 + i * 0.25 }}
          />
        ))}

        {/* The sent email */}
        <div className="absolute left-1/2 top-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-2xl border border-glow/40 bg-ink-raised shadow-[0_0_40px_rgb(124_243_224/0.35)]">
          <Mail className="size-6 text-glow" strokeWidth={1.75} />
        </div>

        {RECIPIENTS.map((r, i) => {
          const rad = (r.angle * Math.PI) / 180;
          const x = 50 + Math.cos(rad) * r.radius * 50;
          const y = 50 + Math.sin(rad) * r.radius * 50;
          const kind = lit.get(i);
          const isCurrent = current.who === i;
          return (
            <div
              key={r.name}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              <div className="relative flex flex-col items-center gap-1.5">
                <span className="relative block size-2.5">
                  {isCurrent && kind !== "prefetch" && (
                    <span key={step} className="ping" aria-hidden />
                  )}
                  <span
                    className={cn(
                      "absolute inset-0 rounded-full transition-[background-color,box-shadow,border-color] duration-500",
                      kind ? KIND_STYLE[kind].dot : "bg-faint/60",
                    )}
                  />
                </span>
                <span
                  className={cn(
                    "whitespace-nowrap text-[11px] leading-none transition-colors duration-500 sm:text-xs",
                    kind ? "text-text" : "text-faint",
                  )}
                >
                  {r.name}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Live feed */}
      <div
        className="relative -mt-[14%] ml-auto w-full max-w-[380px] overflow-hidden rounded-2xl border border-line-strong bg-ink-raised/80 p-1.5 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.8)] backdrop-blur-md"
        aria-live="off"
      >
        {/* Fixed height: a growing feed would re-center the headline beside it. */}
        <ul className="flex h-[168px] flex-col">
          <AnimatePresence initial={false} mode="popLayout">
            {feed.map((item) => {
              const r = RECIPIENTS[item.who];
              return (
                <motion.li
                  key={item.id}
                  layout={!reduceMotion}
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, transform: "translateY(-10px)" }}
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                  transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 first:bg-white/[0.03]"
                >
                  <span className={cn("size-2 shrink-0 rounded-full", KIND_STYLE[item.kind].dot)} />
                  <p className="min-w-0 flex-1 truncate text-[13px] text-muted">
                    <span className="font-medium text-text">{r.name}</span>{" "}
                    <span className="text-faint">({r.role})</span> {item.detail}
                  </p>
                  <span className="tabular shrink-0 text-xs text-faint">{item.time}</span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      </div>
    </div>
  );
}
