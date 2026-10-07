export interface EventLike {
  type: "open" | "click";
  at: Date;
  isPrefetch: boolean;
  isBot: boolean;
}

export interface EngagementSummary {
  /** Every recorded open, including prefetches and bots. */
  rawOpens: number;
  /** Opens that look human, with bursts collapsed into one. */
  opens: number;
  clicks: number;
  firstOpenAt: Date | null;
  lastOpenAt: Date | null;
  timeToFirstOpenMs: number | null;
  /** Gaps between consecutive human opens. */
  intervalsMs: number[];
  /** True when the only opens are prefetches: "maybe opened". */
  onlyPrefetched: boolean;
  score: number;
}

/**
 * Proxies sometimes fetch the pixel twice for one view, a second or two apart. Real reopens
 * observed in Gmail were 14s+ apart, so 10s merges duplicates without hiding reopens.
 */
export const OPEN_BURST_MS = 10_000;

export function summarize(events: EventLike[], sentAt: Date | null): EngagementSummary {
  const sorted = [...events].sort((a, b) => a.at.getTime() - b.at.getTime());
  const allOpens = sorted.filter((e) => e.type === "open");
  const humanOpens = allOpens.filter((e) => !e.isPrefetch && !e.isBot);
  const clicks = sorted.filter((e) => e.type === "click" && !e.isBot && !e.isPrefetch).length;

  const collapsed: Date[] = [];
  for (const e of humanOpens) {
    const last = collapsed[collapsed.length - 1];
    if (!last || e.at.getTime() - last.getTime() > OPEN_BURST_MS) collapsed.push(e.at);
  }

  const intervalsMs = collapsed.slice(1).map((d, i) => d.getTime() - collapsed[i].getTime());
  const firstOpenAt = collapsed[0] ?? null;
  const lastOpenAt = collapsed[collapsed.length - 1] ?? null;

  return {
    rawOpens: allOpens.length,
    opens: collapsed.length,
    clicks,
    firstOpenAt,
    lastOpenAt,
    timeToFirstOpenMs: firstOpenAt && sentAt ? firstOpenAt.getTime() - sentAt.getTime() : null,
    intervalsMs,
    onlyPrefetched: collapsed.length === 0 && allOpens.length > 0,
    score: engagementScore(collapsed.length, clicks, allOpens.length > 0),
  };
}

/** 0–100. Clicks weigh most, repeat opens next, a prefetch-only open barely counts. */
export function engagementScore(opens: number, clicks: number, anyOpen: boolean): number {
  if (opens === 0 && clicks === 0) return anyOpen ? 5 : 0;
  const openPts = Math.min(opens, 5) * 10; // up to 50
  const clickPts = Math.min(clicks, 3) * 15; // up to 45
  return Math.min(100, openPts + clickPts + (opens > 0 ? 5 : 0));
}
