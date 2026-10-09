"use server";

import { generateToken } from "@ripple/shared";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/workspace";

/**
 * Starts a draft campaign addressed to the people behind the given sent emails. If they all came
 * from one campaign, the subject continues that thread with "Re:".
 */
export async function startFollowUp(messageIds: string[], listName: string) {
  const { user, workspace } = await requireWorkspace();
  const ids = z.array(z.string()).min(1).max(2000).parse(messageIds);

  const messages = await db.message.findMany({
    where: { id: { in: ids }, workspaceId: workspace.id, contactId: { not: null } },
    select: { contactId: true, toEmail: true, campaign: { select: { subject: true, gmailAccountId: true } } },
  });
  if (!messages.length) return;

  const contacts = new Map(messages.map((m) => [m.contactId!, m.toEmail]));
  const subjects = new Set(messages.map((m) => m.campaign?.subject ?? ""));
  const original = subjects.size === 1 ? [...subjects][0] : "";
  const subject = original ? (original.toLowerCase().startsWith("re:") ? original : `Re: ${original}`) : "";
  // Reuse the original sender only if it's the current user's own mailbox.
  const own = await db.gmailAccount.findMany({ where: { userId: user.id }, select: { id: true } });
  const ownIds = new Set(own.map((a) => a.id));
  const gmailAccountId =
    messages.map((m) => m.campaign?.gmailAccountId).find((id): id is string => !!id && ownIds.has(id)) ??
    own[0]?.id ??
    null;

  const campaign = await db.campaign.create({
    data: {
      workspaceId: workspace.id,
      createdById: user.id,
      name: `Follow-up: ${listName}`,
      tag: "follow-up",
      subject,
      body: "",
      gmailAccountId,
      messages: {
        create: [...contacts].map(([contactId, toEmail]) => ({
          token: generateToken(),
          workspaceId: workspace.id,
          contactId,
          toEmail,
          subject,
          gmailAccountId,
          source: "WEB" as const,
        })),
      },
    },
    select: { id: true },
  });
  redirect(`/dashboard/campaigns/${campaign.id}`);
}
