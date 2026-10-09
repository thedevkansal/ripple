import { cn } from "@/lib/utils";

const TIMELINE = [
  { kind: "sent", when: "Mon 10:02", what: "Invite sent", meta: "Speaking at E-Summit '26?" },
  { kind: "open", when: "Mon 12:14", what: "Opened", meta: "Gmail, desktop", gap: "2h 12m after send" },
  { kind: "open", when: "Tue 09:20", what: "Opened again", meta: "Gmail, phone", gap: "+21h" },
  { kind: "click", when: "Tue 09:22", what: "Clicked Speaker brief", meta: "esummit.in/brief", gap: "+2m" },
  { kind: "open", when: "Thu 18:47", what: "Opened again", meta: "Gmail, desktop", gap: "+2d 9h" },
] as const;

const STATS = [
  { label: "Opens", value: "3" },
  { label: "Clicks", value: "1" },
  { label: "First open", value: "2h 12m" },
  { label: "Engagement", value: "50" },
];

export function Story() {
  return (
    <section className="border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-14 px-4 py-24 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div className="max-w-md">
          <h2 className="text-4xl leading-[1.05] font-semibold tracking-[-0.035em] sm:text-5xl">
            Three opens and a click is a yes, waiting.
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-muted">
            Ripple shows every open with the time since the last one. You see interest build, and you
            follow up while you are still on their mind, not a week later.
          </p>
        </div>

        <div className="rounded-3xl border border-line-strong bg-surface p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-full bg-[linear-gradient(135deg,var(--glow),var(--dusk))] text-sm font-semibold text-ink">
                PS
              </span>
              <div>
                <p className="font-medium">Priya Sharma</p>
                <p className="text-sm text-muted">Head of Product, Speaker list</p>
              </div>
            </div>
            <span className="rounded-full border border-glow/30 bg-glow/10 px-3 py-1 text-xs text-glow">
              Follow up now
            </span>
          </div>

          <dl className="mt-6 grid grid-cols-4 gap-2 rounded-2xl bg-ink-sunken/70 p-1">
            {STATS.map((s) => (
              <div key={s.label} className="rounded-xl px-2 py-3 text-center sm:px-3">
                <dt className="text-[11px] text-faint sm:text-xs">{s.label}</dt>
                <dd className="tabular mt-1 text-lg font-semibold sm:text-xl">{s.value}</dd>
              </div>
            ))}
          </dl>

          <ol className="relative mt-6 ml-1.5 border-l border-line-strong">
            {TIMELINE.map((t, i) => (
              <li key={i} className="relative pb-5 pl-6 last:pb-0">
                <span
                  className={cn(
                    "absolute top-1.5 -left-[5px] size-2.5 rounded-full ring-4 ring-ink-raised",
                    t.kind === "sent" && "bg-faint",
                    t.kind === "open" && "bg-glow",
                    t.kind === "click" && "bg-dusk",
                  )}
                />
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                  <p className="text-[15px]">
                    <span className="font-medium">{t.what}</span>{" "}
                    <span className="text-muted">{t.meta}</span>
                  </p>
                  <p className="tabular text-sm text-faint">
                    {"gap" in t && <span className="mr-2 text-muted">{t.gap}</span>}
                    {t.when}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
