import { Check, CheckCheck } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SENT = [
  { to: "Arjun Mehta", subject: "Partnering with E-Summit '26", status: "Opened 2 times", seen: true },
  { to: "Sana Qureshi", subject: "Sponsor deck and tiers", status: "Clicked deck", seen: true },
  { to: "Kabir Rao", subject: "Keynote slot on Day 2", status: "Opened 30 min ago", seen: true },
  { to: "Leah Thomas", subject: "Mentor session invite", status: "Not opened yet", seen: false },
];

export function Extension() {
  return (
    <section id="extension" className="scroll-mt-16 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-14 px-4 py-24 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div className="order-2 overflow-hidden rounded-3xl border border-line-strong bg-surface lg:order-1">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <p className="text-sm font-medium">Sent</p>
            <span className="inline-flex items-center gap-2 rounded-full border border-glow/30 bg-glow/10 py-1 pr-3 pl-1.5 text-xs text-glow">
              <LogoMark className="size-4" />
              Tracking on
            </span>
          </div>
          <ul>
            {SENT.map((m) => (
              <li
                key={m.to}
                className="flex items-center gap-4 border-b border-line px-5 py-3.5 last:border-0"
              >
                <p className="w-28 shrink-0 truncate text-sm font-medium sm:w-32">{m.to}</p>
                <p className="min-w-0 flex-1 truncate text-sm text-muted">{m.subject}</p>
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 text-xs",
                    m.seen ? "text-glow" : "text-faint",
                  )}
                >
                  {m.seen ? <CheckCheck className="size-4" /> : <Check className="size-4" />}
                  <span className="hidden sm:inline">{m.status}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="order-1 max-w-md lg:order-2">
          <h2 className="text-4xl leading-[1.05] font-semibold tracking-[-0.035em] sm:text-5xl">
            Or track right inside Gmail.
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-muted">
            The Chrome extension adds a tracking switch to Gmail compose and read ticks to your Sent
            folder. Your own views never count as opens.
          </p>
          <div className="mt-8">
            <ButtonLink href="/login" size="lg" variant="secondary">
              Join the extension beta
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}
