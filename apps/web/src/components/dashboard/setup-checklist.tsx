import { Check } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface SetupStep {
  done: boolean;
  title: string;
  body: string;
  href: string;
  cta: string;
}

/** Shown until every step is done, then disappears. */
export function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  const firstOpen = steps.findIndex((s) => !s.done);
  if (firstOpen === -1) return null;

  return (
    <section className="mt-8 rounded-3xl border border-line-strong bg-surface p-2">
      <h2 className="px-4 pt-4 pb-2 text-sm text-muted">Get set up</h2>
      <ol>
        {steps.map((s, i) => (
          <li
            key={s.title}
            className={cn("flex flex-wrap items-center gap-4 rounded-2xl px-4 py-4", i === firstOpen && "bg-white/[0.03]")}
          >
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full border text-xs tabular",
                s.done ? "border-glow/40 bg-glow/15 text-glow" : "border-line-strong text-faint",
              )}
            >
              {s.done ? <Check className="size-3.5" /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("font-medium", s.done && "text-muted line-through decoration-faint")}>{s.title}</p>
              <p className="mt-0.5 text-sm text-muted">{s.body}</p>
            </div>
            {!s.done && (
              <Link
                href={s.href}
                className={cn(
                  "press rounded-full px-4 py-2 text-sm",
                  i === firstOpen ? "bg-glow font-semibold text-ink" : "border border-line-strong text-text hover:bg-white/5",
                )}
              >
                {s.cta}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
