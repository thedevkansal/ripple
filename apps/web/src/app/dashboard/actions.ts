"use server";

import { generateToken } from "@ripple/shared";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { signOut } from "@/auth";
import { db } from "@/lib/db";
import { revokeRefreshToken } from "@/lib/google";
import {
  canManage,
  requireUser,
  requireWorkspace,
  WORKSPACE_COOKIE,
} from "@/lib/workspace";

const INVITE_TTL_DAYS = 7;
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
  if (!invite || invite.revokedAt || invite.expiresAt < new Date()) redirect(`/invite/${token}`);

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
