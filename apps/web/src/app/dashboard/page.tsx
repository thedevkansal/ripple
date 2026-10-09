import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageBody, PageHeader } from "@/components/dashboard/page-header";
import { LiveRefresh } from "@/components/ui/live-refresh";
import { workspaceStats } from "@/lib/campaign-data";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage() {
  const { user, workspace } = await requireWorkspace();
  const [gmailCount, memberCount, totals] = await Promise.all([
    db.gmailAccount.count({ where: { userId: user.id } }),
    db.member.count({ where: { workspaceId: workspace.id } }),
    workspaceStats(workspace.id),
  ]);
  const messageCount = totals.sent;
  const pct = (n: number) => (totals.sent ? `${Math.round((n / totals.sent) * 100)}%` : "–");

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
      body: "Teammates connect their own Gmail. Everyone's outreach shows up here.",
      href: "/dashboard/settings#team",
      cta: "Create invite link",
    },
    {
      done: messageCount > 0,
      title: "Send your first campaign",
      body: "Upload a list, write once with merge fields, and watch the opens come in.",
      href: "/dashboard/campaigns",
      cta: "New campaign",
    },
  ];
  const firstOpen = steps.findIndex((s) => !s.done);

  return (
    <PageBody>
      <LiveRefresh seconds={30} />
      <PageHeader
        title={`Hi, ${user.name?.split(" ")[0] ?? "there"}`}
        description={`You're in ${workspace.name}.`}
      />

      {firstOpen !== -1 && (
        <section className="mt-10 rounded-3xl border border-line-strong bg-ink-raised/50 p-2">
          <h2 className="px-4 pt-4 pb-2 text-sm text-muted">Get set up</h2>
          <ol>
            {steps.map((s, i) => (
              <li
                key={s.title}
                className={cn(
                  "flex flex-wrap items-center gap-4 rounded-2xl px-4 py-4",
                  i === firstOpen && "bg-white/[0.03]",
                )}
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
                  <p className={cn("font-medium", s.done && "text-muted line-through decoration-faint")}>
                    {s.title}
                  </p>
                  <p className="mt-0.5 text-sm text-muted">{s.body}</p>
                </div>
                {!s.done && (
                  <Link
                    href={s.href}
                    className={cn(
                      "press rounded-full px-4 py-2 text-sm",
                      i === firstOpen
                        ? "bg-glow font-semibold text-ink"
                        : "border border-line-strong text-text hover:bg-white/5",
                    )}
                  >
                    {s.cta}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Emails sent", value: totals.sent },
          { label: "Opened", value: totals.opened },
          { label: "Open rate", value: pct(totals.opened) },
          { label: "Click rate", value: pct(totals.clicked) },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-line bg-ink-raised/40 px-5 py-4">
            <p className="text-sm text-muted">{s.label}</p>
            <p className="tabular mt-2 text-3xl font-semibold tracking-[-0.03em]">{s.value}</p>
          </div>
        ))}
      </section>
    </PageBody>
  );
}
