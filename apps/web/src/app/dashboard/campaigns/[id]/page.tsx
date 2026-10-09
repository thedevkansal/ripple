import { contactVars, formatBytes, renderTemplate, summarize, textToHtml } from "@ripple/shared";
import { ChevronRight, Paperclip } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { CampaignControls } from "@/components/campaigns/campaign-controls";
import { CampaignEditor } from "@/components/campaigns/campaign-editor";
import { RecipientsTable, type RecipientRowData } from "@/components/campaigns/recipients-table";
import { StatusBadge } from "@/components/campaigns/status-badge";
import { PageBody, PageHeader } from "@/components/dashboard/page-header";
import { LiveRefresh } from "@/components/ui/live-refresh";
import { LocalTime } from "@/components/ui/local-time";
import { ResetOnNavigate } from "@/components/ui/reset-on-navigate";
import { campaignStats, listTemplates, senderAccounts } from "@/lib/campaign-data";
import { db } from "@/lib/db";
import { kickQueueIfDue, sentInLastDay } from "@/lib/queue";
import { cn } from "@/lib/utils";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Campaign" };

export default async function CampaignPage({ params }: PageProps<"/dashboard/campaigns/[id]">) {
  const { id } = await params;
  const { user, workspace } = await requireWorkspace();
  const campaign = await db.campaign.findFirst({
    where: { id, workspaceId: workspace.id },
    include: { gmailAccount: { select: { id: true, email: true, dailyLimit: true, needsReconnect: true } } },
  });
  if (!campaign) notFound();

  if (campaign.status === "DRAFT") {
    const [accounts, templates, attachments, messages] = await Promise.all([
      senderAccounts(user.id),
      listTemplates(workspace.id),
      db.attachment.findMany({
        where: { campaignId: id },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, size: true, contentType: true, url: true },
      }),
      db.message.findMany({
        where: { campaignId: id },
        orderBy: { createdAt: "asc" },
        select: {
          toEmail: true,
          contact: { select: { name: true, org: true, ccEmails: true, fields: true } },
        },
      }),
    ]);
    return (
      <PageBody>
        <PageHeader
          title={campaign.name}
          back={{ href: "/dashboard/campaigns", label: "Campaigns" }}
          description={<StatusBadge status="DRAFT" />}
        />
        <div className="mt-8">
          <ResetOnNavigate>
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
              cc: campaign.cc,
            }}
            initialRecipients={messages.map((m) => ({
              email: m.toEmail,
              name: m.contact?.name ?? undefined,
              org: m.contact?.org ?? undefined,
              cc: m.contact?.ccEmails.length ? m.contact.ccEmails : undefined,
              fields: (m.contact?.fields as Record<string, string> | null) ?? undefined,
            }))}
            initialAttachments={attachments}
            templates={templates}
            workspaceId={workspace.id}
            accounts={accounts}
            senderName={user.name ?? ""}
          />
          </ResetOnNavigate>
        </div>
      </PageBody>
    );
  }

  // Viewing a campaign also sends anything that is due, so schedules don't wait for the cron.
  if (campaign.status === "SCHEDULED" || campaign.status === "SENDING") {
    after(() => kickQueueIfDue().catch((err) => console.error("kickQueueIfDue", err)));
  }

  const [statsMap, messages, sentToday, files] = await Promise.all([
    campaignStats([id]),
    db.message.findMany({
      where: { campaignId: id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        toEmail: true,
        status: true,
        sentAt: true,
        error: true,
        contact: { select: { name: true, email: true, org: true, fields: true } },
        events: {
          select: { type: true, at: true, isPrefetch: true, isBot: true, link: { select: { url: true } } },
        },
      },
    }),
    campaign.gmailAccount ? sentInLastDay(campaign.gmailAccount.id) : Promise.resolve(0),
    db.attachment.findMany({
      where: { campaignId: id },
      orderBy: { createdAt: "asc" },
      select: { name: true, size: true, url: true },
    }),
  ]);
  const s = statsMap.get(id)!;
  const account = campaign.gmailAccount;
  const quotaReached = account && sentToday >= account.dailyLimit && s.queued > 0;
  const progress = s.total ? ((s.sent + s.failed + s.cancelled) / s.total) * 100 : 0;
  const fileUrls = new Set(files.map((f) => f.url));
  const hasFiles = campaign.linkAttachments && fileUrls.size > 0;

  const rows: RecipientRowData[] = messages.map((m) => {
    const summary = summarize(
      m.events.map((e) => ({ ...e, type: e.type === "OPEN" ? ("open" as const) : ("click" as const) })),
      m.sentAt,
    );
    return {
      id: m.id,
      name: m.contact?.name ?? null,
      email: m.toEmail,
      org: m.contact?.org ?? null,
      status: m.status,
      error: m.error,
      sentAt: m.sentAt?.toISOString() ?? null,
      opens: summary.opens,
      onlyPrefetched: summary.onlyPrefetched,
      clicks: summary.clicks,
      fileOpens: m.events.filter(
        (e) => e.type === "CLICK" && !e.isBot && !e.isPrefetch && e.link && fileUrls.has(e.link.url),
      ).length,
      lastOpenAt: summary.lastOpenAt?.toISOString() ?? null,
    };
  });
  const fileOpeners = rows.filter((r) => r.fileOpens > 0).length;

  // The email as the first recipient received it (tracking removed).
  const sample = messages.find((m) => m.status === "SENT") ?? messages[0];
  const vars = sample?.contact
    ? contactVars({
        email: sample.contact.email,
        name: sample.contact.name,
        org: sample.contact.org,
        fields: sample.contact.fields as Record<string, unknown> | null,
      })
    : { email: sample?.toEmail };
  const previewHtml = textToHtml(renderTemplate(campaign.body, vars).output, {
    files: campaign.linkAttachments ? files : [],
  });

  const live = campaign.status === "SCHEDULED" || campaign.status === "SENDING";

  return (
    <PageBody>
      <LiveRefresh seconds={live ? 10 : 30} />
      <PageHeader
        title={campaign.name}
        back={{ href: "/dashboard/campaigns", label: "Campaigns" }}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusBadge status={campaign.status} />
            {account && <span>from {account.email}</span>}
            {campaign.scheduledAt && campaign.status === "SCHEDULED" && (
              <span>
                starts <LocalTime date={campaign.scheduledAt} />
              </span>
            )}
            {campaign.completedAt && campaign.status === "SENT" && (
              <span>
                finished <LocalTime date={campaign.completedAt} />
              </span>
            )}
          </span>
        }
        actions={<CampaignControls id={id} status={campaign.status} queued={s.queued} />}
      />

      {account?.needsReconnect && s.queued > 0 && (
        <Banner tone="error">
          Google stopped accepting {account.email}.{" "}
          <Link href="/dashboard/settings#gmail" className="underline underline-offset-4">
            Reconnect it
          </Link>{" "}
          and sending resumes.
        </Banner>
      )}
      {quotaReached && !account?.needsReconnect && (
        <Banner tone="warn">
          {account!.email} has sent its {account!.dailyLimit} emails for today. The rest go out as the limit frees
          up.
        </Banner>
      )}

      <section className={cn("mt-8 grid grid-cols-2 gap-3", hasFiles ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
        <Stat label="Sent" value={`${s.sent}`} sub={`of ${s.total}`} />
        <Stat label="Opened" value={pct(s.opened, s.sent)} sub={people(s.opened)} />
        <Stat label="Clicked" value={pct(s.clicked, s.sent)} sub={people(s.clicked)} />
        {hasFiles && <Stat label="Opened files" value={pct(fileOpeners, s.sent)} sub={people(fileOpeners)} />}
        <Stat
          label={s.failed ? "Failed" : "Waiting"}
          value={`${s.failed || s.queued}`}
          sub={s.failed ? "see Failed below" : "in the queue"}
        />
      </section>

      <div
        className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/5"
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Sending progress"
      >
        <div className="h-full rounded-full bg-glow transition-[width] duration-700" style={{ width: `${progress}%` }} />
      </div>

      <details className="group mt-8 overflow-hidden rounded-2xl border border-line-strong bg-ink-raised/40">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-4 shrink-0 text-faint transition-transform duration-200 group-open:rotate-90" />
          <span className="text-sm text-muted">Sent email</span>
          <span className="min-w-0 flex-1 truncate font-medium">
            {renderTemplate(campaign.subject, vars).output || "(no subject)"}
          </span>
          {files.length > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 text-sm text-faint">
              <Paperclip className="size-3.5" />
              {files.length}
            </span>
          )}
        </summary>
        <div className="border-t border-line">
          <p className="px-5 py-3 text-xs text-faint">
            As {sample?.contact?.name ?? sample?.toEmail ?? "the first recipient"} received it. Every recipient got
            their own merge fields.
          </p>
          {files.length > 0 && (
            <ul className="flex flex-wrap gap-2 px-5 pb-3">
              {files.map((f) => (
                <li key={f.url}>
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm hover:border-glow/40"
                  >
                    <Paperclip className="size-3.5 text-glow" />
                    {f.name}
                    <span className="text-faint">{formatBytes(f.size)}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          <iframe title="Sent email" sandbox="" srcDoc={previewHtml} className="h-[460px] w-full bg-white" />
        </div>
      </details>

      <RecipientsTable rows={rows} showFiles={hasFiles} />
    </PageBody>
  );
}

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "–");
const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-line bg-ink-raised/40 px-5 py-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="tabular mt-2 text-3xl font-semibold tracking-[-0.03em]">{value}</p>
      <p className="mt-0.5 text-xs text-faint">{sub}</p>
    </div>
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
