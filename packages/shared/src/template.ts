export type MergeVars = Record<string, string | null | undefined>;

const FIELD_RE = /\{\{\s*([a-zA-Z][\w ]*?)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g;

/** "First Name" / "first-name" / "firstName" → "first_name" */
export function normalizeKey(key: string): string {
  return key
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export interface RenderResult {
  output: string;
  /** Fields that had no value and no fallback. */
  missing: string[];
}

/** Fills `{{field}}` and `{{field|fallback}}` placeholders. */
export function renderTemplate(template: string, vars: MergeVars): RenderResult {
  const missing = new Set<string>();
  const output = template.replace(FIELD_RE, (_, rawKey: string, fallback?: string) => {
    const key = normalizeKey(rawKey);
    const value = vars[key]?.trim();
    if (value) return value;
    if (fallback !== undefined) return fallback;
    missing.add(key);
    return "";
  });
  return { output, missing: [...missing] };
}

export function listMergeFields(template: string): string[] {
  const keys = new Set<string>();
  for (const m of template.matchAll(FIELD_RE)) keys.add(normalizeKey(m[1]));
  return [...keys];
}

export interface ContactLike {
  email: string;
  name?: string | null;
  org?: string | null;
  fields?: Record<string, unknown> | null;
}

export function contactVars(contact: ContactLike): MergeVars {
  const name = contact.name?.trim() ?? "";
  const [first, ...rest] = name.split(/\s+/);
  const vars: MergeVars = {};
  for (const [k, v] of Object.entries(contact.fields ?? {})) {
    if (v != null && v !== "") vars[normalizeKey(k)] = String(v);
  }
  return {
    ...vars,
    email: contact.email,
    name: name || undefined,
    first_name: first || undefined,
    last_name: rest.join(" ") || undefined,
    org: contact.org ?? undefined,
    company: contact.org ?? undefined,
  };
}

// ─── Plain text → email HTML ─────────────────────────────────────────

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// [label](url)  or a bare URL (trailing punctuation excluded).
const LINK_RE = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]*[^\s<.,;:!?)\]'"])/g;

function inlineToHtml(text: string): string {
  let html = "";
  let last = 0;
  const formatText = (s: string) =>
    escapeHtml(s)
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");

  for (const m of text.matchAll(LINK_RE)) {
    html += formatText(text.slice(last, m.index));
    const url = m[2] ?? m[3];
    const label = m[1] ?? m[3];
    html += `<a href="${escapeHtml(url)}" style="color:#1a73e8">${escapeHtml(label)}</a>`;
    last = m.index + m[0].length;
  }
  return html + formatText(text.slice(last));
}

/**
 * Turns the plain text an organiser writes into a simple, client-safe HTML email.
 * Blank lines make paragraphs; `[label](url)` and bare URLs become links; `**bold**` is bold.
 */
export function textToHtml(text: string): string {
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px">${inlineToHtml(p)}</p>`)
    .join("");
  return `<!doctype html><html><body><div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#202124">${paragraphs}</div></body></html>`;
}

/** Plain-text alternative part: markdown links become "label (url)". */
export function textToPlain(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1");
}
