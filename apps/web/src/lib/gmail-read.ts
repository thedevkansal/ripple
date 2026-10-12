import "server-only";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export class GmailReadError extends Error {
  constructor(
    /** "auth": the token is dead; "scope": read access wasn't granted; "other": anything else. */
    readonly kind: "auth" | "scope" | "notfound" | "other",
    message: string,
  ) {
    super(message);
  }
}

async function get<T>(token: string, path: string, params: Record<string, string> = {}): Promise<T> {
  const url = `${API}${path}${Object.keys(params).length ? `?${new URLSearchParams(params)}` : ""}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (res.ok) return res.json() as Promise<T>;
  const body = await res.json().catch(() => ({}));
  const message: string = body?.error?.message ?? `Gmail returned ${res.status}`;
  if (res.status === 401) throw new GmailReadError("auth", message);
  if (res.status === 403 && /insufficient|scope|permission/i.test(message)) throw new GmailReadError("scope", message);
  if (res.status === 404) throw new GmailReadError("notfound", message);
  throw new GmailReadError("other", message);
}

// ─── Shapes ──────────────────────────────────────────────────────────

interface GmailPart {
  mimeType?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: GmailPart;
}

export interface MailItem {
  id: string;
  threadId: string;
  from: { email: string; name: string | null };
  to: string;
  cc: string;
  replyTo: string | null;
  subject: string;
  date: Date;
  /** RFC 822 Message-ID, for In-Reply-To and References. */
  rfcId: string | null;
  references: string[];
  snippet: string;
  text: string;
  fromMe: boolean;
}

// ─── Pure helpers (tested) ───────────────────────────────────────────

/** `"Priya S" <p@x.com>` → { email, name }. */
export function parseAddress(value: string): { email: string; name: string | null } {
  const angle = /^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/.exec(value);
  if (angle) return { email: angle[2].trim().toLowerCase(), name: angle[1]?.trim() || null };
  const bare = /[^\s<>,;]+@[^\s<>,;]+/.exec(value);
  return { email: (bare?.[0] ?? value).trim().toLowerCase(), name: null };
}

const decode = (data: string) => Buffer.from(data, "base64url").toString("utf8");

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

/** Rough HTML → text for mails that only have an HTML part. */
export function htmlToText(html: string) {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#?\w+);/g, (m, e: string) => ENTITIES[e.toLowerCase()] ?? (e.startsWith("#") ? String.fromCharCode(Number(e.slice(1))) : m))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The readable body of a message: its text part, or its HTML part flattened. */
export function bodyText(part: GmailPart | undefined): string {
  if (!part) return "";
  const find = (p: GmailPart, type: string): GmailPart | null => {
    if (p.mimeType === type && p.body?.data) return p;
    for (const child of p.parts ?? []) {
      const hit = find(child, type);
      if (hit) return hit;
    }
    return null;
  };
  const plain = find(part, "text/plain");
  if (plain?.body?.data) return decode(plain.body.data).replace(/\r\n/g, "\n").trim();
  const html = find(part, "text/html");
  return html?.body?.data ? htmlToText(decode(html.body.data)) : "";
}

/** Splits off the quoted earlier conversation most mail apps add under a reply. */
export function splitQuoted(text: string): { main: string; quoted: string } {
  const lines = text.split("\n");
  const markers = [
    /^On .{4,200}wrote:\s*$/i,
    /^On .{4,200}$/i, // "On Mon, 12 Oct… <x@y.com>" wrapped onto two lines; checked with the next line below
    /^-{2,}\s*Original Message\s*-{2,}/i,
    /^From:\s.+/i,
    /^>/,
  ];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    const next = lines[i + 1]?.trim() ?? "";
    const isMarker =
      markers[0].test(line) ||
      (markers[1].test(line) && /wrote:\s*$/i.test(next)) ||
      markers[2].test(line) ||
      (markers[3].test(line) && /^(Sent|Date):\s/i.test(next)) ||
      (markers[4].test(line) && lines.slice(i).every((l) => !l.trim() || l.startsWith(">")));
    if (isMarker) return { main: lines.slice(0, i).join("\n").trim(), quoted: lines.slice(i).join("\n").trim() };
  }
  return { main: text.trim(), quoted: "" };
}

export function toMailItem(m: GmailMessage, accountEmail: string): MailItem {
  const headers = new Map((m.payload?.headers ?? []).map((h) => [h.name.toLowerCase(), h.value]));
  const from = parseAddress(headers.get("from") ?? "");
  const dateHeader = headers.get("date");
  const date = m.internalDate ? new Date(Number(m.internalDate)) : dateHeader ? new Date(dateHeader) : new Date();
  return {
    id: m.id,
    threadId: m.threadId,
    from,
    to: headers.get("to") ?? "",
    cc: headers.get("cc") ?? "",
    replyTo: headers.get("reply-to") ?? null,
    subject: headers.get("subject") ?? "",
    date,
    rfcId: headers.get("message-id") ?? null,
    references: (headers.get("references") ?? "").split(/\s+/).filter(Boolean),
    snippet: (m.snippet ?? "").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&"),
    text: bodyText(m.payload),
    fromMe: from.email === accountEmail.toLowerCase() || !!m.labelIds?.includes("SENT"),
  };
}

// ─── API calls ───────────────────────────────────────────────────────

/** Message and thread IDs matching a Gmail search, newest first. */
export async function searchMessages(token: string, q: string, max = 300) {
  const found: { id: string; threadId: string }[] = [];
  let pageToken: string | undefined;
  do {
    const page = await get<{ messages?: { id: string; threadId: string }[]; nextPageToken?: string }>(token, "/messages", {
      q,
      maxResults: "100",
      ...(pageToken ? { pageToken } : {}),
    });
    found.push(...(page.messages ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken && found.length < max);
  return found.slice(0, max);
}

export async function getMessage(token: string, id: string, accountEmail: string) {
  return toMailItem(await get<GmailMessage>(token, `/messages/${id}`, { format: "full" }), accountEmail);
}

/** Thread ID of a sent message, for emails sent before Ripple stored it. */
export async function getThreadId(token: string, id: string) {
  return (await get<GmailMessage>(token, `/messages/${id}`, { format: "minimal" })).threadId;
}

export async function getThread(token: string, threadId: string, accountEmail: string) {
  const thread = await get<{ messages?: GmailMessage[] }>(token, `/threads/${threadId}`, { format: "full" });
  return (thread.messages ?? []).map((m) => toMailItem(m, accountEmail));
}
