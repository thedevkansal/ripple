const CLIENT_NAMES: Record<string, string> = {
  gmail: "Gmail",
  "apple-mail": "Apple Mail",
  outlook: "Outlook",
  yahoo: "Yahoo Mail",
  thunderbird: "Thunderbird",
  browser: "Web browser",
  unknown: "Other",
};

/** Share of real opens by mail client. Values are labelled, so no hover layer is needed. */
export function ClientBars({ rows }: { rows: { client: string; count: number }[] }) {
  const total = rows.reduce((n, r) => n + r.count, 0);
  if (!total) return <p className="py-10 text-center text-sm text-muted">No opens in this period yet.</p>;
  const max = Math.max(...rows.map((r) => r.count));

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.client}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span>{CLIENT_NAMES[r.client] ?? r.client}</span>
            <span className="tabular text-muted">
              {r.count} <span className="text-faint">· {Math.round((r.count / total) * 100)}%</span>
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-white/5">
            <div
              className="h-full rounded-full"
              style={{ width: `${(r.count / max) * 100}%`, background: "var(--chart-opens)" }}
            />
          </div>
        </li>
      ))}
      <li className="text-xs leading-relaxed text-faint">
        Gmail and Apple Mail load images through their own servers, so device type isn’t visible for them.
      </li>
    </ul>
  );
}
