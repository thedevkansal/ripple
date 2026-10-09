import "server-only";
import { summarize } from "@ripple/shared";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { TZ_COOKIE } from "@/lib/theme";

export const RANGES = { "7": 7, "30": 30, "90": 90, all: null } as const;
export type RangeKey = keyof typeof RANGES;

export function parseRange(value: unknown): RangeKey {
  return typeof value === "string" && value in RANGES ? (value as RangeKey) : "30";
}

/** The viewer's IANA timezone from the cookie the head script sets; UTC if missing or invalid. */
export async function viewerTimeZone(): Promise<string> {
  const tz = decodeURIComponent((await cookies()).get(TZ_COOKIE)?.value ?? "");
  try {
    if (tz) {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return tz;
    }
  } catch {
    // Unknown zone name: fall through.
  }
  return "UTC";
}

const DAY = 86_400_000;
/** "All time" still needs a start for the daily chart; nothing predates Ripple. */
const EPOCH = new Date("2026-01-01T00:00:00Z");

export interface Window {
  from: Date;
  to: Date;
  /** The equal-length window before this one, for deltas. Null for "all time". */
  previous: { from: Date; to: Date } | null;
}

export function windowFor(range: RangeKey, now = new Date()): Window {
  const days = RANGES[range];
  if (days === null) return { from: EPOCH, to: now, previous: null };
  const from = new Date(now.getTime() - days * DAY);
  return { from, to: now, previous: { from: new Date(from.getTime() - days * DAY), to: from } };
}

// ─── KPIs ────────────────────────────────────────────────────────────

export interface Totals {
  sent: number;
  opened: number;
  clicked: number;
  openedFiles: number;
}

/** Emails sent in the window, and how many of them got a real open, click or file open (ever). */
export async function totals(workspaceId: string, from: Date, to: Date): Promise<Totals> {
  const [row] = await db.$queryRaw<{ sent: bigint; opened: bigint; clicked: bigint; files: bigint }[]>`
    WITH m AS (
      SELECT id FROM "Message"
      WHERE "workspaceId" = ${workspaceId} AND status = 'SENT' AND "sentAt" >= ${from} AND "sentAt" < ${to}
    )
    SELECT
      (SELECT count(*) FROM m) AS sent,
      count(DISTINCT e."messageId") FILTER (WHERE e.type = 'OPEN') AS opened,
      count(DISTINCT e."messageId") FILTER (WHERE e.type = 'CLICK') AS clicked,
      count(DISTINCT e."messageId") FILTER (WHERE e.type = 'CLICK' AND a.id IS NOT NULL) AS files
    FROM "Event" e
    JOIN m ON m.id = e."messageId"
    LEFT JOIN "Link" l ON l.id = e."linkId"
    LEFT JOIN "Attachment" a ON a.url = l.url
    WHERE NOT e."isPrefetch" AND NOT e."isBot" AND NOT e."isSelf"`;
  return {
    sent: Number(row.sent),
    opened: Number(row.opened),
    clicked: Number(row.clicked),
    openedFiles: Number(row.files),
  };
}

// ─── Activity over time ──────────────────────────────────────────────

export interface DayPoint {
  day: string; // YYYY-MM-DD in the viewer's zone
  sent: number;
  opened: number;
  clicked: number;
}

export async function dailyActivity(workspaceId: string, from: Date, to: Date, tz: string): Promise<DayPoint[]> {
  const [sends, events] = await Promise.all([
    db.$queryRaw<{ d: string; n: bigint }[]>`
      SELECT to_char(("sentAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS d, count(*) AS n
      FROM "Message"
      WHERE "workspaceId" = ${workspaceId} AND status = 'SENT' AND "sentAt" >= ${from} AND "sentAt" < ${to}
      GROUP BY 1`,
    db.$queryRaw<{ d: string; opened: bigint; clicked: bigint }[]>`
      SELECT to_char((e.at AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS d,
        count(DISTINCT e."messageId") FILTER (WHERE e.type = 'OPEN') AS opened,
        count(*) FILTER (WHERE e.type = 'CLICK') AS clicked
      FROM "Event" e JOIN "Message" m ON m.id = e."messageId"
      WHERE m."workspaceId" = ${workspaceId} AND e.at >= ${from} AND e.at < ${to}
        AND NOT e."isPrefetch" AND NOT e."isBot" AND NOT e."isSelf"
      GROUP BY 1`,
  ]);

  const byDay = new Map<string, DayPoint>();
  const key = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  // Start the chart at the first day with data for "all time", so it isn't mostly empty.
  const firstData = [...sends.map((r) => r.d), ...events.map((r) => r.d)].sort()[0];
  let cursor = from;
  if (firstData && from.getTime() === EPOCH.getTime()) cursor = new Date(`${firstData}T12:00:00Z`);
  for (let t = cursor.getTime(); t <= to.getTime() + DAY / 2; t += DAY / 2) {
    const d = key.format(new Date(t));
    if (!byDay.has(d) && d <= key.format(to)) byDay.set(d, { day: d, sent: 0, opened: 0, clicked: 0 });
  }
  for (const r of sends) {
    const p = byDay.get(r.d);
    if (p) p.sent = Number(r.n);
  }
  for (const r of events) {
    const p = byDay.get(r.d);
    if (p) {
      p.opened = Number(r.opened);
      p.clicked = Number(r.clicked);
    }
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

// ─── Best time to send ───────────────────────────────────────────────

/** Real opens by local weekday (1 = Monday) and hour, counting each email once per hour slot. */
export async function openHeatmap(workspaceId: string, from: Date, to: Date, tz: string) {
  const rows = await db.$queryRaw<{ dow: number; hour: number; n: bigint }[]>`
    SELECT extract(isodow FROM local)::int AS dow, extract(hour FROM local)::int AS hour,
      count(DISTINCT "messageId") AS n
    FROM (
      SELECT (e.at AT TIME ZONE 'UTC') AT TIME ZONE ${tz} AS local, e."messageId"
      FROM "Event" e JOIN "Message" m ON m.id = e."messageId"
      WHERE m."workspaceId" = ${workspaceId} AND e.type = 'OPEN' AND e.at >= ${from} AND e.at < ${to}
        AND NOT e."isPrefetch" AND NOT e."isBot" AND NOT e."isSelf"
    ) s
    GROUP BY 1, 2`;
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const r of rows) grid[r.dow - 1][r.hour] = Number(r.n);
  return grid;
}

// ─── Mail clients ────────────────────────────────────────────────────

export async function clientBreakdown(workspaceId: string, from: Date, to: Date) {
  const rows = await db.$queryRaw<{ client: string; n: bigint }[]>`
    SELECT e.client, count(DISTINCT e."messageId") AS n
    FROM "Event" e JOIN "Message" m ON m.id = e."messageId"
    WHERE m."workspaceId" = ${workspaceId} AND e.type = 'OPEN' AND e.at >= ${from} AND e.at < ${to}
      AND NOT e."isPrefetch" AND NOT e."isBot" AND NOT e."isSelf"
    GROUP BY 1 ORDER BY 2 DESC`;
  return rows.map((r) => ({ client: r.client, count: Number(r.n) }));
}

// ─── Follow-up lists ─────────────────────────────────────────────────

export interface FollowUpRow {
  messageId: string;
  contactId: string | null;
  name: string | null;
  email: string;
  campaignId: string | null;
  campaign: string;
  sentAt: string;
  opens: number;
  clicks: number;
  fileOpens: number;
  lastActivity: string | null;
  score: number;
}

export interface FollowUps {
  hot: FollowUpRow[];
  openedNoClick: FollowUpRow[];
  notOpened: FollowUpRow[];
}

const NOT_OPENED_AFTER = 3 * DAY;

export async function followUps(workspaceId: string, from: Date, to: Date): Promise<FollowUps> {
  const messages = await db.message.findMany({
    where: { workspaceId, status: "SENT", sentAt: { gte: from, lt: to } },
    orderBy: { sentAt: "desc" },
    take: 3000,
    select: {
      id: true,
      toEmail: true,
      sentAt: true,
      contact: { select: { id: true, name: true } },
      campaign: { select: { id: true, name: true, attachments: { select: { url: true } } } },
      events: {
        select: { type: true, at: true, isPrefetch: true, isBot: true, isSelf: true, link: { select: { url: true } } },
      },
    },
  });

  const rows = messages.map((m): FollowUpRow => {
    const s = summarize(
      m.events.map((e) => ({ ...e, type: e.type === "OPEN" ? ("open" as const) : ("click" as const) })),
      m.sentAt,
    );
    const files = new Set(m.campaign?.attachments.map((a) => a.url));
    const human = m.events.filter((e) => !e.isPrefetch && !e.isBot && !e.isSelf);
    const last = human.reduce<Date | null>((acc, e) => (!acc || e.at > acc ? e.at : acc), null);
    const fileOpens = human.filter((e) => e.type === "CLICK" && e.link && files.has(e.link.url)).length;
    return {
      messageId: m.id,
      contactId: m.contact?.id ?? null,
      name: m.contact?.name ?? null,
      email: m.toEmail,
      campaignId: m.campaign?.id ?? null,
      campaign: m.campaign?.name ?? "Single email",
      sentAt: m.sentAt!.toISOString(),
      opens: s.opens,
      clicks: s.clicks,
      fileOpens,
      lastActivity: last?.toISOString() ?? null,
      // Files are the strongest signal of interest, then clicks, then repeat opens.
      score: s.score + Math.min(fileOpens, 2) * 15,
    };
  });

  const now = Date.now();
  const byScore = (a: FollowUpRow, b: FollowUpRow) => b.score - a.score;
  return {
    hot: rows.filter((r) => r.opens >= 3 || r.clicks > 0 || r.fileOpens > 0).sort(byScore),
    openedNoClick: rows.filter((r) => r.opens > 0 && r.clicks === 0 && r.fileOpens === 0).sort(byScore),
    notOpened: rows.filter((r) => r.opens === 0 && now - Date.parse(r.sentAt) > NOT_OPENED_AFTER),
  };
}
