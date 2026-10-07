import { summarize } from "@ripple/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CampaignControls } from "@/components/campaigns/campaign-controls";
import { CampaignEditor } from "@/components/campaigns/campaign-editor";
import { StatusBadge } from "@/components/campaigns/status-badge";
import { PageBody, PageHeader } from "@/components/dashboard/page-header";
import type { MessageStatus } from "@/generated/prisma/client";
import { campaignStats, contactTagCounts, senderAccounts } from "@/lib/campaign-data";
import { db } from "@/lib/db";
import { sentInLastDay } from "@/lib/queue";
import { cn } from "@/lib/utils";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Campaign" };

const timeFmt = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

export default async function CampaignPage({ params }: PageProps<"/dashboard/campaigns/[id]">) {
  const { id } = await params;
  const { user, workspace } = await requireWorkspace();
  const campaign = await db.campaign.findFirst({
    where: { id, workspaceId: workspace.id },
    include: { gmailAccount: { select: { id: true, email: true, dailyLimit: true, needsReconnect: true } } },
  });
  if (!campaign) notFound();

  if (campaign.status === "DRAFT") {
    const [accounts, tags, attachments, messages] = await Promise.all([
      senderAccounts(user.id),
      contactTagCounts(workspace.id),
      db.attachment.findMany({
        where: { campaignId: id },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, size: true, contentType: true, url: true },
      }),
      db.message.findMany({
        where: { campaignId: id },
        orderBy: { createdAt: "asc" },
        select: { toEmail: true, contact: { select: { name: true, org: true, tags: true, fields: true } } },
      }),
    ]);
    return (
      <PageBody>
        <PageHeader
          title={campaign.name}
          description={
            <>
              <StatusBadge status="DRAFT" />
              <span className="ml-3">
                <Link href="/dashboard/campaigns" className="hover:text-text">
                  All campaigns
                </Link>
              </span>
            </>
          }
        />
        <div className="mt-8">
          <CampaignEditor
            initial={{
              id: campaign.id,
              name: campaign.name,
              tag: campaign.tag ?? "",
              gmailAccountId: campaign.gmailAccountId ?? "",
              subject: campaign.subject,
              body: campaign.body,
              trackClicks: campaign.trackClicks,
              linkAttachments: campaign.linkAttachments,
            }}
            initialRecipients={messages.map((m) => ({
              email: m.toEmail,
              name: m.contact?.name ?? undefined,
              org: m.contact?.org ?? undefined,
              tags: m.contact?.tags,
              fields: (m.contact?.fields as Record<string, string> | null) ?? undefined,
            }))}
            initialAttachments={attachments}
            workspaceId={workspace.id}
            accounts={accounts}
            tags={tags}
            senderName={user.name ?? ""}
          />
        </div>
      </PageBody>
    );
  }

  const [statsMap, messages, sentToday, files] = await Promise.all([
    campaignStats([id]),
    db.message.findMany({
      where: { campaignId: id },
      orderBy: [{ sentAt: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
      select: {
        id: true,
        toEmail: true,
        status: true,
        sentAt: true,
        error: true,
        contact: { select: { name: true, org: true } },
        events: {
          select: { type: true, at: true, isPrefetch: true, isBot: true, link: { select: { url: true } } },
        },
      },
    }),
    campaign.gmailAccount ? sentInLastDay(campaign.gmailAccount.id) : Promise.resolve(0),
    db.attachment.findMany({ where: { campaignId: id }, select: { url: true } }),
  ]);
  const fileUrls = new Set(files.map((f) => f.url));
  const hasFiles = campaign.linkAttachments && fileUrls.size > 0;
  const s = statsMap.get(id)!;
  const account = campaign.gmailAccount;
  const quotaReached = account && sentToday >= account.dailyLimit && s.queued > 0;
  const progress = s.total ? ((s.sent + s.failed + s.cancelled) / s.total) * 100 : 0;

  const rows = messages.map((m) => ({
    ...m,
    summary: summarize(
      m.events.map((e) => ({ ...e, type: e.type === "OPEN" ? ("open" as const) : ("click" as const) })),
      m.sentAt,
    ),
    fileOpens: m.events.filter(
      (e) => e.type === "CLICK" && !e.isBot && !e.isPrefetch && e.link && fileUrls.has(e.link.url),
    ).length,
  }));
  const fileOpeners = rows.filter((r) => r.fileOpens > 0).length;

  return (
    <PageBody>
      <PageHeader
        title={campaign.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusBadge status={campaign.status} />
            {account && <span>from {account.email}</span>}
            {campaign.scheduledAt && campaign.status === "SCHEDULED" && (
              <span>starts {timeFmt.format(campaign.scheduledAt)}</span>
            )}
          </span>
        }
        actions={<CampaignControls id={id} status={campaign.status} queued={s.queued} />}
      />

      {account?.needsReconnect && s.queued > 0 && (
        <Banner tone="error">
          Google stopped accepting {account.email}. <Link href="/dashboard/settings#gmail" className="underline underline-offset-4">Reconnect it</Link> and sending resumes.
        </Banner>
      )}
      {quotaReached && !account?.needsReconnect && (
        <Banner tone="warn">
          {account!.email} has sent its {account!.dailyLimit} emails for today. The rest go out as the limit frees up.
        </Banner>
      )}

      <section className={cn("mt-8 grid grid-cols-2 gap-3", hasFiles ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
        <Stat label="Sent" value={`${s.sent}`} sub={`of ${s.total}`} />
        <Stat label="Opened" value={pct(s.opened, s.sent)} sub={`${s.opened} people`} />
        <Stat label="Clicked" value={pct(s.clicked, s.sent)} sub={`${s.clicked} people`} />
        {hasFiles && <Stat label="Opened files" value={pct(fileOpeners, s.sent)} sub={`${fileOpeners} people`} />}
        <Stat
          label={s.failed ? "Failed" : "Waiting"}
          value={`${s.failed || s.queued}`}
          sub={s.failed ? "check the list below" : "in the queue"}
        />
      </section>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/5" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-label="Sending progress">
        <div className="h-full rounded-full bg-glow transition-[width] duration-700" style={{ width: `${progress}%` }} />
      </div>

      <div className="mt-8 overflow-x-auto rounded-2xl border border-line-strong">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-faint">
              <th className="px-5 py-3 font-normal">Recipient</th>
              <th className="px-3 py-3 font-normal">Status</th>
              <th className="px-3 py-3 font-normal">Sent</th>
              <th className="px-3 py-3 text-right font-normal">Opens</th>
              <th className="px-3 py-3 text-right font-normal">Clicks</th>
              {hasFiles && <th className="px-3 py-3 text-right font-normal">Files</th>}
              <th className="px-5 py-3 font-normal">Last opened</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="border-b border-line last:border-0">
                <td className="max-w-[260px] px-5 py-3">
                  <p className="truncate font-medium">{m.contact?.name ?? m.toEmail}</p>
                  <p className="truncate text-faint">{m.contact?.name ? m.toEmail : m.contact?.org}</p>
                </td>
                <td className="px-3 py-3">
                  <MessageState status={m.status} error={m.error} />
                </td>
                <td className="tabular px-3 py-3 text-muted">{m.sentAt ? timeFmt.format(m.sentAt) : "–"}</td>
                <td className="tabular px-3 py-3 text-right">
                  {m.summary.opens > 0 ? (
                    <span className="text-glow">{m.summary.opens}</span>
                  ) : m.summary.onlyPrefetched ? (
                    <span className="text-warn" title="Only automatic loads (Gmail at delivery, Apple Mail or a scanner), not a confirmed read">
                      maybe
                    </span>
                  ) : (
                    <span className="text-faint">0</span>
                  )}
                </td>
                <td className="tabular px-3 py-3 text-right">
                  {m.summary.clicks > 0 ? <span className="text-dusk">{m.summary.clicks}</span> : <span className="text-faint">0</span>}
                </td>
                {hasFiles && (
                  <td className="tabular px-3 py-3 text-right">
                    {m.fileOpens > 0 ? (
                      <span className="text-dusk">opened {m.fileOpens}×</span>
                    ) : (
                      <span className="text-faint">–</span>
                    )}
                  </td>
                )}
                <td className="tabular px-5 py-3 text-muted">
                  {m.summary.lastOpenAt ? timeFmt.format(m.summary.lastOpenAt) : "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageBody>
  );
}

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "–");

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-line bg-ink-raised/40 px-5 py-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="tabular mt-2 text-3xl font-semibold tracking-[-0.03em]">{value}</p>
      <p className="mt-0.5 text-xs text-faint">{sub}</p>
    </div>
  );
}

const MESSAGE_STATE: Record<MessageStatus, { label: string; className: string }> = {
  QUEUED: { label: "Queued", className: "text-faint" },
  SENDING: { label: "Sending", className: "text-glow" },
  SENT: { label: "Sent", className: "text-text" },
  FAILED: { label: "Failed", className: "text-red-300" },
  CANCELLED: { label: "Cancelled", className: "text-faint line-through" },
};

function MessageState({ status, error }: { status: MessageStatus; error: string | null }) {
  const s = MESSAGE_STATE[status];
  return (
    <span className={s.className} title={status === "FAILED" ? (error ?? undefined) : undefined}>
      {s.label}
    </span>
  );
}

function Banner({ tone, children }: { tone: "error" | "warn"; children: React.ReactNode }) {
  return (
    <p
      role="status"
      className={cn(
        "mt-6 rounded-2xl border px-4 py-3 text-sm",
        tone === "error" ? "border-red-400/20 bg-red-400/10 text-red-200" : "border-warn/25 bg-warn/10 text-warn",
      )}
    >
      {children}
    </p>
  );
}
