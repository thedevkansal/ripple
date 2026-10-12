import { Link2, Mail, Plug, Sparkles, UserPlus } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ActionForm, CopyButton, inputClass, SubmitButton } from "@/components/dashboard/forms";
import { PageBody, PageHeader } from "@/components/dashboard/page-header";
import { buttonClass } from "@/components/ui/button";
import { AiKeyForm } from "@/components/settings/ai-key-form";
import { LocalTime } from "@/components/ui/local-time";
import { AI_PROVIDERS } from "@/lib/ai-providers";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/google";
import { INVITE_TTL_DAYS } from "@/lib/invite-email";
import { canManage, requireWorkspace } from "@/lib/workspace";
import {
  createInvite,
  createWorkspace,
  disconnectGmail,
  removeMember,
  renameWorkspace,
  revokeInvite,
  sendEmailInvites,
  updateDailyLimit,
} from "../actions";
import { removeAiKey } from "../ai-actions";
import { revokeExtension } from "../extension/actions";

export const metadata: Metadata = { title: "Settings" };

const GMAIL_RESULTS: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Gmail connected. You can send from it now." },
  denied: { ok: false, text: "Google access was cancelled, so nothing was connected." },
  expired: { ok: false, text: "That connection attempt expired. Start again." },
  "missing-scope": {
    ok: false,
    text: "Ripple needs permission to send email. Tick the Gmail box on Google's consent screen.",
  },
  failed: { ok: false, text: "Google didn't complete the connection. Try again in a moment." },
};


export default async function SettingsPage({ searchParams }: PageProps<"/dashboard/settings">) {
  const { user, workspace, role } = await requireWorkspace();
  const manage = canManage(role);
  const [{ gmail }, accounts, members, invites, extensions, aiKey] = await Promise.all([
    searchParams,
    db.gmailAccount.findMany({
      where: { userId: user.id },
      select: { id: true, email: true, dailyLimit: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    db.member.findMany({
      where: { workspaceId: workspace.id },
      select: { role: true, user: { select: { id: true, name: true, email: true, image: true } } },
      orderBy: { createdAt: "asc" },
    }),
    manage
      ? db.invite.findMany({
          where: { workspaceId: workspace.id, revokedAt: null, acceptedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    db.extensionToken.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, label: true, createdAt: true, lastUsedAt: true },
    }),
    db.aiKey.findUnique({ where: { userId: user.id }, select: { provider: true, model: true, keyHint: true } }),
  ]);
  const banner = typeof gmail === "string" ? GMAIL_RESULTS[gmail] : undefined;

  return (
    <PageBody>
      <PageHeader title="Settings" />

      {banner && (
        <p
          role={banner.ok ? "status" : "alert"}
          className={
            banner.ok
              ? "mt-8 rounded-2xl border border-glow/25 bg-glow/10 px-4 py-3 text-sm text-glow"
              : "mt-8 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200"
          }
        >
          {banner.text}
        </p>
      )}

      <Section
        id="gmail"
        title="Gmail accounts"
        description="Mailboxes you can send from. Only you can use the accounts you connect."
        action={
          <a href="/api/gmail/connect" className={buttonClass({ size: "sm" })}>
            <Mail className="size-3.5" />
            {accounts.length ? "Connect another" : "Connect Gmail"}
          </a>
        }
      >
        {accounts.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">
            No Gmail connected yet. Ripple asks only for permission to send email. It can’t read your
            inbox.
          </p>
        ) : (
          <ul>
            {accounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line px-5 py-4 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{a.email}</p>
                  <p className="text-sm text-faint">Connected <LocalTime date={a.createdAt} format="date" /></p>
                </div>
                <ActionForm action={updateDailyLimit} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="accountId" value={a.id} />
                  <label htmlFor={`limit-${a.id}`} className="text-sm text-muted">
                    Daily limit
                  </label>
                  <input
                    id={`limit-${a.id}`}
                    name="dailyLimit"
                    type="number"
                    min={1}
                    max={400}
                    defaultValue={a.dailyLimit}
                    className={`${inputClass} tabular w-20`}
                  />
                  <SubmitButton size="sm" variant="secondary">
                    Save
                  </SubmitButton>
                </ActionForm>
                <form action={disconnectGmail.bind(null, a.id)}>
                  <SubmitButton size="sm" variant="danger">
                    Disconnect
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        id="ai"
        title="AI assistant"
        description="Connect your own Claude, ChatGPT or Gemini API key to write and edit campaign emails with prompts. Only you can use it."
        action={
          aiKey && (
            <form action={removeAiKey}>
              <SubmitButton size="sm" variant="danger">
                Remove key
              </SubmitButton>
            </form>
          )
        }
      >
        {aiKey && (
          <p className="flex items-center gap-2 border-b border-line px-5 py-3.5 text-sm">
            <Sparkles className="size-4 text-glow" />
            Connected to {AI_PROVIDERS[aiKey.provider].label} with key ending{" "}
            <code className="text-muted">{aiKey.keyHint}</code>, using <code className="text-muted">{aiKey.model}</code>
          </p>
        )}
        <AiKeyForm current={aiKey} />
      </Section>

      <Section
        id="team"
        title="Team"
        description={`People in ${workspace.name}. Everyone sees the workspace's campaigns and results.`}
      >
        <ul>
          {members.map((m) => (
            <li key={m.user.id} className="flex items-center gap-3 border-b border-line px-5 py-3.5 last:border-0">
              {m.user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.user.image} alt="" className="size-8 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                <span className="grid size-8 place-items-center rounded-full bg-white/10 text-xs">
                  {(m.user.name ?? m.user.email).charAt(0).toUpperCase()}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.user.name ?? m.user.email}
                  {m.user.id === user.id && <span className="ml-2 text-faint">(you)</span>}
                </p>
                <p className="truncate text-sm text-faint">{m.user.email}</p>
              </div>
              <span className="text-sm text-muted capitalize">{m.role.toLowerCase()}</span>
              {m.role !== "OWNER" && (manage || m.user.id === user.id) && (
                <form action={removeMember.bind(null, m.user.id)}>
                  <SubmitButton size="sm" variant="ghost">
                    {m.user.id === user.id ? "Leave" : "Remove"}
                  </SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>

        {manage && (
          <div className="border-t border-line bg-ink-sunken/40 px-5 py-5">
            <div className="flex items-center gap-2">
              <UserPlus className="size-4 text-glow" />
              <p className="text-sm font-medium">Invite by email</p>
            </div>
            {accounts.length === 0 ? (
              <p className="mt-2 text-sm text-muted">
                Invites are sent from your own Gmail.{" "}
                <a href="/api/gmail/connect" className="text-glow hover:underline">
                  Connect Gmail
                </a>{" "}
                to email them, or share a link below.
              </p>
            ) : (
              <ActionForm action={sendEmailInvites} resetOnSuccess className="mt-3 flex flex-wrap items-center gap-2">
                <label htmlFor="invite-emails" className="sr-only">
                  Email addresses
                </label>
                <input
                  id="invite-emails"
                  name="emails"
                  placeholder="aditi@iitb.ac.in, rahul@gmail.com"
                  autoComplete="off"
                  className={`${inputClass} min-w-0 flex-1 basis-64`}
                />
                <label htmlFor="invite-email-role" className="sr-only">
                  Role
                </label>
                <select id="invite-email-role" name="role" defaultValue="MEMBER" className={inputClass}>
                  <option value="MEMBER">as member</option>
                  <option value="ADMIN">as admin</option>
                </select>
                {accounts.length === 1 ? (
                  <input type="hidden" name="gmailAccountId" value={accounts[0].id} />
                ) : (
                  <>
                    <label htmlFor="invite-from" className="sr-only">
                      Send from
                    </label>
                    <select id="invite-from" name="gmailAccountId" className={`${inputClass} max-w-[14rem]`}>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          from {a.email}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                <SubmitButton size="sm">Send invites</SubmitButton>
                <p className="basis-full text-xs text-faint">
                  Sent from {accounts.length === 1 ? accounts[0].email : "the Gmail you pick"}. Each invite works once,
                  only for that address, for {INVITE_TTL_DAYS} days.
                </p>
              </ActionForm>
            )}

            <ActionForm action={createInvite} className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
              <Link2 className="size-4 text-muted" />
              <p className="mr-auto text-sm text-muted">Or share a link anyone can use</p>
              <label htmlFor="invite-role" className="sr-only">
                Role
              </label>
              <select id="invite-role" name="role" defaultValue="MEMBER" className={inputClass}>
                <option value="MEMBER">as member</option>
                <option value="ADMIN">as admin</option>
              </select>
              <SubmitButton size="sm" variant="secondary">
                Create link
              </SubmitButton>
            </ActionForm>

            {invites.length > 0 && (
              <ul className="mt-4 flex flex-col gap-2">
                {invites.map((inv) => {
                  const url = `${appUrl()}/invite/${inv.token}`;
                  return (
                    <li
                      key={inv.id}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-3 py-2.5"
                    >
                      {inv.email ? (
                        <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                          <Mail className="size-3.5 shrink-0 text-faint" />
                          <span className="truncate">{inv.email}</span>
                          <span className="shrink-0 text-xs text-faint">invited</span>
                        </span>
                      ) : (
                        <code className="min-w-0 flex-1 truncate text-xs text-muted">{url}</code>
                      )}
                      <span className="text-xs text-faint">
                        {inv.role.toLowerCase()}, expires <LocalTime date={inv.expiresAt} format="date" />
                      </span>
                      {!inv.email && <CopyButton value={url} />}
                      <form action={revokeInvite.bind(null, inv.id)}>
                        <SubmitButton size="sm" variant="ghost">
                          Revoke
                        </SubmitButton>
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </Section>

      <Section
        id="extension"
        title="Chrome extension"
        description="Browsers where the Ripple extension is connected to your account. Revoke one to sign it out."
        action={
          <Link href="/dashboard/extension" className={buttonClass({ size: "sm", variant: "secondary" })}>
            <Plug className="size-3.5" />
            Connect a browser
          </Link>
        }
      >
        {extensions.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">Not connected in any browser yet.</p>
        ) : (
          <ul>
            {extensions.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line px-5 py-4 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{x.label}</p>
                  <p className="text-sm text-faint">
                    Connected <LocalTime date={x.createdAt} format="date" />
                    {x.lastUsedAt && (
                      <>
                        {" · last used "}
                        <LocalTime date={x.lastUsedAt} />
                      </>
                    )}
                  </p>
                </div>
                <form action={revokeExtension.bind(null, x.id)}>
                  <SubmitButton size="sm" variant="danger">
                    Revoke
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="workspace" title="Workspace">
        <div className="grid gap-6 px-5 py-5 sm:grid-cols-2">
          <ActionForm action={renameWorkspace} className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm text-muted">
              Name
              <input
                name="name"
                defaultValue={workspace.name}
                disabled={!manage}
                className={`${inputClass} w-full`}
              />
            </label>
            {manage && (
              <SubmitButton size="md" variant="secondary">
                Rename
              </SubmitButton>
            )}
          </ActionForm>
          <ActionForm action={createWorkspace} resetOnSuccess className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm text-muted">
              New workspace
              <input name="name" placeholder="E-Summit Sponsorship" className={`${inputClass} w-full`} />
            </label>
            <SubmitButton size="md" variant="secondary">
              Create
            </SubmitButton>
          </ActionForm>
        </div>
      </Section>
    </PageBody>
  );
}

function Section({
  id,
  title,
  description,
  action,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mt-10 scroll-mt-24">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
        {action}
      </div>
      <div className="overflow-hidden rounded-2xl border border-line-strong bg-surface">{children}</div>
    </section>
  );
}
