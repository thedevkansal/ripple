import { cn } from "@/lib/utils";

const EVENTS = [
  {
    tone: "glow",
    label: "Real open",
    detail: "Gmail on desktop, 2 hours after you sent it",
    counted: true,
  },
  {
    tone: "warn",
    label: "Apple prefetch",
    detail: "Apple Mail loaded the images 4 seconds after delivery. Nobody read it yet.",
    counted: false,
  },
  {
    tone: "faint",
    label: "Link scanner",
    detail: "A corporate security filter clicked every link before the inbox did.",
    counted: false,
  },
] as const;

const TONE = {
  glow: "bg-glow shadow-[0_0_12px_var(--glow)]",
  warn: "border border-warn bg-transparent",
  faint: "bg-faint",
};

export function Honest() {
  return (
    <section id="honest" className="scroll-mt-16 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-14 px-4 py-24 sm:px-6 lg:grid-cols-2 lg:items-center">
        <div className="max-w-md">
          <h2 className="text-4xl leading-[1.05] font-semibold tracking-[-0.035em] sm:text-5xl">
            Not every open is a person.
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-muted">
            Apple Mail loads images before anyone reads. Security filters click every link. Most
            trackers count all of it and call it engagement. Ripple labels each event, so your open
            rate means something.
          </p>
        </div>

        <div>
          <ul className="flex flex-col gap-2">
            {EVENTS.map((e) => (
              <li
                key={e.label}
                className="flex items-start gap-4 rounded-2xl border border-line bg-surface px-5 py-4"
              >
                <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", TONE[e.tone])} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{e.label}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted">{e.detail}</p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-0.5 text-xs",
                    e.counted ? "bg-glow/10 text-glow" : "bg-white/5 text-faint",
                  )}
                >
                  {e.counted ? "Counted" : "Ignored"}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-6 grid grid-cols-2 gap-6 px-1">
            <RateBar label="Raw open rate" value={64} muted />
            <RateBar label="Real open rate" value={41} />
          </div>
          <p className="mt-4 px-1 text-xs text-faint">Example campaign of 120 sponsor invites.</p>
        </div>
      </div>
    </section>
  );
}

function RateBar({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div>
      <p className="text-sm text-muted">{label}</p>
      <p className={cn("tabular mt-1 text-3xl font-semibold tracking-[-0.03em]", muted && "text-faint line-through decoration-1")}>
        {value}%
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5">
        <div
          className={cn("h-full rounded-full", muted ? "bg-faint/50" : "bg-glow")}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
