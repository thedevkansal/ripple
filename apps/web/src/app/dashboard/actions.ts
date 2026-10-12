"use server";

import { generateToken } from "@ripple/shared";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { signOut } from "@/auth";
import { db } from "@/lib/db";
import { GmailSendError, sendViaGmail } from "@/lib/gmail-send";
import { accessTokenFor, appUrl, GoogleAuthError, revokeRefreshToken } from "@/lib/google";
import { INVITE_TTL_DAYS, inviteEmail } from "@/lib/invite-email";
import {
  canManage,
  requireUser,
  requireWorkspace,
  WORKSPACE_COOKIE,
} from "@/lib/workspace";

const MAX_DAILY_LIMIT = 400; // Gmail allows 500/day on personal accounts; stay clear of it.

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

async function setWorkspaceCookie(id: string) {
  (await cookies()).set(WORKSPACE_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}

// ─── Workspaces ──────────────────────────────────────────────────────

export async function switchWorkspace(workspaceId: string) {
  const user = await requireUser();
  const member = await db.member.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId } },
  });
  if (!member) return;
  await setWorkspaceCookie(workspaceId);
  revalidatePath("/dashboard", "layout");
}

const nameSchema = z.string().trim().min(2, "Use at least 2 characters.").max(48, "Keep it under 48 characters.");

export async function createWorkspace(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = nameSchema.safeParse(form.get("name"));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const slugBase = parsed.data.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const workspace = await db.workspace.create({
    data: {
      name: parsed.data,
      slug: `${slugBase || "team"}-${generateToken(6).toLowerCase()}`,
      members: { create: { userId: user.id, role: "OWNER" } },
    },
  });
  await setWorkspaceCookie(workspace.id);
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Workspace created." };
}

export async function renameWorkspace(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { workspace, role } = await requireWorkspace();
  if (!canManage(role)) return { ok: false, error: "Only owners and admins can rename the workspace." };
  const parsed = nameSchema.safeParse(form.get("name"));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  await db.workspace.update({ where: { id: workspace.id }, data: { name: parsed.data } });
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Saved." };
}

// ─── Team ────────────────────────────────────────────────────────────

const roleSchema = z.enum(["ADMIN", "MEMBER"]);

export async function createInvite(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { user, workspace, role } = await requireWorkspace();
  if (!canManage(role)) return { ok: false, error: "Only owners and admins can invite people." };
  const inviteRole = roleSchema.safeParse(form.get("role"));
  if (!inviteRole.success) return { ok: false, error: "Pick a role." };

  await db.invite.create({
    data: {
      workspaceId: workspace.id,
      token: generateToken(),
      role: inviteRole.data,
      createdById: user.id,
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
    },
  });
  revalidatePath("/dashboard/settings");
  return { ok: true, message: "Invite link created." };
}

const MAX_EMAIL_INVITES = 20;

/** Emails a personal invite to each address, from the inviter's own connected Gmail. */
export async function sendEmailInvites(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { user, workspace, role } = await requireWorkspace();
  if (!canManage(role)) return { ok: false, error: "Only owners and admins can invite people." };
  const inviteRole = roleSchema.safeParse(form.get("role"));
  if (!inviteRole.success) return { ok: false, error: "Pick a role." };

  const emails = [
    ...new Set(
      String(form.get("emails") ?? "")
        .split(/[\s,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (!emails.length) return { ok: false, error: "Add at least one email address." };
  const bad = emails.filter((e) => !z.email().safeParse(e).success);
  if (bad.length) return { ok: false, error: `Not a valid email: ${bad.slice(0, 3).join(", ")}` };
  if (emails.length > MAX_EMAIL_INVITES) return { ok: false, error: `Invite up to ${MAX_EMAIL_INVITES} people at a time.` };

  const account = await db.gmailAccount.findFirst({
    where: { id: String(form.get("gmailAccountId") ?? ""), userId: user.id },
  });
  if (!account) return { ok: false, error: "Pick one of your connected Gmail accounts to send from." };
  if (account.needsReconnect) return { ok: false, error: `Reconnect ${account.email} before sending from it.` };

  const existing = await db.member.findMany({
    where: { workspaceId: workspace.id, user: { email: { in: emails, mode: "insensitive" } } },
    select: { user: { select: { email: true } } },
  });
  const already = new Set(existing.map((m) => m.user.email.toLowerCase()));
  const toInvite = emails.filter((e) => !already.has(e));
  if (!toInvite.length) {
    return { ok: false, error: already.size === 1 ? "They're already in this workspace." : "They're all already in this workspace." };
  }

  let accessToken: string;
  try {
    accessToken = await accessTokenFor(account.encryptedRefreshToken);
  } catch (err) {
    if (err instanceof GoogleAuthError && err.needsReconnect) {
      await db.gmailAccount.update({ where: { id: account.id }, data: { needsReconnect: true } });
      return { ok: false, error: `Google signed ${account.email} out. Reconnect it and try again.` };
    }
    return { ok: false, error: "Couldn't reach Gmail. Try again in a moment." };
  }

  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);
  const sent: string[] = [];
  const failed: string[] = [];
  for (const email of toInvite) {
    // Inviting the same address again resends the pending invite instead of piling up new ones.
    const pending = await db.invite.findFirst({
      where: { workspaceId: workspace.id, email, revokedAt: null, acceptedAt: null, expiresAt: { gt: new Date() } },
    });
    const invite = pending
      ? await db.invite.update({ where: { id: pending.id }, data: { role: inviteRole.data, expiresAt } })
      : await db.invite.create({
          data: {
            workspaceId: workspace.id,
            token: generateToken(),
            role: inviteRole.data,
            email,
            createdById: user.id,
            expiresAt,
          },
        });

    const content = inviteEmail({
      inviter: user.name ?? account.email,
      workspace: workspace.name,
      role: inviteRole.data,
      url: `${appUrl()}/invite/${invite.token}`,
      days: INVITE_TTL_DAYS,
    });
    try {
      await sendViaGmail(accessToken, {
        from: { email: account.email, name: user.name },
        to: { email },
        ...content,
      });
      sent.push(email);
    } catch (err) {
      failed.push(email);
      if (!pending) await db.invite.delete({ where: { id: invite.id } });
      if (err instanceof GmailSendError && (err.kind === "auth" || err.kind === "quota")) {
        if (err.kind === "auth") {
          await db.gmailAccount.update({ where: { id: account.id }, data: { needsReconnect: true } });
        }
        failed.push(...toInvite.slice(toInvite.indexOf(email) + 1));
        break;
      }
    }
  }

  revalidatePath("/dashboard/settings");
  const parts = [];
  if (sent.length) parts.push(`Invite sent to ${sent.length === 1 ? sent[0] : `${sent.length} people`}.`);
  if (already.size) parts.push(`${already.size} already in the workspace.`);
  if (failed.length) {
    const msg = `Couldn't send to ${failed.join(", ")}. ${parts.join(" ")}`.trim();
    return { ok: false, error: msg };
  }
  return { ok: true, message: parts.join(" ") };
}

export async function revokeInvite(inviteId: string) {
  const { workspace, role } = await requireWorkspace();
  if (!canManage(role)) return;
  await db.invite.updateMany({
    where: { id: inviteId, workspaceId: workspace.id },
    data: { revokedAt: new Date() },
  });
  revalidatePath("/dashboard/settings");
}

export async function removeMember(userId: string) {
  const { user, workspace, role } = await requireWorkspace();
  const target = await db.member.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: workspace.id } },
  });
  if (!target || target.role === "OWNER") return;
  // Anyone may leave; only managers may remove others.
  if (userId !== user.id && !canManage(role)) return;

  await db.member.delete({ where: { userId_workspaceId: { userId, workspaceId: workspace.id } } });
  revalidatePath("/dashboard", "layout");
}

export async function acceptInvite(token: string) {
  const user = await requireUser();
  const invite = await db.invite.findUnique({ where: { token } });
  if (!invite || invite.revokedAt || invite.acceptedAt || invite.expiresAt < new Date()) redirect(`/invite/${token}`);

  if (invite.email) {
    // Emailed invites belong to one address and work once.
    if (invite.email !== user.email?.toLowerCase()) redirect(`/invite/${token}`);
    const { count } = await db.invite.updateMany({
      where: { id: invite.id, acceptedAt: null },
      data: { acceptedAt: new Date() },
    });
    if (count === 0) redirect(`/invite/${token}`);
  }

  await db.member.upsert({
    where: { userId_workspaceId: { userId: user.id, workspaceId: invite.workspaceId } },
    create: { userId: user.id, workspaceId: invite.workspaceId, role: invite.role },
    update: {},
  });
  await setWorkspaceCookie(invite.workspaceId);
  redirect("/dashboard");
}

// ─── Gmail ───────────────────────────────────────────────────────────

export async function disconnectGmail(accountId: string) {
  const user = await requireUser();
  const account = await db.gmailAccount.findFirst({ where: { id: accountId, userId: user.id } });
  if (!account) return;
  await revokeRefreshToken(account.encryptedRefreshToken);
  await db.gmailAccount.delete({ where: { id: account.id } });
  revalidatePath("/dashboard", "layout");
}

export async function updateDailyLimit(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = z
    .object({
      accountId: z.string().min(1),
      dailyLimit: z.coerce.number().int().min(1).max(MAX_DAILY_LIMIT, `Keep it at ${MAX_DAILY_LIMIT} or below.`),
    })
    .safeParse({ accountId: form.get("accountId"), dailyLimit: form.get("dailyLimit") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const { count } = await db.gmailAccount.updateMany({
    where: { id: parsed.data.accountId, userId: user.id },
    data: { dailyLimit: parsed.data.dailyLimit },
  });
  if (count === 0) return { ok: false, error: "That account isn't connected anymore." };
  revalidatePath("/dashboard/settings");
  return { ok: true, message: "Saved." };
}
