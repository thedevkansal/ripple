import { formatBytes, renderTemplate } from "@ripple/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LogoMark } from "@/components/brand/logo";
import { PageBody, PageHeader } from "@/components/dashboard/page-header";
import { LocalTime } from "@/components/ui/local-time";
import { PrintButton } from "@/components/ui/print-button";
import { campaignStats } from "@/lib/campaign-data";
import { campaignReport } from "@/lib/campaign-report";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Campaign report" };

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "–");

export default async function CampaignReportPage({ params }: PageProps<"/dashboard/campaigns/[id]/report">) {
  const { id } = await params;
  const { workspace } = await requireWorkspace();
  const campaign = await db.campaign.findFirst({
    where: { id, workspaceId: workspace.id },
    include: { gmailAccount: { select: { email: true } } },
  });
  if (!campaign) notFound();

  const [statsMap, { rows, files, sampleVars }] = await Promise.all([campaignStats([id]), campaignReport(id)]);
  const s = statsMap.get(id)!;
  const fileOpeners = rows.filter((r) => r.fileOpens > 0).length;
  const engaged = [...rows]
    .filter((r) => r.opens || r.clicks || r.fileOpens)
    .sort((a, b) => b.fileOpens * 3 + b.clicks * 2 + b.opens - (a.fileOpens * 3 + a.clicks * 2 + a.opens));

  const stats = [
    { label: "Sent", value: `${s.sent}`, sub: `of ${s.total}` },
    { label: "Opened", value: pct(s.opened, s.sent), sub: `${s.opened} people` },
    { label: "Clicked", value: pct(s.clicked, s.sent), sub: `${s.clicked} people` },
    ...(files.length ? [{ label: "Opened files", value: pct(fileOpeners, s.sent), sub: `${fileOpeners} people` }] : []),
  ];

  return (
    <PageBody>
      <div className="print:hidden">
        <PageHeader
          title="Campaign report"
          back={{ href: `/dashboard/campaigns/${id}`, label: campaign.name }}
          actions={<PrintButton />}
        />
      </div>

      <article className="mt-8 rounded-2xl border border-line-strong bg-surface p-8 print:mt-0 print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
          <div>
            <p className="flex items-center gap-2 text-sm text-muted">
              <LogoMark className="size-5" /> Ripple campaign report
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{campaign.name}</h1>
            <p className="mt-1 text-sm text-muted">
              {workspace.name}
              {campaign.gmailAccount && <> · sent from {campaign.gmailAccount.email}</>}
            </p>
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-sm">
            {campaign.startedAt && (
              <>
                <dt className="text-faint">Started</dt>
                <dd>
                  <LocalTime date={campaign.startedAt} />
                </dd>
              </>
            )}
            {campaign.completedAt && (
              <>
                <dt className="text-faint">Finished</dt>
                <dd>
                  <LocalTime date={campaign.completedAt} />
                </dd>
              </>
            )}
            <dt className="text-faint">Generated</dt>
            <dd>
              <LocalTime date={new Date()} />
            </dd>
          </dl>
        </header>

        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((st) => (
            <div key={st.label} className="rounded-xl border border-line px-4 py-3 break-inside-avoid">
              <p className="text-xs text-muted">{st.label}</p>
              <p className="mt-1 text-2xl font-semibold tracking-[-0.03em]">{st.value}</p>
              <p className="text-xs text-faint">{st.sub}</p>
            </div>
          ))}
        </section>
        <p className="mt-3 text-xs text-faint">
          Opens and clicks count real reads only. Automatic image loads by Gmail at delivery, Apple Mail Privacy
          Protection and security scanners are excluded.
        </p>

        <section className="mt-6 break-inside-avoid">
          <h2 className="text-sm font-medium">Email</h2>
          <p className="mt-1 text-sm">
            <span className="text-faint">Subject: </span>
            {renderTemplate(campaign.subject, sampleVars).output || "(no subject)"}
          </p>
          {files.length > 0 && (
            <p className="mt-1 text-sm">
              <span className="text-faint">Attachments: </span>
              {files.map((f) => `${f.name} (${formatBytes(f.size)})`).join(", ")}
            </p>
          )}
        </section>

        {engaged.length > 0 && (
          <section className="mt-6">
            <h2 className="text-sm font-medium">Most engaged</h2>
            <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
              {engaged.slice(0, 10).map((r, i) => (
                <li key={r.id} className="flex gap-2 break-inside-avoid">
                  <span className="tabular w-5 text-faint">{i + 1}.</span>
                  <span className="min-w-0 flex-1 truncate">{r.name ?? r.email}</span>
                  <span className="tabular text-muted">
                    {r.opens} opens · {r.clicks} clicks{files.length ? ` · ${r.fileOpens} files` : ""}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="mt-6">
          <h2 className="text-sm font-medium">All recipients</h2>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-faint">
                <th className="py-2 pr-3 font-normal">Recipient</th>
                <th className="py-2 pr-3 font-normal">Status</th>
                <th className="py-2 pr-3 font-normal">Sent</th>
                <th className="py-2 pr-3 text-right font-normal">Opens</th>
                <th className="py-2 pr-3 text-right font-normal">Clicks</th>
                {files.length > 0 && <th className="py-2 pr-3 text-right font-normal">Files</th>}
                <th className="py-2 font-normal">Last opened</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line break-inside-avoid last:border-0">
                  <td className="py-1.5 pr-3">
                    {r.name ?? r.email}
                    {r.name && <span className="block text-xs text-faint">{r.email}</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-muted capitalize">{r.status.toLowerCase()}</td>
                  <td className="tabular py-1.5 pr-3 text-muted">{r.sentAt ? <LocalTime date={r.sentAt} /> : "–"}</td>
                  <td className="tabular py-1.5 pr-3 text-right">{r.opens || (r.onlyPrefetched ? "maybe" : 0)}</td>
                  <td className="tabular py-1.5 pr-3 text-right">{r.clicks}</td>
                  {files.length > 0 && <td className="tabular py-1.5 pr-3 text-right">{r.fileOpens}</td>}
                  <td className="tabular py-1.5 text-muted">{r.lastOpenAt ? <LocalTime date={r.lastOpenAt} /> : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </article>
    </PageBody>
  );
}
