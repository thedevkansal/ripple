"use client";

import { useSyncExternalStore } from "react";

const FORMATS = {
  datetime: { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" },
  date: { day: "numeric", month: "short", year: "numeric" },
  time: { hour: "numeric", minute: "2-digit", second: "2-digit" },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

const noop = () => () => {};

/**
 * Formats a date in the viewer's own timezone. The server only knows UTC, so the text is filled
 * in after hydration; the full timestamp is always in the tooltip.
 */
export function LocalTime({
  date,
  format = "datetime",
  className,
}: {
  date: Date | string;
  format?: keyof typeof FORMATS;
  className?: string;
}) {
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const d = typeof date === "string" ? new Date(date) : date;
  return (
    <time
      dateTime={d.toISOString()}
      title={hydrated ? d.toString() : undefined}
      className={className}
    >
      {hydrated ? new Intl.DateTimeFormat("en", FORMATS[format]).format(d) : " "}
    </time>
  );
}
