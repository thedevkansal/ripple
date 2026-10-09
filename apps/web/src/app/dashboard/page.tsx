import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ActivityChart } from "@/components/analytics/activity-chart";
import { ClientBars } from "@/components/analytics/client-bars";
import { FollowUpLists } from "@/components/analytics/follow-up-lists";
import { OpenHeatmap } from "@/components/analytics/open-heatmap";
import { StatusBadge } from "@/components/campaigns/status-badge";
import { PageBody, PageHeader } from "@/components/dashboard/page-header";
import { SetupChecklist } from "@/components/dashboard/setup-checklist";
import { LiveRefresh } from "@/components/ui/live-refresh";
import {
  clientBreakdown,
  dailyActivity,
  followUps,
  openHeatmap,
  parseRange,
  RANGES,
  type RangeKey,
  totals,
  type Totals,
  viewerTimeZone,
  windowFor,
} from "@/lib/analytics";
import { campaignStats } from "@/lib/campaign-data";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Overview" };

const RANGE_LABELS: Record<RangeKey, string> = { "7": "7 days", "30": "30 days", "90": "90 days", all: "All time" };

const rate = (n: number, d: number) => (d ? n / d : null);
const asPct = (r: number | null) => (r === null ? "–" : `${Math.round(r * 100)}%`);

export default async function OverviewPage({ searchParams }: PageProps<"/dashboard">) {
  const { user, workspace } = await requireWorkspace();
  const range = parseRange((await searchParams).range);
  const win = windowFor(range);
  const tz = await viewerTimeZone();

  const [gmailCount, memberCount, cur, prev, days, heat, clients, lists, campaigns] = await Promise.all([
    db.gmailAccount.count({ where: { userId: user.id } }),
    db.member.count({ where: { workspaceId: workspace.id } }),
    totals(workspace.id, win.from, win.to),
    win.previous ? totals(workspace.id, win.previous.from, win.previous.to) : Promise.resolve(null),
    dailyActivity(workspace.id, win.from, win.to, tz),
    openHeatmap(workspace.id, win.from, win.to, tz),
    clientBreakdown(workspace.id, win.from, win.to),
    followUps(workspace.id, win.from, win.to),
    db.campaign.findMany({
      where: { workspaceId: workspace.id, messages: { some: { sentAt: { gte: win.from, lt: win.to } } } },
      orderBy: { startedAt: "desc" },
      take: 8,
      select: { id: true, name: true, status: true },
    }),
  ]);
  const stats = await campaignStats(campaigns.map((c) => c.id));
  const everSent = await db.message.count({ where: { workspaceId: workspace.id, status: "SENT" }, take: 1 });

  const steps = [
    {
      done: gmailCount > 0,
      title: "Connect Gmail",
      body: "Ripple sends from your own address, so replies come straight back to you.",
      href: "/dashboard/settings#gmail",
      cta: "Connect Gmail",
    },
    {
      done: memberCount > 1,
      title: "Invite your team",
      body: "Teammates connect their own Gmail. Everyone’s outreach shows up here.",
      href: "/dashboard/settings#team",
      cta: "Create invite link",
    },
    {
      done: everSent > 0,
      title: "Send your first campaign",
      body: "Upload a list, write once with merge fields, and watch the opens come in.",
      href: "/dashboard/campaigns/new",
      cta: "New campaign",
    },
  ];
  const periodLabel = range === "all" ? "" : `vs previous ${RANGE_LABELS[range]}`;

  return (
    <PageBody>
      <LiveRefresh seconds={60} />
      <PageHeader title={`Hi, ${user.name?.split(" ")[0] ?? "there"}`} description={`You’re in ${workspace.name}.`} />
      <SetupChecklist steps={steps} />

      {/* One filter row; it scopes everything below. */}
      <nav aria-label="Date range" className="mt-8 flex flex-wrap items-center gap-1.5">
        {(Object.keys(RANGES) as RangeKey[]).map((k) => (
          <Link
            key={k}
            href={k === "30" ? "/dashboard" : `/dashboard?range=${k}`}
            aria-current={range === k ? "true" : undefined}
            className={cn(
              "press rounded-full border px-3 py-1 text-sm",
              range === k ? "border-glow/40 bg-glow/10 text-glow" : "border-line-strong text-muted hover:text-text",
            )}
          >
            {RANGE_LABELS[k]}
          </Link>
        ))}
        <span className="ml-auto text-xs text-faint">Times in {tz.replace(/_/g, " ")}</span>
      </nav>

      <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Emails sent" value={cur.sent.toLocaleString()} delta={countDelta(cur, prev)} period={periodLabel} />
        <StatTile
          label="Open rate"
          value={asPct(rate(cur.opened, cur.sent))}
          sub={`${cur.opened} people`}
          delta={pointDelta(cur, prev, "opened")}
          period={periodLabel}
        />
        <StatTile
          label="Click rate"
          value={asPct(rate(cur.clicked, cur.sent))}
          sub={`${cur.clicked} people`}
          delta={pointDelta(cur, prev, "clicked")}
          period={periodLabel}
        />
        <StatTile
          label="Opened files"
          value={asPct(rate(cur.openedFiles, cur.sent))}
          sub={`${cur.openedFiles} people`}
          delta={pointDelta(cur, prev, "openedFiles")}
          period={periodLabel}
        />
      </section>

      <Card title="Activity" className="mt-4">
        <ActivityChart points={days} />
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card title="Best time to send" subtitle="When people actually open, by weekday and hour">
          <OpenHeatmap grid={heat} />
        </Card>
        <Card title="Mail clients" subtitle="Where real opens happened">
          <ClientBars rows={clients} />
        </Card>
      </div>

      <Card title="Follow up" subtitle="People from emails sent in this period" className="mt-4">
        <FollowUpLists lists={lists} />
      </Card>

      <Card title="Campaigns" subtitle="Sent in this period" className="mt-4">
        {campaigns.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No campaigns sent in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-faint">
                  <th className="pb-2 font-normal">Campaign</th>
                  <th className="pb-2 font-normal">Status</th>
                  <th className="pb-2 text-right font-normal">Sent</th>
                  <th className="w-40 pb-2 font-normal">Open rate</th>
                  <th className="pb-2 text-right font-normal">Click rate</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const s = stats.get(c.id)!;
                  const open = rate(s.opened, s.sent);
                  return (
                    <tr key={c.id} className="border-t border-line">
                      <td className="max-w-[220px] py-2.5 pr-3">
                        <Link href={`/dashboard/campaigns/${c.id}`} className="block truncate font-medium hover:text-glow">
                          {c.name}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-3">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="tabular py-2.5 pr-3 text-right">{s.sent}</td>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-white/5">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${(open ?? 0) * 100}%`, background: "var(--chart-opens)" }}
                            />
                          </div>
                          <span className="tabular w-10 text-right">{asPct(open)}</span>
                        </div>
                      </td>
                      <td className="tabular py-2.5 text-right">{asPct(rate(s.clicked, s.sent))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageBody>
  );
}

type Delta = { text: string; up: boolean } | null;

/** Change in a rate, in percentage points, against the previous period. */
function pointDelta(cur: Totals, prev: Totals | null, key: "opened" | "clicked" | "openedFiles"): Delta {
  const a = rate(cur[key], cur.sent);
  const b = prev ? rate(prev[key], prev.sent) : null;
  if (a === null || b === null) return null;
  const pts = Math.round((a - b) * 100);
  if (pts === 0) return { text: "no change", up: true };
  return { text: `${pts > 0 ? "+" : ""}${pts} pts`, up: pts > 0 };
}

function countDelta(cur: Totals, prev: Totals | null): Delta {
  if (!prev || prev.sent === 0) return null;
  const diff = cur.sent - prev.sent;
  if (diff === 0) return { text: "no change", up: true };
  return { text: `${diff > 0 ? "+" : ""}${diff.toLocaleString()}`, up: diff > 0 };
}

function StatTile({
  label,
  value,
  sub,
  delta,
  period,
}: {
  label: string;
  value: string;
  sub?: string;
  delta: Delta;
  period: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-5 py-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-[-0.03em]">{value}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-faint">
        {sub && <span>{sub}</span>}
        {delta && (
          <span className="inline-flex items-center gap-0.5" title={period}>
            {delta.up ? (
              <ArrowUpRight className="size-3.5 text-glow" aria-hidden />
            ) : (
              <ArrowDownRight className="size-3.5 text-warn" aria-hidden />
            )}
            <span className="text-muted">{delta.text}</span>
          </span>
        )}
      </p>
    </div>
  );
}

function Card({
  title,
  subtitle,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("rounded-2xl border border-line-strong bg-surface p-5", className)}>
      <div className="mb-4">
        <h2 className="font-medium">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}
