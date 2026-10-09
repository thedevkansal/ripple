"use client";

import { contactVars, renderTemplate, textToHtml } from "@ripple/shared";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteTemplate, saveTemplate } from "@/app/dashboard/templates/actions";
import { inputClass } from "@/components/dashboard/forms";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SAMPLE = contactVars({ email: "priya@example.com", name: "Priya Sharma", org: "Razorpay" });
const FIELDS = ["first_name", "name", "company", "email"];

export function TemplateEditor({
  initial,
}: {
  initial: { id?: string; name: string; subject: string; body: string };
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const res = await saveTemplate(form);
      if (!res.ok) return setNotice({ ok: false, text: res.error });
      setNotice({ ok: true, text: "Template saved." });
      if (!form.id) router.replace(`/dashboard/templates/${res.template.id}`);
      setForm((f) => ({ ...f, id: res.template.id }));
    });

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <section className="flex flex-col gap-4 rounded-2xl border border-line-strong bg-surface p-5">
        <label className="flex flex-col gap-1.5 text-sm text-muted">
          Template name
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Speaker follow-up"
            className={cn(inputClass, "w-full")}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-muted">
          Subject
          <input
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            placeholder="Following up: E-Summit '26, {{first_name}}"
            className={cn(inputClass, "w-full")}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-muted">
          Body
          <textarea
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            rows={16}
            placeholder={"Hi {{first_name|there}},\n\nJust following up on our invite…"}
            className={cn(inputClass, "h-auto w-full resize-y py-3 leading-relaxed")}
          />
        </label>
        <p className="text-xs leading-relaxed text-faint">
          Merge fields work as in campaigns: {FIELDS.map((f) => `{{${f}}}`).join(", ")} and any column from your CSV.
        </p>
        {notice && (
          <p role={notice.ok ? "status" : "alert"} className={cn("text-sm", notice.ok ? "text-glow" : "text-red-300")}>
            {notice.text}
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button onClick={save} disabled={pending}>
            Save template
          </Button>
          {form.id && (
            <Button
              variant="ghost"
              className="ml-auto"
              disabled={pending}
              onClick={() => {
                if (confirm("Delete this template? Campaigns that used it keep their text.")) {
                  start(() => deleteTemplate(form.id!));
                }
              }}
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          )}
        </div>
      </section>

      <div className="overflow-hidden rounded-2xl border border-line-strong bg-surface lg:sticky lg:top-6 lg:self-start">
        <div className="border-b border-line px-4 py-3 text-sm">
          <span className="text-faint">Preview for a sample contact · </span>
          <span className="font-medium">{renderTemplate(form.subject, SAMPLE).output || "(no subject)"}</span>
        </div>
        <iframe
          title="Template preview"
          sandbox=""
          srcDoc={textToHtml(renderTemplate(form.body, SAMPLE).output)}
          className="h-[480px] w-full bg-[#fff]"
        />
      </div>
    </div>
  );
}
