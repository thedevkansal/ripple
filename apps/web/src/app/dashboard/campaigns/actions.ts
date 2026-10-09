"use server";

import { contactVars, generateToken } from "@ripple/shared";
import { del, head } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { type AttachmentInfo, isOwnBlobUrl, MAX_TOTAL_BYTES } from "@/lib/attachments";
import { composeEmail, createFileLoader } from "@/lib/compose";
import { db } from "@/lib/db";
import { GmailSendError, sendViaGmail } from "@/lib/gmail-send";
import { accessTokenFor } from "@/lib/google";
import { processQueue } from "@/lib/queue";
import { requireWorkspace } from "@/lib/workspace";

const MAX_RECIPIENTS = 2000;

const recipientSchema = z.object({
  email: z.email().max(254).transform((e) => e.toLowerCase()),
  name: z.string().trim().max(120).optional(),
  org: z.string().trim().max(120).optional(),
  fields: z.record(z.string().max(60), z.string().max(500)).optional(),
  cc: z.array(z.email().transform((e) => e.toLowerCase())).max(10).optional(),
});
export type RecipientInput = z.input<typeof recipientSchema>;

const campaignSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Give the campaign a name.").max(80),
  tag: z.string().trim().toLowerCase().max(40).optional(),
  gmailAccountId: z.string().optional(),
  subject: z.string().trim().max(200),
  body: z.string().max(20_000),
  trackClicks: z.boolean(),
  /** New recipients from a CSV upload. */
  recipients: z.array(recipientSchema).max(MAX_RECIPIENTS),
  attachmentIds: z.array(z.string()).max(10),
  linkAttachments: z.boolean(),
  /** CC on every email, e.g. a shared team inbox. */
  cc: z.array(z.email().transform((e) => e.toLowerCase())).max(10),
});
export type CampaignInput = z.input<typeof campaignSchema>;

export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

// ─── Attachments ─────────────────────────────────────────────────────

const uploadedSchema = z.object({ url: z.url(), name: z.string().trim().min(1).max(200) });

/** Records a file the browser just uploaded to Blob. Size and type come from Blob, not the client. */
export async function registerAttachment(
  input: z.input<typeof uploadedSchema>,
): Promise<{ ok: true; attachment: AttachmentInfo } | { ok: false; error: string }> {
  const { user, workspace } = await requireWorkspace();
  const parsed = uploadedSchema.safeParse(input);
  if (!parsed.success || !isOwnBlobUrl(parsed.data.url, workspace.id)) return { ok: false, error: "Upload didn't finish. Try again." };

  const blob = await head(parsed.data.url).catch(() => null);
  if (!blob) return { ok: false, error: "Upload didn't finish. Try again." };

  const attachment = await db.attachment.create({
    data: {
      workspaceId: workspace.id,
      createdById: user.id,
      name: parsed.data.name,
      contentType: blob.contentType,
      size: blob.size,
      url: blob.url,
    },
    select: { id: true, name: true, size: true, contentType: true, url: true },
  });
  return { ok: true, attachment };
}

/** Removes a file that isn't part of a launched campaign. */
export async function removeAttachment(id: string) {
  const { workspace } = await requireWorkspace();
  const attachment = await db.attachment.findFirst({
    where: {
      id,
      workspaceId: workspace.id,
      OR: [{ campaignId: null }, { campaign: { status: "DRAFT" } }],
    },
  });
  if (!attachment) return;
  await db.attachment.delete({ where: { id } });
  await del(attachment.url).catch((err) => console.error("blob delete failed", err));
}

/** Upserts contacts into the workspace, merging tags and fields with what's already there. */
async function upsertContacts(workspaceId: string, rows: z.output<typeof recipientSchema>[]) {
  const existing = await db.contact.findMany({
    where: { workspaceId, email: { in: rows.map((r) => r.email) } },
    select: { id: true, email: true, ccEmails: true, fields: true },
  });
  const byEmail = new Map(existing.map((c) => [c.email, c]));

  const fresh = rows.filter((r) => !byEmail.has(r.email));
  if (fresh.length) {
    await db.contact.createMany({
      data: fresh.map((r) => ({
        workspaceId,
        email: r.email,
        name: r.name,
        org: r.org,
        ccEmails: r.cc ?? [],
        fields: (r.fields ?? undefined) as Prisma.InputJsonValue | undefined,
      })),
      skipDuplicates: true,
    });
  }

  const updates = rows.flatMap((r) => {
    const prev = byEmail.get(r.email);
    if (!prev) return [];
    return [
      db.contact.update({
        where: { id: prev.id },
        data: {
          ...(r.name && { name: r.name }),
          ...(r.org && { org: r.org }),
          ccEmails: [...new Set([...prev.ccEmails, ...(r.cc ?? [])])],
          fields: { ...((prev.fields as Record<string, string>) ?? {}), ...(r.fields ?? {}) },
        },
        select: { id: true },
      }),
    ];
  });
  if (updates.length) await db.$transaction(updates);

  const all = await db.contact.findMany({
    where: { workspaceId, email: { in: rows.map((r) => r.email) } },
    select: { id: true },
  });
  return all.map((c) => c.id);
}

export async function importContacts(rows: RecipientInput[]): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const { workspace } = await requireWorkspace();
  const parsed = z.array(recipientSchema).max(MAX_RECIPIENTS).safeParse(rows);
  if (!parsed.success) return { ok: false, error: "Some rows aren't valid. Check the email column." };
  const ids = await upsertContacts(workspace.id, parsed.data);
  revalidatePath("/dashboard/contacts");
  return { ok: true, count: ids.length };
}

/** Creates or updates a draft and its recipient list. */
export async function saveCampaign(input: CampaignInput): Promise<SaveResult> {
  const { user, workspace } = await requireWorkspace();
  const parsed = campaignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const data = parsed.data;

  if (data.gmailAccountId) {
    const owns = await db.gmailAccount.count({ where: { id: data.gmailAccountId, userId: user.id } });
    if (!owns) return { ok: false, error: "Pick one of your connected Gmail accounts." };
  }

  const campaignId = data.id;
  if (campaignId) {
    const existing = await db.campaign.findFirst({ where: { id: campaignId, workspaceId: workspace.id } });
    if (!existing) return { ok: false, error: "That campaign no longer exists." };
    if (existing.status !== "DRAFT") return { ok: false, error: "Only drafts can be edited." };
  }

  const files = await db.attachment.findMany({
    where: {
      id: { in: data.attachmentIds },
      workspaceId: workspace.id,
      OR: [{ campaignId: null }, ...(campaignId ? [{ campaignId }] : [])],
    },
    select: { id: true, size: true },
  });
  if (files.reduce((n, f) => n + f.size, 0) > MAX_TOTAL_BYTES) {
    return { ok: false, error: `Attachments add up to more than ${MAX_TOTAL_BYTES / 1024 / 1024} MB. Remove one.` };
  }

  const contactIds = (await upsertContacts(workspace.id, data.recipients)).slice(0, MAX_RECIPIENTS);
  const contacts = await db.contact.findMany({
    where: { id: { in: contactIds } },
    select: { id: true, email: true },
  });

  const fields = {
    name: data.name,
    tag: data.tag || null,
    gmailAccountId: data.gmailAccountId || null,
    subject: data.subject,
    body: data.body,
    trackClicks: data.trackClicks,
    linkAttachments: data.linkAttachments,
    cc: [...new Set(data.cc)],
  };

  const removed = campaignId
    ? await db.attachment.findMany({
        where: { campaignId, id: { notIn: files.map((f) => f.id) } },
        select: { id: true, url: true },
      })
    : [];

  const id = await db.$transaction(async (tx) => {
    const campaign = campaignId
      ? await tx.campaign.update({ where: { id: campaignId }, data: fields })
      : await tx.campaign.create({
          data: { ...fields, workspaceId: workspace.id, createdById: user.id },
        });

    // Drafts have no sent messages, so the recipient list can simply be rebuilt.
    await tx.message.deleteMany({ where: { campaignId: campaign.id, status: "QUEUED" } });
    await tx.message.createMany({
      data: contacts.map((c) => ({
        token: generateToken(),
        workspaceId: workspace.id,
        campaignId: campaign.id,
        gmailAccountId: fields.gmailAccountId,
        contactId: c.id,
        toEmail: c.email,
        subject: data.subject,
        source: "WEB" as const,
      })),
    });

    await tx.attachment.updateMany({
      where: { id: { in: files.map((f) => f.id) } },
      data: { campaignId: campaign.id },
    });
    if (removed.length) await tx.attachment.deleteMany({ where: { id: { in: removed.map((r) => r.id) } } });
    return campaign.id;
  });

  if (removed.length) await del(removed.map((r) => r.url)).catch((err) => console.error("blob delete failed", err));
  revalidatePath("/dashboard/campaigns");
  return { ok: true, id };
}

async function loadOwnedCampaign(id: string) {
  const { user, workspace } = await requireWorkspace();
  const campaign = await db.campaign.findFirst({
    where: { id, workspaceId: workspace.id },
    include: { gmailAccount: true, _count: { select: { messages: true } } },
  });
  return { user, campaign };
}

export async function launchCampaign(id: string, scheduledAtIso?: string): Promise<SaveResult> {
  const { user, campaign } = await loadOwnedCampaign(id);
  if (!campaign) return { ok: false, error: "That campaign no longer exists." };
  if (campaign.status !== "DRAFT") return { ok: false, error: "This campaign was already launched." };
  if (!campaign.gmailAccount || campaign.gmailAccount.userId !== user.id)
    return { ok: false, error: "Choose one of your Gmail accounts to send from." };
  if (campaign.gmailAccount.needsReconnect)
    return { ok: false, error: `Reconnect ${campaign.gmailAccount.email} in Settings first.` };
  if (!campaign.subject.trim() || !campaign.body.trim())
    return { ok: false, error: "Add a subject and a message first." };
  if (campaign._count.messages === 0) return { ok: false, error: "Add at least one recipient." };

  const scheduledAt = scheduledAtIso ? new Date(scheduledAtIso) : null;
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) return { ok: false, error: "That date isn't valid." };

  await db.$transaction([
    db.message.updateMany({
      where: { campaignId: id, status: "QUEUED" },
      data: { gmailAccountId: campaign.gmailAccountId },
    }),
    db.campaign.update({ where: { id }, data: { status: "SCHEDULED", scheduledAt } }),
  ]);

  // Start sending right away; scheduled runs pick up anything left.
  if (!scheduledAt || scheduledAt <= new Date()) {
    after(() => processQueue({ budgetMs: 50_000 }).catch((err) => console.error("processQueue", err)));
  }
  revalidatePath("/dashboard", "layout");
  return { ok: true, id };
}

export async function setCampaignPaused(id: string, paused: boolean) {
  const { campaign } = await loadOwnedCampaign(id);
  if (!campaign) return;
  if (paused && ["SCHEDULED", "SENDING"].includes(campaign.status)) {
    await db.campaign.update({ where: { id }, data: { status: "PAUSED" } });
  } else if (!paused && campaign.status === "PAUSED") {
    await db.campaign.update({ where: { id }, data: { status: campaign.startedAt ? "SENDING" : "SCHEDULED" } });
    after(() => processQueue({ budgetMs: 50_000 }).catch((err) => console.error("processQueue", err)));
  }
  revalidatePath(`/dashboard/campaigns/${id}`);
}

/** Stops a campaign for good: unsent emails are cancelled. */
export async function stopCampaign(id: string) {
  const { campaign } = await loadOwnedCampaign(id);
  if (!campaign || campaign.status === "DRAFT" || campaign.status === "SENT") return;
  await db.$transaction([
    db.message.updateMany({ where: { campaignId: id, status: "QUEUED" }, data: { status: "CANCELLED" } }),
    db.campaign.update({ where: { id }, data: { status: "SENT", completedAt: new Date() } }),
  ]);
  revalidatePath(`/dashboard/campaigns/${id}`);
}

export async function deleteDraft(id: string) {
  const { campaign } = await loadOwnedCampaign(id);
  if (!campaign || campaign.status !== "DRAFT") return;
  await db.campaign.delete({ where: { id } });
  revalidatePath("/dashboard/campaigns");
  redirect("/dashboard/campaigns");
}

/** Sends one untracked copy, filled with the first recipient's details, to the signed-in user. */
export async function sendTest(id: string): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  const { user, campaign } = await loadOwnedCampaign(id);
  if (!campaign) return { ok: false, error: "Save the campaign first." };
  const account = campaign.gmailAccount;
  if (!account || account.userId !== user.id) return { ok: false, error: "Choose a Gmail account to send from." };
  if (!user.email) return { ok: false, error: "Your account has no email address." };

  const sample = await db.message.findFirst({
    where: { campaignId: id },
    orderBy: { createdAt: "asc" },
    include: { contact: true },
  });
  const vars = sample?.contact
    ? contactVars({
        email: sample.contact.email,
        name: sample.contact.name,
        org: sample.contact.org,
        fields: sample.contact.fields as Record<string, unknown> | null,
      })
    : { email: user.email };

  try {
    const attachments = await db.attachment.findMany({ where: { campaignId: id } });
    const email = await composeEmail({ ...campaign, attachments }, vars, null, createFileLoader());
    await sendViaGmail(await accessTokenFor(account.encryptedRefreshToken), {
      from: { email: account.email, name: user.name },
      to: { email: user.email, name: user.name },
      subject: `[Test] ${email.subject}`,
      html: email.html,
      text: email.text,
      attachments: email.attachments,
    });
    return { ok: true, to: user.email };
  } catch (err) {
    const msg = err instanceof GmailSendError ? err.message : "Google rejected the request. Reconnect Gmail and retry.";
    return { ok: false, error: msg };
  }
}
