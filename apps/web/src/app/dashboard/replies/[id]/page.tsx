import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReplyComposer } from "@/components/replies/reply-composer";
import { PageBody, PageHeader } from "@/components/dashboard/page-header";
import { LocalTime } from "@/components/ui/local-time";
import { aiAssistant } from "@/lib/campaign-data";
import { db } from "@/lib/db";
import { GmailReadError, splitQuoted } from "@/lib/gmail-read";
import { GoogleAuthError } from "@/lib/google";
import { loadConversation } from "@/lib/replies";
import { cn } from "@/lib/utils";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Conversation" };

export default function ConversationPage({ params }: PageProps<"/dashboard/replies/[id]">) {
  return (
    <Suspense
      fallback={
        <PageBody>
          <div className="h-8 w-64 animate-pulse rounded-lg bg-white/5" />
          <div className="mt-8 h-48 animate-pulse rounded-2xl bg-white/[0.03]" />
        </PageBody>
      }
    >
      <Conversation params={params} />
    </Suspense>
  );
}

async function Conversation({ params }: { params: PageProps<"/dashboard/replies/[id]">["params"] }) {
  const { id } = await params;
  const { user, workspace } = await requireWorkspace();

  let convo: Awaited<ReturnType<typeof loadConversation>>;
  let loadError: string | null = null;
  try {
    convo = await loadConversation(id, user.id, workspace.id);
  } catch (err) {
    if (!(err instanceof GoogleAuthError || err instanceof GmailReadError)) throw err;
    loadError = "Ripple couldn't load this conversation from Gmail. Reconnect the account in Settings and try again.";
    const message = await db.message.findFirst({
      where: { id, workspaceId: workspace.id, gmailAccount: { userId: user.id } },
      select: { id: true },
    });
    if (!message) notFound();
    convo = null;
  }
  if (!convo && !loadError) notFound();

  const [ai, saved] = await Promise.all([
    aiAssistant(user.id),
    // Shown when Gmail can't be reached, so the replies are still readable in short.
    db.reply.findMany({
      where: { messageId: id },
      orderBy: { receivedAt: "asc" },
      select: { id: true, fromEmail: true, fromName: true, snippet: true, receivedAt: true },
    }),
    db.reply.updateMany({ where: { messageId: id, readAt: null }, data: { readAt: new Date() } }),
  ]);

  const items = convo?.items ?? null;
  const subject = convo?.message.subject ?? "Conversation";
  const contact = convo?.message.contact;
  const them = items ? [...items].reverse().find((m) => !m.fromMe) : undefined;

  return (
    <PageBody>
      <PageHeader
        title={subject || "(no subject)"}
        back={{ href: "/dashboard/replies", label: "Replies" }}
        description={
          convo ? (
            <span>
              With {contact?.name ?? convo.message.toEmail}
              {contact?.org ? ` · ${contact.org}` : ""}
              {convo.message.campaign ? ` · ${convo.message.campaign.name}` : ""}
            </span>
          ) : undefined
        }
      />

      {(loadError || (convo && !items)) && (
        <p className="mt-8 rounded-2xl border border-warn/25 bg-warn/5 px-4 py-3 text-sm text-warn">
          {loadError ?? "Ripple can't read this Gmail account yet. Reconnect it in Settings and allow reading to see the conversation."}
        </p>
      )}

      {!items && saved.length > 0 && (
        <ol className="mt-6 flex flex-col gap-3">
          {saved.map((r) => (
            <li key={r.id} className="rounded-2xl border border-line-strong bg-surface px-5 py-4 sm:mr-10">
              <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-medium">{r.fromName ?? r.fromEmail}</span>
                <span className="ml-auto text-xs text-faint">
                  <LocalTime date={r.receivedAt} />
                </span>
              </div>
              <p className="mt-2 text-sm text-muted">{r.snippet}…</p>
            </li>
          ))}
        </ol>
      )}

      {items && (
        <ol className="mt-8 flex flex-col gap-3">
          {items.map((m) => {
            const { main, quoted } = splitQuoted(m.text);
            return (
              <li
                key={m.id}
                className={cn(
                  "rounded-2xl border px-5 py-4",
                  m.fromMe ? "border-line bg-ink-sunken/40 sm:ml-10" : "border-line-strong bg-surface sm:mr-10",
                )}
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                  <span className="font-medium">{m.fromMe ? "You" : (m.from.name ?? m.from.email)}</span>
                  {!m.fromMe && m.from.name && <span className="text-faint">{m.from.email}</span>}
                  <span className="ml-auto text-xs text-faint">
                    <LocalTime date={m.date} />
                  </span>
                </div>
                <div className="mt-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words text-text">
                  {main || m.snippet}
                </div>
                {quoted && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-xs text-faint select-none hover:text-muted">Show earlier text</summary>
                    <div className="mt-2 border-l-2 border-line pl-3 whitespace-pre-wrap break-words text-muted">{quoted}</div>
                  </details>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {items && them && (
        <ReplyComposer
          messageId={id}
          ai={ai}
          to={them.from.name ? `${them.from.name} <${them.from.email}>` : them.from.email}
          from={convo!.account.email}
        />
      )}
    </PageBody>
  );
}
