import { Inbox as InboxIcon, MailCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { Suspense } from "react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageBody, PageHeader } from "@/components/dashboard/page-header";
import { buttonClass } from "@/components/ui/button";
import { LiveRefresh } from "@/components/ui/live-refresh";
import { LocalTime } from "@/components/ui/local-time";
import { db } from "@/lib/db";
import { syncUserAccounts } from "@/lib/replies";
import { cn } from "@/lib/utils";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Replies" };

/** Replies to emails the signed-in user sent. Teammates never see each other's conversations. */
export default function RepliesPage() {
  return (
    <PageBody>
      <LiveRefresh seconds={30} />
      <PageHeader
        title="Replies"
        description="Replies to emails you sent with Ripple. Only you see these; your team sees that someone replied."
      />
      <Suspense fallback={<ListSkeleton />}>
        <Inbox />
      </Suspense>
    </PageBody>
  );
}

function ListSkeleton() {
  return <div className="mt-8 h-64 animate-pulse rounded-2xl bg-white/[0.03]" />;
}

async function Inbox() {
  const { user, workspace } = await requireWorkspace();
  const [accounts, replies] = await Promise.all([
    db.gmailAccount.findMany({
      where: { userId: user.id },
      select: { email: true, canRead: true, needsReconnect: true, repliesSyncedAt: true },
      orderBy: { createdAt: "asc" },
    }),
    db.reply.findMany({
      where: { message: { workspaceId: workspace.id, gmailAccount: { userId: user.id } } },
      orderBy: { receivedAt: "desc" },
      take: 500,
      select: {
        messageId: true,
        fromEmail: true,
        fromName: true,
        snippet: true,
        receivedAt: true,
        readAt: true,
        message: {
          select: { subject: true, contact: { select: { org: true } }, campaign: { select: { name: true } } },
        },
      },
    }),
  ]);

  // Check Gmail for new replies after the page is sent; LiveRefresh then shows them.
  after(() => syncUserAccounts(user.id));

  // One row per conversation: its latest reply, with how many are unread.
  const threads = new Map<string, { latest: (typeof replies)[number]; count: number; unread: number }>();
  for (const r of replies) {
    const t = threads.get(r.messageId);
    if (t) {
      t.count++;
      if (!r.readAt) t.unread++;
    } else threads.set(r.messageId, { latest: r, count: 1, unread: r.readAt ? 0 : 1 });
  }

  const blocked = accounts.filter((a) => !a.canRead || a.needsReconnect);
  const lastSync = accounts
    .filter((a) => a.canRead && a.repliesSyncedAt)
    .map((a) => a.repliesSyncedAt!)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return (
    <>
      {blocked.length > 0 && accounts.length > 0 && (
        <div className="mt-8 flex flex-col gap-2">
          {blocked.map((a) => (
            <div
              key={a.email}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-warn/25 bg-warn/5 px-4 py-3 text-sm"
            >
              <MailCheck className="size-4 shrink-0 text-warn" />
              <p className="min-w-0 flex-1 text-warn">
                {a.needsReconnect
                  ? `Google signed ${a.email} out. Reconnect it to send and see replies.`
                  : `Ripple can't see replies to ${a.email} yet. Reconnect it and allow Ripple to read email.`}
              </p>
              <a href={`/api/gmail/connect?account=${encodeURIComponent(a.email)}`} className={buttonClass({ size: "sm" })}>
                Reconnect
              </a>
            </div>
          ))}
        </div>
      )}

      {threads.size === 0 ? (
        <EmptyState
          icon={InboxIcon}
          title={accounts.length ? "No replies yet" : "Connect Gmail first"}
          body={
            accounts.length
              ? "When someone replies to an email you sent with Ripple, the conversation shows up here and you can answer it without leaving Ripple."
              : "Replies come from the Gmail account you send with. Connect it in Settings."
          }
          action={
            accounts.length ? undefined : (
              <Link href="/dashboard/settings#gmail" className={buttonClass({ size: "sm" })}>
                Open Settings
              </Link>
            )
          }
        />
      ) : (
        <ul className="mt-8 overflow-hidden rounded-2xl border border-line-strong bg-surface">
          {[...threads.entries()].map(([messageId, { latest, count, unread }]) => (
            <li key={messageId} className="border-b border-line last:border-0">
              <Link
                href={`/dashboard/replies/${messageId}`}
                className="flex items-start gap-3 px-5 py-4 transition-colors hover:bg-white/[0.03]"
              >
                <span
                  aria-hidden
                  className={cn("mt-2 size-2 shrink-0 rounded-full", unread ? "bg-glow" : "bg-transparent")}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className={cn("truncate text-sm", unread ? "font-semibold text-text" : "font-medium")}>
                      {latest.fromName ?? latest.fromEmail}
                      {latest.message.contact?.org && (
                        <span className="font-normal text-faint"> · {latest.message.contact.org}</span>
                      )}
                    </p>
                    {count > 1 && <span className="text-xs text-faint tabular">{count}</span>}
                    <span className="ml-auto shrink-0 text-xs text-faint">
                      <LocalTime date={latest.receivedAt} />
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted">{latest.message.subject}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-faint">{latest.snippet}</p>
                  {latest.message.campaign && (
                    <span className="mt-2 inline-block rounded-md border border-line px-1.5 py-0.5 text-[11px] text-faint">
                      {latest.message.campaign.name}
                    </span>
                  )}
                </div>
                {unread > 0 && <span className="sr-only">{unread} unread</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {lastSync && (
        <p className="mt-4 text-xs text-faint">
          Checked Gmail <LocalTime date={lastSync} />. New replies show up within a few minutes.
        </p>
      )}
    </>
  );
}
