"use client";

import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { inputClass } from "@/components/dashboard/forms";
import { LocalTime } from "@/components/ui/local-time";
import type { MessageStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

export interface RecipientRowData {
  id: string;
  name: string | null;
  email: string;
  org: string | null;
  status: MessageStatus;
  error: string | null;
  sentAt: string | null;
  opens: number;
  onlyPrefetched: boolean;
  clicks: number;
  fileOpens: number;
  lastOpenAt: string | null;
}

type SortKey = "name" | "status" | "sentAt" | "opens" | "clicks" | "fileOpens" | "lastOpenAt";
type Filter = "all" | "opened" | "unopened" | "clicked" | "files" | "failed";

const STATUS_ORDER: Record<MessageStatus, number> = { SENT: 0, SENDING: 1, QUEUED: 2, FAILED: 3, CANCELLED: 4 };

const MESSAGE_STATE: Record<MessageStatus, { label: string; className: string }> = {
  QUEUED: { label: "Queued", className: "text-faint" },
  SENDING: { label: "Sending", className: "text-glow" },
  SENT: { label: "Sent", className: "text-text" },
  FAILED: { label: "Failed", className: "text-red-300" },
  CANCELLED: { label: "Cancelled", className: "text-faint line-through" },
};

const FILTERS: { key: Filter; label: string; test: (r: RecipientRowData) => boolean }[] = [
  { key: "all", label: "All", test: () => true },
  { key: "opened", label: "Opened", test: (r) => r.opens > 0 },
  { key: "unopened", label: "Not opened", test: (r) => r.status === "SENT" && r.opens === 0 },
  { key: "clicked", label: "Clicked", test: (r) => r.clicks > 0 },
  { key: "files", label: "Opened files", test: (r) => r.fileOpens > 0 },
  { key: "failed", label: "Failed", test: (r) => r.status === "FAILED" },
];

const SORT_OPTIONS: { key: SortKey; desc: boolean; label: string }[] = [
  { key: "lastOpenAt", desc: true, label: "Recently opened" },
  { key: "opens", desc: true, label: "Most opens" },
  { key: "clicks", desc: true, label: "Most clicks" },
  { key: "fileOpens", desc: true, label: "Most file opens" },
  { key: "sentAt", desc: true, label: "Recently sent" },
  { key: "name", desc: false, label: "Name A–Z" },
  { key: "status", desc: false, label: "Status" },
];

function compare(a: RecipientRowData, b: RecipientRowData, key: SortKey): number {
  switch (key) {
    case "name":
      return (a.name ?? a.email).localeCompare(b.name ?? b.email);
    case "status":
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    case "sentAt":
    case "lastOpenAt": {
      // Missing dates always sort last.
      const x = a[key] ? Date.parse(a[key]!) : null;
      const y = b[key] ? Date.parse(b[key]!) : null;
      if (x === y) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return x - y;
    }
    default:
      return a[key] - b[key];
  }
}

export function RecipientsTable({ rows, showFiles }: { rows: RecipientRowData[]; showFiles: boolean }) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "lastOpenAt", desc: true });
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, rows.filter(f.test).length])) as Record<Filter, number>,
    [rows],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const test = FILTERS.find((f) => f.key === filter)!.test;
    const list = rows.filter(
      (r) =>
        test(r) &&
        (!q || [r.name, r.email, r.org].some((v) => v?.toLowerCase().includes(q))),
    );
    return list.sort((a, b) => {
      const c = compare(a, b, sort.key);
      // Dates keep "missing last" in both directions.
      if ((sort.key === "sentAt" || sort.key === "lastOpenAt") && (!a[sort.key] || !b[sort.key])) return c;
      return sort.desc ? -c : c;
    });
  }, [rows, filter, query, sort]);

  const header = (key: SortKey, label: string, align: "left" | "right" = "left") => {
    const active = sort.key === key;
    return (
      <th
        className={cn("px-3 py-3 font-normal first:pl-5 last:pr-5", align === "right" && "text-right")}
        aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"}
      >
        <button
          type="button"
          onClick={() => setSort({ key, desc: active ? !sort.desc : key !== "name" })}
          className={cn(
            "inline-flex items-center gap-1 transition-colors duration-150 hover:text-text",
            active && "text-text",
          )}
        >
          {label}
          {active && (sort.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
        </button>
      </th>
    );
  };

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.filter((f) => f.key !== "files" || showFiles)
            .filter((f) => f.key !== "failed" || counts.failed > 0)
            .map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "press rounded-full border px-3 py-1 text-sm",
                  filter === f.key
                    ? "border-glow/40 bg-glow/10 text-glow"
                    : "border-line-strong text-muted hover:text-text",
                )}
              >
                {f.label} <span className="tabular opacity-70">{counts[f.key]}</span>
              </button>
            ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-sm text-muted">
          Sort by
          <select
            value={`${sort.key}:${sort.desc ? "desc" : "asc"}`}
            onChange={(e) => {
              const [key, dir] = e.target.value.split(":") as [SortKey, string];
              setSort({ key, desc: dir === "desc" });
            }}
            className={cn(inputClass, "h-9")}
          >
            {SORT_OPTIONS.filter((o) => o.key !== "fileOpens" || showFiles).map((o) => (
              <option key={`${o.key}:${o.desc ? "desc" : "asc"}`} value={`${o.key}:${o.desc ? "desc" : "asc"}`}>
                {o.label}
              </option>
            ))}
            {/* Column-header clicks can pick a direction the presets don't list. */}
            {!SORT_OPTIONS.some((o) => o.key === sort.key && o.desc === sort.desc) && (
              <option value={`${sort.key}:${sort.desc ? "desc" : "asc"}`}>Custom (column)</option>
            )}
          </select>
        </label>
        <label className="relative w-full sm:w-56">
          <span className="sr-only">Search recipients</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, company"
            className={cn(inputClass, "w-full pl-8")}
          />
        </label>
      </div>

      <div className="mt-3 overflow-x-auto rounded-2xl border border-line-strong">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-faint">
              {header("name", "Recipient")}
              {header("status", "Status")}
              {header("sentAt", "Sent")}
              {header("opens", "Opens", "right")}
              {header("clicks", "Clicks", "right")}
              {showFiles && header("fileOpens", "Files", "right")}
              {header("lastOpenAt", "Last opened")}
            </tr>
          </thead>
          <tbody>
            {visible.map((m) => {
              const state = MESSAGE_STATE[m.status];
              return (
                <tr key={m.id} className="border-b border-line last:border-0">
                  <td className="max-w-[260px] py-3 pr-3 pl-5">
                    <p className="truncate font-medium">{m.name ?? m.email}</p>
                    <p className="truncate text-faint">{m.name ? m.email : m.org}</p>
                  </td>
                  <td className="px-3 py-3">
                    <span className={state.className} title={m.status === "FAILED" ? (m.error ?? undefined) : undefined}>
                      {state.label}
                    </span>
                  </td>
                  <td className="tabular px-3 py-3 text-muted">{m.sentAt ? <LocalTime date={m.sentAt} /> : "–"}</td>
                  <td className="tabular px-3 py-3 text-right">
                    {m.opens > 0 ? (
                      <span className="text-glow">{m.opens}</span>
                    ) : m.onlyPrefetched ? (
                      <span
                        className="text-warn"
                        title="Only automatic loads (Gmail at delivery, Apple Mail or a scanner), not a confirmed read"
                      >
                        maybe
                      </span>
                    ) : (
                      <span className="text-faint">0</span>
                    )}
                  </td>
                  <td className="tabular px-3 py-3 text-right">
                    {m.clicks > 0 ? <span className="text-dusk">{m.clicks}</span> : <span className="text-faint">0</span>}
                  </td>
                  {showFiles && (
                    <td className="tabular px-3 py-3 text-right">
                      {m.fileOpens > 0 ? (
                        <span className="text-dusk">{m.fileOpens}</span>
                      ) : (
                        <span className="text-faint">0</span>
                      )}
                    </td>
                  )}
                  <td className="tabular py-3 pr-5 pl-3 text-muted">
                    {m.lastOpenAt ? <LocalTime date={m.lastOpenAt} /> : "–"}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={showFiles ? 7 : 6} className="px-5 py-10 text-center text-muted">
                  No recipients match. Try another filter or search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
