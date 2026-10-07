import { cn } from "@/lib/utils";

/** A dot with two widening arcs: a message sent, and the ripples it makes. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden className={cn("size-7", className)}>
      <circle cx="9" cy="16" r="3.5" fill="var(--glow)" />
      <path d="M15 8.5a10.5 10.5 0 0 1 0 15" stroke="var(--glow)" strokeWidth="2.4" strokeLinecap="round" />
      <path
        d="M21 4a16 16 0 0 1 0 24"
        stroke="var(--glow)"
        strokeOpacity="0.45"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="text-[1.35rem] font-semibold tracking-[-0.03em] text-text">ripple</span>
    </span>
  );
}
