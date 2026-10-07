"use client";

import { FileUp } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { importContacts } from "@/app/dashboard/campaigns/actions";
import { Button } from "@/components/ui/button";
import { parseRecipientsCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";

export function ImportContacts() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  async function onFile(file: File) {
    const parsed = parseRecipientsCsv(await file.text());
    if (!parsed.columns.some((c) => c.role === "email")) {
      setNotice({ ok: false, text: "That file has no email column." });
      return;
    }
    start(async () => {
      const res = await importContacts(parsed.rows);
      const skipped = parsed.invalid.length + parsed.duplicates;
      setNotice(
        res.ok
          ? { ok: true, text: `Imported ${res.count} contact${res.count === 1 ? "" : "s"}${skipped ? `, skipped ${skipped}` : ""}.` }
          : { ok: false, text: res.error },
      );
    });
  }

  return (
    <div className="flex items-center gap-3">
      {notice && (
        <p role="status" className={cn("text-sm", notice.ok ? "text-glow" : "text-red-300")}>
          {notice.text}
        </p>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
          e.target.value = "";
        }}
      />
      <Button variant="secondary" disabled={pending} onClick={() => fileRef.current?.click()}>
        <FileUp className="size-4" />
        {pending ? "Importing…" : "Import CSV"}
      </Button>
    </div>
  );
}
