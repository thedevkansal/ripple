"use client";

import { useState } from "react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;

/** Sequential ramp: a single hue mixed into the surface, stronger with more opens. */
function cellColor(n: number, max: number) {
  if (!n) return "var(--line)";
  const pct = Math.round(18 + 82 * (n / max));
  return `color-mix(in oklab, var(--chart-opens) ${pct}%, var(--ink-raised))`;
}

export function OpenHeatmap({ grid }: { grid: number[][] }) {
  const [active, setActive] = useState<{ d: number; h: number } | null>(null);
  const max = Math.max(0, ...grid.flat());

  let peak: { d: number; h: number; n: number } | null = null;
  for (let d = 0; d < grid.length; d++) {
    for (let h = 0; h < 24; h++) {
      if (grid[d][h] > (peak?.n ?? 0)) peak = { d, h, n: grid[d][h] };
    }
  }

  if (max === 0) {
    return <p className="py-10 text-center text-sm text-muted">No opens in this period yet.</p>;
  }

  const describe = (d: number, h: number) => {
    const n = grid[d][h];
    return `${DAYS[d]} ${hourLabel(h)}–${hourLabel((h + 1) % 24)}: ${n} ${n === 1 ? "open" : "opens"}`;
  };

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div className="grid min-w-[520px] grid-cols-[2.5rem_repeat(24,minmax(0,1fr))] gap-[2px]">
          {grid.map((row, d) => (
            <div key={DAYS[d]} className="contents">
              <span className="pr-2 text-right text-[11px] leading-[18px] text-faint">{DAYS[d]}</span>
              {row.map((n, h) => (
                <button
                  key={h}
                  type="button"
                  aria-label={describe(d, h)}
                  onPointerEnter={() => setActive({ d, h })}
                  onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive({ d, h })}
                  onBlur={() => setActive(null)}
                  className="h-[18px] rounded-[3px] outline-offset-1 transition-[filter] duration-100 hover:brightness-110"
                  style={{
                    background: cellColor(n, max),
                    boxShadow: active?.d === d && active.h === h ? "0 0 0 2px var(--text)" : undefined,
                  }}
                />
              ))}
            </div>
          ))}
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="pt-1 text-center text-[10px] text-faint">
              {h % 3 === 0 ? hourLabel(h) : ""}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="min-h-5 text-muted" aria-live="polite">
          {active ? (
            describe(active.d, active.h)
          ) : peak ? (
            <>
              Most opens: <span className="font-medium text-text">{DAYS[peak.d]} {hourLabel(peak.h)}–{hourLabel((peak.h + 1) % 24)}</span>
            </>
          ) : null}
        </p>
        <div className="flex items-center gap-2 text-xs text-faint">
          Fewer
          {[0.2, 0.45, 0.7, 1].map((f) => (
            <span key={f} className="size-3 rounded-[3px]" style={{ background: cellColor(f * max, max) }} />
          ))}
          More
        </div>
      </div>
    </div>
  );
}
