import { viewerTimeZone } from "@/lib/analytics";
import { campaignReport } from "@/lib/campaign-report";
import { toCsv } from "@/lib/csv-export";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/workspace";

/** Per-recipient results as CSV, times in the viewer's timezone. */
export async function GET(_request: Request, ctx: RouteContext<"/dashboard/campaigns/[id]/export">) {
  const { id } = await ctx.params;
  const { workspace } = await requireWorkspace();
  const campaign = await db.campaign.findFirst({
    where: { id, workspaceId: workspace.id },
    select: { name: true },
  });
  if (!campaign) return new Response("Not found", { status: 404 });

  const [{ rows }, tz] = await Promise.all([campaignReport(id), viewerTimeZone()]);
  // "sv-SE" formats as YYYY-MM-DD HH:mm, which spreadsheets parse as a date.
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const t = (iso: string | null) => (iso ? fmt.format(new Date(iso)) : "");

  const csv = toCsv([
    [
      "Name",
      "Email",
      "Company",
      "CC",
      "Status",
      `Sent (${tz})`,
      "Opens",
      "Clicks",
      "File opens",
      "First open",
      "Last open",
      "Only automatic loads",
    ],
    ...rows.map((r) => [
      r.name,
      r.email,
      r.org,
      r.cc.join("; "),
      r.status.toLowerCase(),
      t(r.sentAt),
      r.opens,
      r.clicks,
      r.fileOpens,
      t(r.firstOpenAt),
      t(r.lastOpenAt),
      r.onlyPrefetched ? "yes" : "",
    ]),
  ]);

  const slug = campaign.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "campaign";
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ripple-${slug}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
