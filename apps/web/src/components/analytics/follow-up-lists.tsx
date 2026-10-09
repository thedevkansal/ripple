"use client";

import { Download, Reply } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { startFollowUp } from "@/app/dashboard/analytics-actions";
import { Button } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/local-time";
import type { FollowUpRow, FollowUps } from "@/lib/analytics";
import { downloadCsv } from "@/lib/csv-export";
import { cn } from "@/lib/utils";

const TABS: { key: keyof FollowUps; label: string; hint: string }[] = [
  {
    key: "hot",
    label: "Hot",
    hint: "Opened 3+ times, clicked a link or opened a file. Follow up while you’re on their mind.",
  },
  { key: "openedNoClick", label: "Opened, no click", hint: "Read it but didn’t act. A short nudge with one clear ask works well." },
  { key: "notOpened", label: "Not opened", hint: "Sent over 3 days ago with no real open. Try a new subject line." },
];

const SHOW = 25;

export function FollowUpLists({ lists }: { lists: FollowUps }) {
  const [tab, setTab] = useState<keyof FollowUps>("hot");
  const [pending, start] = useTransition();
  const current = TABS.find((t) => t.key === tab)!;
  const rows = lists[tab];

  const exportCsv = () =>
    downloadCsv(`ripple-${tab}-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["Name", "Email", "Campaign", "Sent", "Opens", "Clicks", "File opens", "Last activity"],
      ...rows.map((r) => [r.name, r.email, r.campaign, r.sentAt, r.opens, r.clicks, r.fileOpens, r.lastActivity]),
    ]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Follow-up lists" className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "press rounded-full border px-3 py-1 text-sm",
                tab === t.key ? "border-glow/40 bg-glow/10 text-glow" : "border-line-strong text-muted hover:text-text",
              )}
            >
              {t.label} <span className="tabular opacity-70">{lists[t.key].length}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!rows.length}>
            <Download className="size-3.5" />
            Export CSV
          </Button>
          <Button
            size="sm"
            disabled={!rows.length || pending}
            onClick={() => start(() => startFollowUp(rows.map((r) => r.messageId), current.label))}
          >
            <Reply className="size-3.5" />
            {pending ? "Creating draft…" : `Follow up with ${rows.length}`}
          </Button>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted">{current.hint}</p>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-line-strong py-8 text-center text-sm text-muted">
          Nobody here for this period.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-faint">
                <th className="px-4 py-2.5 font-normal">Person</th>
                <th className="px-3 py-2.5 font-normal">Campaign</th>
                <th className="px-3 py-2.5 text-right font-normal">Opens</th>
                <th className="px-3 py-2.5 text-right font-normal">Clicks</th>
                <th className="px-3 py-2.5 text-right font-normal">Files</th>
                <th className="px-4 py-2.5 font-normal">{tab === "notOpened" ? "Sent" : "Last activity"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, SHOW).map((r: FollowUpRow) => (
                <tr key={r.messageId} className="border-b border-line last:border-0">
                  <td className="max-w-[220px] px-4 py-2.5">
                    <p className="truncate font-medium">{r.name ?? r.email}</p>
                    {r.name && <p className="truncate text-faint">{r.email}</p>}
                  </td>
                  <td className="max-w-[180px] px-3 py-2.5">
                    {r.campaignId ? (
                      <Link href={`/dashboard/campaigns/${r.campaignId}`} className="block truncate text-muted hover:text-text">
                        {r.campaign}
                      </Link>
                    ) : (
                      <span className="text-muted">{r.campaign}</span>
                    )}
                  </td>
                  <td className="tabular px-3 py-2.5 text-right">{r.opens}</td>
                  <td className="tabular px-3 py-2.5 text-right">{r.clicks}</td>
                  <td className="tabular px-3 py-2.5 text-right">{r.fileOpens}</td>
                  <td className="tabular px-4 py-2.5 text-muted">
                    <LocalTime date={tab === "notOpened" ? r.sentAt : (r.lastActivity ?? r.sentAt)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > SHOW && (
            <p className="border-t border-line px-4 py-2.5 text-xs text-faint">
              Showing {SHOW} of {rows.length}. Export the CSV for everyone.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
