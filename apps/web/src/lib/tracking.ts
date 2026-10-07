import { classify, isValidToken, type Classification } from "@ripple/shared";
import { db } from "@/lib/db";

// 1x1 transparent GIF.
export const PIXEL_GIF = Uint8Array.from(
  atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
  (c) => c.charCodeAt(0),
);

export const NO_STORE_HEADERS = {
  // Proxies (Gmail especially) must re-fetch on every open, or repeat opens vanish.
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0, private",
  Pragma: "no-cache",
  Expires: "0",
};

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
  at: Date;
}

export function requestMeta(request: Request): RequestMeta {
  const forwarded = request.headers.get("x-forwarded-for");
  return {
    ip: forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip"),
    userAgent: request.headers.get("user-agent"),
    at: new Date(),
  };
}

export type ClassifiedOpen = { messageId: string; classification: Classification };

/** Looks up the message and classifies the fetch, so the route can decide how to answer it. */
export async function classifyOpen(token: string, meta: RequestMeta): Promise<ClassifiedOpen | null> {
  if (!isValidToken(token)) return null;
  const message = await db.message.findUnique({
    where: { token },
    select: {
      id: true,
      sentAt: true,
      _count: { select: { events: { where: { type: "OPEN", client: "gmail" } } } },
    },
  });
  if (!message) return null;
  return {
    messageId: message.id,
    classification: classify({
      userAgent: meta.userAgent,
      ip: meta.ip,
      at: meta.at,
      sentAt: message.sentAt,
      priorGmailFetches: message._count.events,
    }),
  };
}

export async function saveOpen({ messageId, classification }: ClassifiedOpen, meta: RequestMeta) {
  await db.event.create({
    data: {
      messageId,
      type: "OPEN",
      at: meta.at,
      ip: meta.ip,
      userAgent: meta.userAgent,
      ...classification,
    },
  });
}

export async function findLink(token: string, index: number) {
  if (!isValidToken(token) || !Number.isInteger(index) || index < 0) return null;
  return db.link.findFirst({
    where: { index, message: { token } },
    select: { id: true, url: true, messageId: true, message: { select: { sentAt: true } } },
  });
}

export async function recordClick(
  link: NonNullable<Awaited<ReturnType<typeof findLink>>>,
  meta: RequestMeta,
): Promise<void> {
  const c = classify({ userAgent: meta.userAgent, ip: meta.ip, at: meta.at, sentAt: link.message.sentAt });
  await db.event.create({
    data: {
      messageId: link.messageId,
      linkId: link.id,
      type: "CLICK",
      at: meta.at,
      ip: meta.ip,
      userAgent: meta.userAgent,
      ...c,
    },
  });
}
