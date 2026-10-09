import { summarize } from "@ripple/shared";
import { Mail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageBody, PageHeader } from "@/components/dashboard/page-header";
import { ButtonLink } from "@/components/ui/button";
import { LiveRefresh } from "@/components/ui/live-refresh";
import { LocalTime } from "@/components/ui/local-time";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Emails" };

/** Single emails tracked from Gmail with the extension, across the workspace. */
export default async function EmailsPage() {
  const { workspace } = await requireWorkspace();
  const messages = await db.message.findMany({
    where: { workspaceId: workspace.id, source: "EXTENSION" },
    orderBy: { sentAt: "desc" },
    take: 200,
    select: {
      id: true,
      toEmail: true,
      cc: true,
      subject: true,
      sentAt: true,
      contact: { select: { name: true } },
      sender: { select: { name: true } },
      events: { select: { type: true, at: true, isPrefetch: true, isBot: true, isSelf: true } },
    },
  });

  return (
    <PageBody>
      <LiveRefresh seconds={30} />
      <PageHeader
        title="Emails"
        description="Single emails you and your team tracked from Gmail with the extension."
        actions={
          messages.length > 0 && (
            <ButtonLink href="/dashboard/extension" variant="secondary">
              Extension settings
            </ButtonLink>
          )
        }
      />

      {messages.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="No tracked emails yet"
          body="Install the Chrome extension and switch on Ripple in Gmail’s compose window. Every email you send with it shows up here."
          action={<ButtonLink href="/dashboard/extension">Set up the extension</ButtonLink>}
        />
      ) : (
        <div className="mt-8 overflow-x-auto rounded-2xl border border-line-strong">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-faint">
                <th className="px-5 py-3 font-normal">To</th>
                <th className="px-3 py-3 font-normal">Subject</th>
                <th className="px-3 py-3 font-normal">Sent</th>
                <th className="px-3 py-3 text-right font-normal">Opens</th>
                <th className="px-3 py-3 text-right font-normal">Clicks</th>
                <th className="px-5 py-3 font-normal">Last opened</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((m) => {
                const s = summarize(
                  m.events.map((e) => ({ ...e, type: e.type === "OPEN" ? ("open" as const) : ("click" as const) })),
                  m.sentAt,
                );
                return (
                  <tr key={m.id} className="border-b border-line last:border-0">
                    <td className="max-w-[240px] px-5 py-3">
                      <p className="truncate font-medium">
                        {m.contact?.name ?? m.toEmail}
                        {m.cc.length > 0 && <span className="ml-1.5 text-xs text-faint">+{m.cc.length}</span>}
                      </p>
                      <p className="truncate text-xs text-faint">by {m.sender?.name ?? "a teammate"}</p>
                    </td>
                    <td className="max-w-[260px] truncate px-3 py-3 text-muted">{m.subject || "(no subject)"}</td>
                    <td className="tabular px-3 py-3 text-muted">{m.sentAt ? <LocalTime date={m.sentAt} /> : "–"}</td>
                    <td className="tabular px-3 py-3 text-right">
                      {s.opens > 0 ? (
                        <span className="text-glow">{s.opens}</span>
                      ) : s.onlyPrefetched ? (
                        <span className="text-warn">maybe</span>
                      ) : (
                        <span className="text-faint">0</span>
                      )}
                    </td>
                    <td className="tabular px-3 py-3 text-right">
                      {s.clicks > 0 ? <span className="text-dusk">{s.clicks}</span> : <span className="text-faint">0</span>}
                    </td>
                    <td className="tabular px-5 py-3 text-muted">
                      {s.lastOpenAt ? <LocalTime date={s.lastOpenAt} /> : "–"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4 text-xs text-faint">
        Want this inside Gmail instead? The extension shows the same read status on each sent email.{" "}
        <Link href="/dashboard/extension" className="underline underline-offset-4">
          Set it up
        </Link>
        .
      </p>
    </PageBody>
  );
}
