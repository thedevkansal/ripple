import type { CampaignStatus } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";

const STYLES: Record<CampaignStatus, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "border-line-strong text-muted" },
  SCHEDULED: { label: "Scheduled", className: "border-dusk/30 bg-dusk/10 text-dusk" },
  SENDING: { label: "Sending", className: "border-glow/30 bg-glow/10 text-glow" },
  PAUSED: { label: "Paused", className: "border-warn/30 bg-warn/10 text-warn" },
  SENT: { label: "Sent", className: "border-line-strong bg-white/5 text-text" },
};

export function StatusBadge({ status }: { status: CampaignStatus }) {
  const s = STYLES[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs", s.className)}>
      {status === "SENDING" && <span className="size-1.5 animate-pulse rounded-full bg-glow" />}
      {s.label}
    </span>
  );
}
