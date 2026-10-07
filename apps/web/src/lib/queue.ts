import "server-only";
import { contactVars, instrumentHtml, renderTemplate, textToHtml, textToPlain } from "@ripple/shared";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { GmailSendError, sendViaGmail } from "@/lib/gmail-send";
import { accessTokenFor, appUrl, GoogleAuthError } from "@/lib/google";

const DAY_MS = 86_400_000;
const STALE_CLAIM_MS = 10 * 60_000;
/** Pause between sends from one account, so bursts don't look automated. */
const GAP_MS: [number, number] = [1_500, 4_000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = () => GAP_MS[0] + Math.random() * (GAP_MS[1] - GAP_MS[0]);

function eligible(now: Date): Prisma.MessageWhereInput {
  return {
    status: "QUEUED",
    campaign: {
      status: { in: ["SCHEDULED", "SENDING"] },
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
    },
    gmailAccount: { needsReconnect: false },
  };
}

export async function sentInLastDay(gmailAccountId: string) {
  return db.message.count({
    where: { gmailAccountId, status: "SENT", sentAt: { gt: new Date(Date.now() - DAY_MS) } },
  });
}

export interface QueueRun {
  sent: number;
  failed: number;
  deferred: number;
}

/**
 * Sends queued campaign messages until the time budget runs out, respecting each Gmail account's
 * rolling 24-hour limit. Safe to run concurrently: messages are claimed atomically.
 */
export async function processQueue({ budgetMs = 45_000 } = {}): Promise<QueueRun> {
  const deadline = Date.now() + budgetMs;
  const run: QueueRun = { sent: 0, failed: 0, deferred: 0 };
  const now = new Date();

  await db.message.updateMany({
    where: { status: "SENDING", claimedAt: { lt: new Date(Date.now() - STALE_CLAIM_MS) } },
    data: { status: "QUEUED", claimedAt: null },
  });

  const groups = await db.message.groupBy({ by: ["gmailAccountId"], where: eligible(now) });

  for (const { gmailAccountId } of groups) {
    if (!gmailAccountId || Date.now() > deadline) continue;
    const account = await db.gmailAccount.findUnique({
      where: { id: gmailAccountId },
      include: { user: { select: { name: true } } },
    });
    if (!account) continue;

    let remaining = account.dailyLimit - (await sentInLastDay(account.id));
    if (remaining <= 0) continue;

    let accessToken: string;
    try {
      accessToken = await accessTokenFor(account.encryptedRefreshToken);
    } catch (err) {
      if (err instanceof GoogleAuthError && err.needsReconnect) {
        await db.gmailAccount.update({ where: { id: account.id }, data: { needsReconnect: true } });
      }
      console.error(`Token refresh failed for ${account.email}`, err);
      continue;
    }

    while (remaining > 0 && Date.now() < deadline) {
      const next = await db.message.findFirst({
        where: { ...eligible(new Date()), gmailAccountId: account.id },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (!next) break;

      const claimed = await db.message.updateMany({
        where: { id: next.id, status: "QUEUED" },
        data: { status: "SENDING", claimedAt: new Date() },
      });
      if (claimed.count === 0) continue; // another worker took it

      const outcome = await sendOne(next.id, accessToken, {
        email: account.email,
        name: account.user.name,
      });
      if (outcome === "sent") {
        run.sent++;
        remaining--;
      } else if (outcome === "failed") {
        run.failed++;
      } else {
        run.deferred++;
        if (outcome === "auth") {
          await db.gmailAccount.update({ where: { id: account.id }, data: { needsReconnect: true } });
        }
        break; // quota, auth or transient: stop this account for now
      }
      if (remaining > 0 && Date.now() + GAP_MS[1] < deadline) await sleep(jitter());
    }
  }

  await finishCampaigns();
  return run;
}

type Outcome = "sent" | "failed" | "auth" | "quota" | "transient";

async function sendOne(
  messageId: string,
  accessToken: string,
  from: { email: string; name: string | null },
): Promise<Outcome> {
  const message = await db.message.findUniqueOrThrow({
    where: { id: messageId },
    include: { campaign: true, contact: true },
  });
  const campaign = message.campaign!;
  const vars = message.contact
    ? contactVars({
        email: message.contact.email,
        name: message.contact.name,
        org: message.contact.org,
        fields: message.contact.fields as Record<string, unknown> | null,
      })
    : { email: message.toEmail };

  const subject = renderTemplate(campaign.subject, vars).output;
  const bodyText = renderTemplate(campaign.body, vars).output;
  const { html, links } = instrumentHtml(textToHtml(bodyText), {
    baseUrl: appUrl(),
    token: message.token,
    trackClicks: campaign.trackClicks,
  });

  // Links must exist before the email can be clicked. Recreate on retry.
  await db.link.deleteMany({ where: { messageId } });
  if (links.length) {
    await db.link.createMany({ data: links.map((l) => ({ messageId, index: l.index, url: l.url })) });
  }

  try {
    const { id } = await sendViaGmail(accessToken, {
      from,
      to: { email: message.toEmail, name: message.contact?.name },
      subject,
      html,
      text: textToPlain(bodyText),
    });
    const sentAt = new Date();
    await db.message.update({
      where: { id: messageId },
      data: { status: "SENT", sentAt, subject, gmailMessageId: id, error: null },
    });
    if (!campaign.startedAt || campaign.status !== "SENDING") {
      await db.campaign.update({
        where: { id: campaign.id },
        data: { status: "SENDING", startedAt: campaign.startedAt ?? sentAt },
      });
    }
    return "sent";
  } catch (err) {
    const kind = err instanceof GmailSendError ? err.kind : "transient";
    const errorText = (err as Error).message.slice(0, 500);
    await db.message.update({
      where: { id: messageId },
      data:
        kind === "permanent"
          ? { status: "FAILED", error: errorText, claimedAt: null }
          : { status: "QUEUED", error: errorText, claimedAt: null },
    });
    return kind === "permanent" ? "failed" : kind;
  }
}

async function finishCampaigns() {
  const active = await db.campaign.findMany({
    where: {
      status: "SENDING",
      messages: { none: { status: { in: ["QUEUED", "SENDING"] } } },
    },
    select: { id: true },
  });
  if (active.length) {
    await db.campaign.updateMany({
      where: { id: { in: active.map((c) => c.id) } },
      data: { status: "SENT", completedAt: new Date() },
    });
  }
}
