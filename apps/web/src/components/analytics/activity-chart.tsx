"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DayPoint } from "@/lib/analytics";

const HEIGHT = 220;
const PAD = { top: 12, right: 12, bottom: 28, left: 36 };

const SERIES = [
  { key: "sent", label: "Emails sent", color: "var(--chart-sent)", mark: "bar" },
  { key: "opened", label: "People who opened", color: "var(--chart-opens)", mark: "line" },
  { key: "clicked", label: "Clicks", color: "var(--chart-clicks)", mark: "line" },
] as const;

const dayFmt = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", timeZone: "UTC" });
const weekdayFmt = new Intl.DateTimeFormat("en", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

/** Clean axis maximum and ticks: 0 / step / 2·step… */
function niceTicks(max: number) {
  if (max <= 4) return [0, 1, 2, 3, 4].slice(0, Math.max(max, 1) + 1);
  const rough = max / 4;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= rough)!;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}

export function ActivityChart({ points }: { points: DayPoint[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ticks = useMemo(
    () => niceTicks(Math.max(1, ...points.flatMap((p) => [p.sent, p.opened, p.clicked]))),
    [points],
  );
  const yMax = ticks[ticks.length - 1];
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const band = points.length ? innerW / points.length : 0;
  const x = (i: number) => PAD.left + band * (i + 0.5);
  const y = (v: number) => PAD.top + innerH - (v / yMax) * innerH;
  const barW = Math.max(2, Math.min(24, band * 0.6));

  const path = (key: "opened" | "clicked") =>
    points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join("");
  const area = `${path("opened")}L${x(points.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;

  // Date labels: about one per 90px.
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(innerW / 90))));

  const pointFromEvent = (clientX: number) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    const i = Math.floor((clientX - rect.left - PAD.left) / band);
    return Math.min(points.length - 1, Math.max(0, i));
  };

  const activePoint = active !== null ? points[active] : null;
  const tipLeft = active !== null ? Math.min(Math.max(x(active), 106), width - 106) : 0;

  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            {s.mark === "bar" ? (
              <span className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
            ) : (
              <span className="h-0.5 w-3.5 rounded-full" style={{ background: s.color }} />
            )}
            {s.label}
          </li>
        ))}
      </ul>

      <div
        ref={wrapRef}
        className="relative outline-none"
        tabIndex={0}
        role="img"
        aria-label="Daily emails sent, people who opened, and clicks. Use left and right arrow keys to read each day."
        onPointerMove={(e) => points.length && setActive(pointFromEvent(e.clientX))}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive((a) => a ?? points.length - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? points.length) - 1));
          if (e.key === "ArrowRight") setActive((a) => Math.min(points.length - 1, (a ?? -1) + 1));
        }}
      >
        {width > 0 && (
          <svg width={width} height={HEIGHT} className="block overflow-visible">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--line)" />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tabular fill-faint text-[11px]">
                  {t.toLocaleString()}
                </text>
              </g>
            ))}

            {points.map((p, i) =>
              p.sent > 0 ? (
                <path
                  key={p.day}
                  // 4px rounded top, square at the baseline.
                  d={(() => {
                    const h = y(0) - y(p.sent);
                    const r = Math.min(4, barW / 2, h);
                    const l = x(i) - barW / 2;
                    const t = y(p.sent);
                    return `M${l},${y(0)}V${t + r}Q${l},${t} ${l + r},${t}H${l + barW - r}Q${l + barW},${t} ${l + barW},${t + r}V${y(0)}Z`;
                  })()}
                  fill="var(--chart-sent)"
                  opacity={active === null || active === i ? 1 : 0.6}
                />
              ) : null,
            )}

            <path d={area} fill="var(--chart-opens)" opacity={0.1} />
            <path d={path("opened")} fill="none" stroke="var(--chart-opens)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <path d={path("clicked")} fill="none" stroke="var(--chart-clicks)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

            {points.map((p, i) =>
              // Every nth day, plus the last one unless it would sit on top of the previous label.
              i % labelEvery === 0 ||
              (i === points.length - 1 && i % labelEvery >= Math.ceil(labelEvery / 2)) ? (
                <text key={p.day} x={x(i)} y={HEIGHT - 8} textAnchor="middle" className="fill-faint text-[11px]">
                  {dayFmt.format(asDate(p.day))}
                </text>
              ) : null,
            )}

            {activePoint && active !== null && (
              <g>
                <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={y(0)} stroke="var(--line-strong)" />
                {(["opened", "clicked"] as const).map((k) => (
                  <circle
                    key={k}
                    cx={x(active)}
                    cy={y(activePoint[k])}
                    r={4}
                    fill={k === "opened" ? "var(--chart-opens)" : "var(--chart-clicks)"}
                    stroke="var(--ink-raised)"
                    strokeWidth={2}
                  />
                ))}
              </g>
            )}
          </svg>
        )}

        {activePoint && (
          <div
            className="pointer-events-none absolute top-0 z-10 w-52 -translate-x-1/2 rounded-xl border border-line-strong bg-ink-raised px-3 py-2.5 text-sm shadow-[0_12px_32px_-12px_rgb(0_0_0/0.5)]"
            style={{ left: tipLeft }}
          >
            <p className="mb-1.5 text-xs text-faint">{weekdayFmt.format(asDate(activePoint.day))}</p>
            {SERIES.map((s) => (
              <p key={s.key} className="flex items-center gap-2">
                <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: s.color }} />
                <span className="tabular font-semibold">{activePoint[s.key]}</span>
                <span className="text-muted">{s.label.toLowerCase()}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
