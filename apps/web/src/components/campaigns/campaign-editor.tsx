"use client";

import { contactVars, formatBytes, listMergeFields, renderTemplate, textToHtml } from "@ripple/shared";
import { upload } from "@vercel/blob/client";
import { BookmarkPlus, ChevronLeft, ChevronRight, FileUp, Paperclip, Send, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import {
  deleteDraft,
  launchCampaign,
  registerAttachment,
  removeAttachment,
  saveCampaign,
  sendTest,
  type CampaignInput,
} from "@/app/dashboard/campaigns/actions";
import { saveTemplate, type TemplateInfo } from "@/app/dashboard/templates/actions";
import { inputClass } from "@/components/dashboard/forms";
import { Button } from "@/components/ui/button";
import { ACCEPT_ATTR, type AttachmentInfo, attachmentPrefix, MAX_TOTAL_BYTES } from "@/lib/attachments";
import { EMAIL_RE, parseRecipientsCsv, type ParsedCsv, type RecipientRow } from "@/lib/csv";
import { cn } from "@/lib/utils";

export interface SenderAccount {
  id: string;
  email: string;
  needsReconnect: boolean;
  remainingToday: number;
  dailyLimit: number;
}

export interface EditorProps {
  initial: {
    id?: string;
    name: string;
    tag: string;
    gmailAccountId: string;
    subject: string;
    body: string;
    trackClicks: boolean;
    linkAttachments: boolean;
    cc: string[];
  };
  initialRecipients: RecipientRow[];
  initialAttachments: AttachmentInfo[];
  templates: TemplateInfo[];
  workspaceId: string;
  accounts: SenderAccount[];
  senderName: string;
}

const SUGGESTED_TAGS = ["speaker", "sponsor", "investor", "partner", "mentor"];
const SAMPLE: RecipientRow = { email: "priya@example.com", name: "Priya Sharma", org: "Razorpay" };

type Notice = { tone: "ok" | "error"; text: string } | null;

export function CampaignEditor({
  initial,
  initialRecipients,
  initialAttachments,
  templates: initialTemplates,
  workspaceId,
  accounts,
  senderName,
}: EditorProps) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [ccText, setCcText] = useState(initial.cc.join(", "));
  const [templates, setTemplates] = useState(initialTemplates);
  // Merge fields offered by uploaded CSVs; null until a file is uploaded in this session.
  const [csvFields, setCsvFields] = useState<string[] | null>(null);
  const [recipients, setRecipients] = useState<RecipientRow[]>(initialRecipients);
  const [csvInfo, setCsvInfo] = useState<Pick<ParsedCsv, "invalid" | "duplicates" | "columns"> | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [scheduleAt, setScheduleAt] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AttachmentInfo[]>(initialAttachments);
  const [uploading, setUploading] = useState<{ name: string; pct: number }[]>([]);
  const attachRef = useRef<HTMLInputElement>(null);
  const totalBytes = attachments.reduce((n, a) => n + a.size, 0);
  const [pending, startTransition] = useTransition();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const account = accounts.find((a) => a.id === form.gmailAccountId);
  const total = recipients.length;

  // Offer only fields the list actually has: the uploaded CSV's columns, or for a saved draft,
  // what its recipients carry. With no list yet, show the usual ones.
  const { baseFields, customFields } = useMemo(() => {
    const BASE = ["email", "name", "first_name", "last_name", "company"];
    if (csvFields) {
      return { baseFields: csvFields.filter((f) => BASE.includes(f)), customFields: csvFields.filter((f) => !BASE.includes(f)) };
    }
    if (!recipients.length) return { baseFields: [], customFields: [] };
    const base = new Set<string>(["email"]);
    const custom = new Set<string>();
    for (const r of recipients) {
      if (r.name) base.add("name");
      if (r.org) base.add("company");
      for (const k of Object.keys(r.fields ?? {})) custom.add(k);
    }
    return { baseFields: ["email", "name", "company"].filter((k) => base.has(k)), customFields: [...custom] };
  }, [recipients, csvFields]);

  const ccList = ccText.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
  const badCc = ccList.filter((e) => !EMAIL_RE.test(e));
  const ccCount = recipients.filter((r) => r.cc?.length).length;

  const previewRow = recipients[previewIndex] ?? recipients[0] ?? SAMPLE;
  const vars = contactVars(previewRow);
  const subject = renderTemplate(form.subject, vars).output;
  const html = textToHtml(renderTemplate(form.body, vars).output, {
    files: form.linkAttachments ? attachments : [],
  });

  const missingSummary = useMemo(() => {
    const used = listMergeFields(form.subject + "\n" + form.body);
    if (!used.length || !recipients.length) return [];
    const counts = new Map<string, number>();
    for (const r of recipients) {
      const { missing } = renderTemplate(form.subject + "\n" + form.body, contactVars(r));
      for (const k of missing) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts.entries()];
  }, [form.subject, form.body, recipients]);

  function insertField(key: string) {
    const el = bodyRef.current;
    const token = `{{${key}}}`;
    if (!el) return set("body", form.body + token);
    const { selectionStart: s, selectionEnd: e } = el;
    const next = form.body.slice(0, s) + token + form.body.slice(e);
    set("body", next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + token.length, s + token.length);
    });
  }

  async function onFile(file: File) {
    const parsed = parseRecipientsCsv(await file.text());
    if (!parsed.columns.some((c) => c.role === "email")) {
      const found = parsed.columns.map((c) => c.header).join(", ") || "none";
      setCsvError(`${file.name} has no email column (found: ${found}). Name a column “email” and upload again.`);
      return;
    }
    if (!parsed.rows.length) {
      setCsvError(`${file.name} has an email column, but no row has a valid address.`);
      return;
    }
    setCsvError(null);
    const known = new Set(recipients.map((r) => r.email));
    setRecipients([...recipients, ...parsed.rows.filter((r) => !known.has(r.email))]);
    setCsvFields((prev) => [...new Set([...(prev ?? []), ...parsed.mergeFields])]);
    setCsvInfo(parsed);
    setPreviewIndex(0);
    setNotice(null);
  }

  function payload(): CampaignInput {
    return {
      ...form,
      cc: [...new Set(ccList)],
      recipients,
      attachmentIds: attachments.map((a) => a.id),
    };
  }

  function loadTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    if ((form.subject || form.body.trim()) && !confirm(`Replace the subject and message with “${t.name}”?`)) return;
    setForm((f) => ({ ...f, subject: t.subject, body: t.body }));
    setNotice({ tone: "ok", text: `Loaded “${t.name}”.` });
  }

  const saveAsTemplate = () => {
    const name = prompt("Name this template", form.name || "Untitled template")?.trim();
    if (!name) return;
    run(async () => {
      const res = await saveTemplate({ name, subject: form.subject, body: form.body });
      if (!res.ok) return setNotice({ tone: "error", text: res.error });
      setTemplates((list) => [res.template, ...list]);
      setNotice({ tone: "ok", text: `Saved as template “${name}”.` });
    });
  };

  async function onAttach(files: FileList) {
    setNotice(null);
    let budget = MAX_TOTAL_BYTES - totalBytes;
    for (const file of Array.from(files)) {
      if (file.size > budget) {
        setNotice({ tone: "error", text: `${file.name} would take attachments past ${formatBytes(MAX_TOTAL_BYTES)}.` });
        continue;
      }
      budget -= file.size;
      setUploading((u) => [...u, { name: file.name, pct: 0 }]);
      try {
        const blob = await upload(`${attachmentPrefix(workspaceId)}${file.name}`, file, {
          access: "public",
          handleUploadUrl: "/api/files/upload",
          onUploadProgress: ({ percentage }) =>
            setUploading((u) => u.map((x) => (x.name === file.name ? { ...x, pct: percentage } : x))),
        });
        const res = await registerAttachment({ url: blob.url, name: file.name });
        if (res.ok) setAttachments((a) => [...a, res.attachment]);
        else setNotice({ tone: "error", text: res.error });
      } catch (err) {
        setNotice({ tone: "error", text: `Couldn’t upload ${file.name}: ${(err as Error).message}` });
      } finally {
        setUploading((u) => u.filter((x) => x.name !== file.name));
      }
    }
  }

  function run(task: () => Promise<void>) {
    setNotice(null);
    if (badCc.length) {
      setNotice({ tone: "error", text: `Fix the CC address${badCc.length > 1 ? "es" : ""}: ${badCc.join(", ")}` });
      return;
    }
    startTransition(async () => {
      try {
        await task();
      } catch {
        setNotice({ tone: "error", text: "Something went wrong. Your changes are still here; try again." });
      }
    });
  }

  const save = () =>
    run(async () => {
      const res = await saveCampaign(payload());
      if (!res.ok) return setNotice({ tone: "error", text: res.error });
      setNotice({ tone: "ok", text: "Draft saved." });
      if (!form.id) {
        set("id", res.id);
        router.replace(`/dashboard/campaigns/${res.id}`);
      }
    });

  const test = () =>
    run(async () => {
      const saved = await saveCampaign(payload());
      if (!saved.ok) return setNotice({ tone: "error", text: saved.error });
      set("id", saved.id);
      const res = await sendTest(saved.id);
      setNotice(
        res.ok
          ? { tone: "ok", text: `Test sent to ${res.to}. It isn't tracked.` }
          : { tone: "error", text: res.error },
      );
    });

  const launch = () =>
    run(async () => {
      const saved = await saveCampaign(payload());
      if (!saved.ok) return setNotice({ tone: "error", text: saved.error });
      const res = await launchCampaign(saved.id, scheduleAt ? new Date(scheduleAt).toISOString() : undefined);
      if (!res.ok) return setNotice({ tone: "error", text: res.error });
      router.push(`/dashboard/campaigns/${saved.id}`);
    });

  const days = account ? Math.max(1, Math.ceil(total / account.dailyLimit)) : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <div className="flex min-w-0 flex-col gap-6">
        <Card title="Basics">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Campaign name">
              <input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Speaker invites, round 1"
                className={cn(inputClass, "w-full")}
              />
            </Field>
            <Field label="Tag">
              <input
                value={form.tag}
                onChange={(e) => set("tag", e.target.value)}
                list="campaign-tags"
                placeholder="speaker"
                className={cn(inputClass, "w-full")}
              />
              <datalist id="campaign-tags">
                {SUGGESTED_TAGS.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
          </div>
          <Field label="Send from" className="mt-4">
            {accounts.length === 0 ? (
              <p className="text-sm text-muted">
                No Gmail connected.{" "}
                <a href="/dashboard/settings#gmail" className="text-glow underline-offset-4 hover:underline">
                  Connect one in Settings
                </a>
                .
              </p>
            ) : (
              <select
                value={form.gmailAccountId}
                onChange={(e) => set("gmailAccountId", e.target.value)}
                className={cn(inputClass, "w-full")}
              >
                <option value="">Choose an account</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id} disabled={a.needsReconnect}>
                    {a.email} ({a.needsReconnect ? "reconnect needed" : `${a.remainingToday} of ${a.dailyLimit} left today`})
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Always CC" className="mt-4">
            <input
              value={ccText}
              onChange={(e) => setCcText(e.target.value)}
              placeholder="esummit@iitr.ac.in"
              aria-invalid={badCc.length > 0}
              className={cn(inputClass, "w-full", badCc.length > 0 && "border-red-400/50")}
            />
          </Field>
          <p className={cn("mt-1.5 text-xs", badCc.length ? "text-red-300" : "text-faint")}>
            {badCc.length
              ? `Not a valid address: ${badCc.join(", ")}`
              : "CC’d on every email, e.g. your team inbox. Separate several with commas. People CC’d see the same email, so their opens and clicks count toward the main recipient."}
          </p>
        </Card>

        <Card
          title="Recipients"
          aside={
            <span className="tabular text-sm text-muted">
              {total} total{ccCount > 0 && `, ${ccCount} with extra CC`}
            </span>
          }
        >
          <div className="flex flex-wrap items-center gap-2">
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
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
              <FileUp className="size-3.5" />
              Upload CSV
            </Button>
            {recipients.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRecipients([]);
                  setCsvInfo(null);
                  setCsvFields(null);
                }}
              >
                Clear list
              </Button>
            )}
          </div>
          {csvError && (
            <p role="alert" className="mt-3 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">
              {csvError}
            </p>
          )}
          <p className="mt-2 text-xs text-faint">
            Needs an email column. Extra email columns (Email 2, Alt email) are CC’d, and every other column
            becomes a merge field.
          </p>

          {csvInfo && (
            <div className="mt-4 rounded-xl bg-ink-sunken/60 px-4 py-3 text-sm">
              <p className="text-muted">
                Columns:{" "}
                {csvInfo.columns.map((c, i) => (
                  <span key={c.header}>
                    {i > 0 && ", "}
                    <span className={c.role === "field" ? "text-dusk" : "text-text"}>{c.header}</span>
                  </span>
                ))}
              </p>
              {(csvInfo.invalid.length > 0 || csvInfo.duplicates > 0) && (
                <p className="mt-1 text-warn">
                  Skipped {csvInfo.invalid.length} row{csvInfo.invalid.length === 1 ? "" : "s"} without a valid
                  email
                  {csvInfo.invalid.length > 0 && ` (line ${csvInfo.invalid.slice(0, 3).map((r) => r.line).join(", ")}${csvInfo.invalid.length > 3 ? "…" : ""})`}
                  {csvInfo.duplicates > 0 && ` and ${csvInfo.duplicates} duplicate${csvInfo.duplicates === 1 ? "" : "s"}`}.
                </p>
              )}
            </div>
          )}

          {recipients.length > 0 && (
            <ul className="mt-4 max-h-56 overflow-y-auto rounded-xl border border-line">
              {recipients.map((r, i) => (
                <li
                  key={r.email}
                  className="flex items-center gap-3 border-b border-line px-3 py-2 text-sm last:border-0"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {r.name ?? r.email}
                    {r.name && <span className="ml-2 text-faint">{r.email}</span>}
                  </span>
                  {r.org && <span className="hidden truncate text-muted sm:inline">{r.org}</span>}
                  {r.cc?.length ? (
                    <span className="shrink-0 rounded-md bg-dusk/10 px-1.5 py-0.5 text-xs text-dusk" title={`CC: ${r.cc.join(", ")}`}>
                      +{r.cc.length} cc
                    </span>
                  ) : null}
                  <button
                    type="button"
                    aria-label={`Remove ${r.email}`}
                    onClick={() => setRecipients(recipients.filter((_, j) => j !== i))}
                    className="press grid size-6 place-items-center rounded-md text-faint hover:bg-white/5 hover:text-text"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

        </Card>

        <Card
          title="Message"
          aside={
            <div className="flex items-center gap-2">
              {templates.length > 0 && (
                <select
                  aria-label="Load a template"
                  value=""
                  onChange={(e) => loadTemplate(e.target.value)}
                  className={cn(inputClass, "h-8 max-w-[11rem] text-[13px]")}
                >
                  <option value="">Load template…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
              <Button variant="ghost" size="sm" onClick={saveAsTemplate} disabled={pending}>
                <BookmarkPlus className="size-3.5" />
                Save as template
              </Button>
            </div>
          }
        >
          <Field label="Subject">
            <input
              value={form.subject}
              onChange={(e) => set("subject", e.target.value)}
              placeholder="Speaking at E-Summit '26, {{first_name}}?"
              className={cn(inputClass, "w-full")}
            />
          </Field>
          <div className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="campaign-body" className="text-sm text-muted">
                Body
              </label>
              <div className="flex flex-wrap gap-1.5">
                {baseFields.length + customFields.length === 0 && (
                  <span className="text-xs text-faint">Upload a list to insert its columns</span>
                )}
                {[...baseFields, ...customFields].map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => insertField(k)}
                    className={cn(
                      "press rounded-md border px-2 py-0.5 text-xs",
                      customFields.includes(k)
                        ? "border-dusk/30 text-dusk hover:bg-dusk/10"
                        : "border-line-strong text-muted hover:text-text",
                    )}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              id="campaign-body"
              ref={bodyRef}
              value={form.body}
              onChange={(e) => set("body", e.target.value)}
              rows={14}
              placeholder={"Hi {{first_name|there}},\n\nWe'd love to have you speak at E-Summit '26…\n\n[See the speaker brief](https://esummit.in/brief)"}
              className={cn(inputClass, "mt-2 h-auto w-full resize-y py-3 leading-relaxed")}
            />
            <p className="mt-2 text-xs leading-relaxed text-faint">
              Blank line starts a paragraph. <code className="text-muted">[text](https://…)</code> makes a link,{" "}
              <code className="text-muted">**bold**</code> makes bold, <code className="text-muted">{"{{first_name|there}}"}</code>{" "}
              uses “there” when a name is missing.
            </p>
          </div>

          {missingSummary.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1 rounded-xl border border-warn/25 bg-warn/5 px-4 py-3 text-sm text-warn">
              {missingSummary.map(([key, n]) => (
                <li key={key}>
                  {n} recipient{n === 1 ? " has" : "s have"} no <code>{key}</code>. Add a fallback like{" "}
                  <code>{`{{${key}|…}}`}</code>.
                </li>
              ))}
            </ul>
          )}

          <label className="mt-5 flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={form.trackClicks}
              onChange={(e) => set("trackClicks", e.target.checked)}
              className="size-4 accent-[var(--glow)]"
            />
            Track link clicks
            <span className="text-faint">(links go through Ripple, then straight to the page)</span>
          </label>
        </Card>

        <Card
          title="Attachments"
          aside={
            <span className="tabular text-sm text-muted">
              {formatBytes(totalBytes)} of {formatBytes(MAX_TOTAL_BYTES)}
            </span>
          }
        >
          <input
            ref={attachRef}
            type="file"
            multiple
            accept={ACCEPT_ATTR}
            className="sr-only"
            onChange={(e) => {
              if (e.target.files?.length) void onAttach(e.target.files);
              e.target.value = "";
            }}
          />
          <Button variant="secondary" size="sm" onClick={() => attachRef.current?.click()} disabled={pending}>
            <Paperclip className="size-3.5" />
            Attach files
          </Button>
          <p className="mt-2 text-xs text-faint">PDF, images, Word, PowerPoint or Excel. Every recipient gets them as real attachments.</p>

          {(attachments.length > 0 || uploading.length > 0) && (
            <ul className="mt-4 flex flex-col gap-2">
              {attachments.map((a) => (
                <li key={a.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2 text-sm">
                  <Paperclip className="size-4 shrink-0 text-glow" />
                  <span className="min-w-0 flex-1 truncate">{a.name}</span>
                  <span className="tabular text-faint">{formatBytes(a.size)}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${a.name}`}
                    onClick={() => {
                      setAttachments((list) => list.filter((x) => x.id !== a.id));
                      void removeAttachment(a.id);
                    }}
                    className="press grid size-6 place-items-center rounded-md text-faint hover:bg-white/5 hover:text-text"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
              {uploading.map((u) => (
                <li key={u.name} className="relative overflow-hidden rounded-xl border border-line px-3 py-2 text-sm text-muted">
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 bg-glow/10 transition-[width] duration-200"
                    style={{ width: `${u.pct}%` }}
                  />
                  <span className="relative">Uploading {u.name}…</span>
                </li>
              ))}
            </ul>
          )}

          <label className="mt-5 flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={form.linkAttachments}
              onChange={(e) => set("linkAttachments", e.target.checked)}
              className="mt-0.5 size-4 accent-[var(--glow)]"
            />
            <span>
              Add a tracked “View” link for each file
              <span className="block text-faint">
                Shows who opened your brochure. Opening the attached copy itself can’t be tracked by any tool.
              </span>
            </span>
          </label>
        </Card>
      </div>

      <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
        <div className="overflow-hidden rounded-2xl border border-line-strong bg-ink-raised/50">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
            <p className="text-sm text-muted">Preview</p>
            {recipients.length > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Previous recipient"
                  onClick={() => setPreviewIndex((i) => (i - 1 + recipients.length) % recipients.length)}
                  className="press grid size-7 place-items-center rounded-md text-muted hover:bg-white/5"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <span className="tabular text-xs text-faint">
                  {previewIndex + 1} / {recipients.length}
                </span>
                <button
                  type="button"
                  aria-label="Next recipient"
                  onClick={() => setPreviewIndex((i) => (i + 1) % recipients.length)}
                  className="press grid size-7 place-items-center rounded-md text-muted hover:bg-white/5"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            )}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-b border-line px-4 py-3 text-sm">
            <dt className="text-faint">From</dt>
            <dd className="truncate">{account ? `${senderName} <${account.email}>` : "–"}</dd>
            <dt className="text-faint">To</dt>
            <dd className="truncate">
              {previewRow.name ? `${previewRow.name} <${previewRow.email}>` : previewRow.email}
              {previewRow === SAMPLE && <span className="ml-2 text-faint">(sample)</span>}
            </dd>
            <dt className="text-faint">Subject</dt>
            <dd className="truncate font-medium">{subject || "–"}</dd>
          </dl>
          <iframe
            title="Email preview"
            sandbox=""
            srcDoc={html}
            className="h-[420px] w-full bg-[#fff]"
          />
        </div>

        <div className="rounded-2xl border border-line-strong bg-ink-raised/50 p-4">
          {notice && (
            <p
              role={notice.tone === "ok" ? "status" : "alert"}
              className={cn("mb-3 text-sm", notice.tone === "ok" ? "text-glow" : "text-red-300")}
            >
              {notice.text}
            </p>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm text-muted">
              Send at (optional)
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                className={cn(inputClass, "w-full")}
              />
            </label>
            <Button onClick={launch} disabled={pending || total === 0 || !account}>
              <Send className="size-3.5" />
              {scheduleAt ? "Schedule" : `Send to ${total}`}
            </Button>
          </div>
          {account && total > account.dailyLimit && (
            <p className="mt-2 text-xs text-faint">
              At {account.dailyLimit} a day this takes about {days} days. Ripple keeps sending until it’s done.
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <Button variant="secondary" size="sm" onClick={save} disabled={pending}>
              Save draft
            </Button>
            <Button variant="secondary" size="sm" onClick={test} disabled={pending || !account}>
              Send me a test
            </Button>
            {form.id && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                disabled={pending}
                onClick={() => {
                  if (confirm("Delete this draft? This can’t be undone.")) run(() => deleteDraft(form.id!));
                }}
              >
                <Trash2 className="size-3.5" />
                Delete
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line-strong bg-ink-raised/40 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-medium">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("flex flex-col gap-1.5 text-sm text-muted", className)}>
      {label}
      {children}
    </label>
  );
}
