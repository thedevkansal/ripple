"use client";

import { Pause, Play, Square } from "lucide-react";
import { useTransition } from "react";
import { setCampaignPaused, stopCampaign } from "@/app/dashboard/campaigns/actions";
import { Button } from "@/components/ui/button";
import type { CampaignStatus } from "@/generated/prisma/client";

export function CampaignControls({ id, status, queued }: { id: string; status: CampaignStatus; queued: number }) {
  const [pending, start] = useTransition();
  if (status === "DRAFT" || status === "SENT") return null;

  return (
    <div className="flex items-center gap-2">
      {status === "PAUSED" ? (
        <Button size="sm" disabled={pending} onClick={() => start(() => setCampaignPaused(id, false))}>
          <Play className="size-3.5" />
          Resume
        </Button>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => start(() => setCampaignPaused(id, true))}
        >
          <Pause className="size-3.5" />
          Pause
        </Button>
      )}
      <Button
        size="sm"
        variant="danger"
        disabled={pending}
        onClick={() => {
          if (confirm(`Stop this campaign? The ${queued} unsent email${queued === 1 ? "" : "s"} will be cancelled.`))
            start(() => stopCampaign(id));
        }}
      >
        <Square className="size-3.5" />
        Stop
      </Button>
    </div>
  );
}
