import "server-only";
import type { SenderAccount } from "@/components/campaigns/campaign-editor";
import { db } from "@/lib/db";
import { sentInLastDay } from "@/lib/queue";

export async function senderAccounts(userId: string): Promise<SenderAccount[]> {
  const accounts = await db.gmailAccount.findMany({
    where: { userId },
    select: { id: true, email: true, needsReconnect: true, dailyLimit: true },
    orderBy: { createdAt: "asc" },
  });
  return Promise.all(
    accounts.map(async (a) => ({
      ...a,
      remainingToday: Math.max(0, a.dailyLimit - (await sentInLastDay(a.id))),
    })),
  );
}

export interface CampaignStats {
  total: number;
  queued: number;
  sent: number;
  failed: number;
  cancelled: number;
  opened: number;
  clicked: number;
}

/** Per-campaign delivery and engagement counts. Opens and clicks count real (non-prefetch, non-bot) events. */
export async function campaignStats(campaignIds: string[]): Promise<Map<string, CampaignStats>> {
  const stats = new Map<string, CampaignStats>(
    campaignIds.map((id) => [
      id,
      { total: 0, queued: 0, sent: 0, failed: 0, cancelled: 0, opened: 0, clicked: 0 },
    ]),
  );
  if (!campaignIds.length) return stats;

  const [byStatus, engaged] = await Promise.all([
    db.message.groupBy({
      by: ["campaignId", "status"],
      where: { campaignId: { in: campaignIds } },
      _count: { _all: true },
    }),
    db.$queryRaw<{ campaignId: string; opened: bigint; clicked: bigint }[]>`
      SELECT m."campaignId",
        count(DISTINCT e."messageId") FILTER (WHERE e.type = 'OPEN') AS opened,
        count(DISTINCT e."messageId") FILTER (WHERE e.type = 'CLICK') AS clicked
      FROM "Event" e JOIN "Message" m ON m.id = e."messageId"
      WHERE m."campaignId" = ANY(${campaignIds}) AND NOT e."isPrefetch" AND NOT e."isBot"
      GROUP BY m."campaignId"`,
  ]);

  for (const row of byStatus) {
    const s = stats.get(row.campaignId!);
    if (!s) continue;
    const n = row._count._all;
    s.total += n;
    if (row.status === "QUEUED" || row.status === "SENDING") s.queued += n;
    else if (row.status === "SENT") s.sent += n;
    else if (row.status === "FAILED") s.failed += n;
    else if (row.status === "CANCELLED") s.cancelled += n;
  }
  for (const row of engaged) {
    const s = stats.get(row.campaignId);
    if (!s) continue;
    s.opened = Number(row.opened);
    s.clicked = Number(row.clicked);
  }
  return stats;
}

export async function listTemplates(workspaceId: string) {
  return db.template.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, subject: true, body: true },
  });
}

/** Workspace totals: emails sent, and how many of them got a real open or click. */
export async function workspaceStats(workspaceId: string) {
  const [row] = await db.$queryRaw<{ sent: bigint; opened: bigint; clicked: bigint }[]>`
    SELECT
      (SELECT count(*) FROM "Message" WHERE "workspaceId" = ${workspaceId} AND status = 'SENT') AS sent,
      count(DISTINCT e."messageId") FILTER (WHERE e.type = 'OPEN') AS opened,
      count(DISTINCT e."messageId") FILTER (WHERE e.type = 'CLICK') AS clicked
    FROM "Event" e JOIN "Message" m ON m.id = e."messageId"
    WHERE m."workspaceId" = ${workspaceId} AND NOT e."isPrefetch" AND NOT e."isBot"`;
  return { sent: Number(row.sent), opened: Number(row.opened), clicked: Number(row.clicked) };
}
