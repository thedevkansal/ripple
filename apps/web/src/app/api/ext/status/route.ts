import { summarize } from "@ripple/shared";
import { z } from "zod";
import { db } from "@/lib/db";
import { authenticateExtension, unauthorized } from "@/lib/extension-auth";

const bodySchema = z.object({
  /** Tokens found in emails the user is looking at. */
  tokens: z.array(z.string().max(64)).max(100).default([]),
  /** Also return the user's recent extension emails, for ticks in the Sent list. */
  recent: z.boolean().default(false),
});

const DAY = 86_400_000;

/** Read status for the badges and Sent-list ticks the extension draws inside Gmail. */
export async function POST(request: Request) {
  const auth = await authenticateExtension(request);
  if (!auth) return unauthorized();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  const { tokens, recent } = parsed.data;

  const messages = await db.message.findMany({
    where: {
      workspaceId: auth.workspaceId,
      status: "SENT",
      OR: [
        ...(tokens.length ? [{ token: { in: tokens } }] : []),
        ...(recent
          ? [{ senderUserId: auth.userId, sentAt: { gte: new Date(Date.now() - 30 * DAY) } }]
          : []),
      ],
    },
    orderBy: { sentAt: "desc" },
    take: 300,
    select: {
      token: true,
      toEmail: true,
      cc: true,
      subject: true,
      sentAt: true,
      events: { select: { type: true, at: true, isPrefetch: true, isBot: true, isSelf: true } },
    },
  });
  if (!tokens.length && !recent) return Response.json({ messages: [] });

  return Response.json({
    messages: messages.map((m) => {
      const s = summarize(
        m.events.map((e) => ({ ...e, type: e.type === "OPEN" ? ("open" as const) : ("click" as const) })),
        m.sentAt,
      );
      return {
        token: m.token,
        to: [m.toEmail, ...m.cc],
        subject: m.subject,
        sentAt: m.sentAt,
        opens: s.opens,
        clicks: s.clicks,
        lastOpenAt: s.lastOpenAt,
        maybe: s.onlyPrefetched,
      };
    }),
  });
}
