import { Plus, Send } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/campaigns/status-badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageBody, PageHeader } from "@/components/dashboard/page-header";
import { ButtonLink } from "@/components/ui/button";
import { campaignStats } from "@/lib/campaign-data";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Campaigns" };

const dateFmt = new Intl.DateTimeFormat("en", { day: "numeric", month: "short" });
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "–");

export default async function CampaignsPage() {
  const { workspace } = await requireWorkspace();
  const campaigns = await db.campaign.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, tag: true, status: true, createdAt: true, scheduledAt: true },
  });
  const stats = await campaignStats(campaigns.map((c) => c.id));

  const newButton = (
    <ButtonLink href="/dashboard/campaigns/new">
      <Plus className="size-4" />
      New campaign
    </ButtonLink>
  );

  return (
    <PageBody>
      <PageHeader
        title="Campaigns"
        description="Personal emails to a whole list, sent from your Gmail."
        actions={campaigns.length > 0 && newButton}
      />

      {campaigns.length === 0 ? (
        <EmptyState
          icon={Send}
          title="No campaigns yet"
          body="Upload a CSV of speakers or sponsors, write one email with merge fields, and Ripple sends each person their own copy at a safe pace."
          action={newButton}
        />
      ) : (
        <div className="mt-8 overflow-x-auto rounded-2xl border border-line-strong">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-faint">
                <th className="px-5 py-3 font-normal">Campaign</th>
                <th className="px-3 py-3 font-normal">Status</th>
                <th className="px-3 py-3 text-right font-normal">Sent</th>
                <th className="px-3 py-3 text-right font-normal">Opened</th>
                <th className="px-3 py-3 text-right font-normal">Clicked</th>
                <th className="px-5 py-3 text-right font-normal">Created</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const s = stats.get(c.id)!;
                return (
                  <tr key={c.id} className="border-b border-line transition-colors duration-150 last:border-0 hover:bg-white/[0.02]">
                    <td className="px-5 py-3.5">
                      <Link href={`/dashboard/campaigns/${c.id}`} className="font-medium hover:text-glow">
                        {c.name}
                      </Link>
                      {c.tag && <span className="ml-2 text-faint">{c.tag}</span>}
                    </td>
                    <td className="px-3 py-3.5">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="tabular px-3 py-3.5 text-right">
                      {s.sent}
                      <span className="text-faint"> / {s.total}</span>
                    </td>
                    <td className="tabular px-3 py-3.5 text-right">{pct(s.opened, s.sent)}</td>
                    <td className="tabular px-3 py-3.5 text-right">{pct(s.clicked, s.sent)}</td>
                    <td className="tabular px-5 py-3.5 text-right text-muted">{dateFmt.format(c.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PageBody>
  );
}
