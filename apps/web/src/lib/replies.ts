import "server-only";
import { db } from "@/lib/db";
import { getMessage, getThread, getThreadId, GmailReadError, searchMessages } from "@/lib/gmail-read";
import { accessTokenFor, GoogleAuthError } from "@/lib/google";

/** How far back the first sync looks, and how much overlap later syncs keep. */
const FIRST_SYNC_DAYS = 30;
const OVERLAP_MS = 24 * 60 * 60 * 1000;
/** Older sent emails don't have a thread ID stored yet; look a few up on each sync. */
const BACKFILL_PER_SYNC = 40;
const BOUNCE_SENDER = /^(mailer-daemon|postmaster)@/i;

type Account = { id: string; email: string; encryptedRefreshToken: string; repliesSyncedAt: Date | null };

/**
 * Finds replies to emails Ripple sent from one Gmail account and indexes them. Only threads Ripple
 * started are looked at: the search lists message and thread IDs, and only matches are opened.
 */
export async function syncAccount(account: Account): Promise<{ found: number }> {
  let token: string;
  try {
    token = await accessTokenFor(account.encryptedRefreshToken);
  } catch (err) {
    if (err instanceof GoogleAuthError && err.needsReconnect) {
      await db.gmailAccount.update({ where: { id: account.id }, data: { needsReconnect: true } });
    }
    throw err;
  }
  const startedAt = new Date();

  try {
    // Emails sent before thread IDs were stored.
    const missing = await db.message.findMany({
      where: {
        gmailAccountId: account.id,
        gmailMessageId: { not: null },
        gmailThreadId: null,
        sentAt: { gte: new Date(Date.now() - FIRST_SYNC_DAYS * 86_400_000) },
      },
      select: { id: true, gmailMessageId: true },
      take: BACKFILL_PER_SYNC,
    });
    for (const m of missing) {
      const threadId = await getThreadId(token, m.gmailMessageId!).catch((err) => {
        if (err instanceof GmailReadError && err.kind === "notfound") return "";
        throw err;
      });
      // "gone": deleted from Gmail, so don't look it up again.
      await db.message.update({ where: { id: m.id }, data: { gmailThreadId: threadId || "gone" } });
    }

    const since = account.repliesSyncedAt
      ? new Date(account.repliesSyncedAt.getTime() - OVERLAP_MS)
      : new Date(Date.now() - FIRST_SYNC_DAYS * 86_400_000);
    const candidates = await searchMessages(token, `-from:me after:${Math.floor(since.getTime() / 1000)}`);
    if (!candidates.length) return { found: 0 };

    const ours = await db.message.findMany({
      where: { gmailAccountId: account.id, gmailThreadId: { in: [...new Set(candidates.map((c) => c.threadId))] } },
      select: { id: true, gmailThreadId: true, repliedAt: true },
    });
    const byThread = new Map(ours.map((m) => [m.gmailThreadId!, m]));
    const relevant = candidates.filter((c) => byThread.has(c.threadId));
    const known = new Set(
      (
        await db.reply.findMany({
          where: { gmailMessageId: { in: relevant.map((c) => c.id) } },
          select: { gmailMessageId: true },
        })
      ).map((r) => r.gmailMessageId),
    );

    let found = 0;
    for (const c of relevant.filter((c) => !known.has(c.id))) {
      const mail = await getMessage(token, c.id, account.email);
      if (mail.fromMe || BOUNCE_SENDER.test(mail.from.email)) continue;
      const message = byThread.get(c.threadId)!;
      await db.reply.create({
        data: {
          messageId: message.id,
          gmailMessageId: mail.id,
          fromEmail: mail.from.email,
          fromName: mail.from.name,
          snippet: (mail.snippet || mail.text).slice(0, 300),
          receivedAt: mail.date,
        },
      });
      if (!message.repliedAt || message.repliedAt > mail.date) {
        await db.message.update({ where: { id: message.id }, data: { repliedAt: mail.date } });
        message.repliedAt = mail.date;
      }
      found++;
    }
    return { found };
  } catch (err) {
    if (err instanceof GmailReadError && err.kind === "scope") {
      await db.gmailAccount.update({ where: { id: account.id }, data: { canRead: false } });
    } else if (err instanceof GmailReadError && err.kind === "auth") {
      await db.gmailAccount.update({ where: { id: account.id }, data: { needsReconnect: true } });
    }
    throw err;
  } finally {
    await db.gmailAccount
      .update({ where: { id: account.id }, data: { repliesSyncedAt: startedAt } })
      .catch(() => undefined);
  }
}

const readableAccount = { canRead: true, needsReconnect: false } as const;
const accountFields = { id: true, email: true, encryptedRefreshToken: true, repliesSyncedAt: true } as const;

/** Syncs the accounts that have waited longest, for the cron. */
export async function syncStaleAccounts({ staleMs = 5 * 60_000, budgetMs = 20_000, limit = 10 } = {}) {
  const started = Date.now();
  const accounts = await db.gmailAccount.findMany({
    where: {
      ...readableAccount,
      OR: [{ repliesSyncedAt: null }, { repliesSyncedAt: { lt: new Date(Date.now() - staleMs) } }],
    },
    orderBy: { repliesSyncedAt: { sort: "asc", nulls: "first" } },
    select: accountFields,
    take: limit,
  });
  let found = 0;
  let synced = 0;
  for (const account of accounts) {
    if (Date.now() - started > budgetMs) break;
    try {
      found += (await syncAccount(account)).found;
      synced++;
    } catch (err) {
      console.error(`reply sync failed for ${account.id}`, err);
    }
  }
  return { synced, found };
}

/** Syncs one user's accounts when they open their replies, if it's been a little while. */
export async function syncUserAccounts(userId: string, staleMs = 60_000) {
  const accounts = await db.gmailAccount.findMany({
    where: {
      userId,
      ...readableAccount,
      OR: [{ repliesSyncedAt: null }, { repliesSyncedAt: { lt: new Date(Date.now() - staleMs) } }],
    },
    select: accountFields,
  });
  for (const account of accounts) {
    await syncAccount(account).catch((err) => console.error(`reply sync failed for ${account.id}`, err));
  }
}

/**
 * One conversation for its sender: the Ripple email plus the live Gmail thread. Returns null when
 * the email isn't theirs, so nobody else in the workspace can open it.
 */
export async function loadConversation(messageId: string, userId: string, workspaceId: string) {
  const message = await db.message.findFirst({
    where: { id: messageId, workspaceId, gmailAccount: { userId } },
    select: {
      id: true,
      subject: true,
      toEmail: true,
      gmailThreadId: true,
      sentAt: true,
      campaign: { select: { id: true, name: true } },
      contact: { select: { name: true, org: true } },
      gmailAccount: { select: { id: true, email: true, encryptedRefreshToken: true, canRead: true } },
    },
  });
  if (!message?.gmailAccount) return null;
  const account = message.gmailAccount;
  if (!message.gmailThreadId || message.gmailThreadId === "gone" || !account.canRead) {
    return { message, account, items: null };
  }
  const token = await accessTokenFor(account.encryptedRefreshToken);
  const items = await getThread(token, message.gmailThreadId, account.email);
  return { message, account, items, token };
}
