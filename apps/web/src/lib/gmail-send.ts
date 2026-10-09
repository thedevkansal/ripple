import "server-only";
import { randomBytes } from "node:crypto";

// Media upload takes raw RFC 2822 up to 35 MB, so attachments fit.
const SEND_URL = "https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media";

const isAscii = (s: string) => /^[\x20-\x7e]*$/.test(s);

/** RFC 2047 encoded-word for non-ASCII header values. */
function encodeHeader(value: string) {
  return isAscii(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function formatAddress(email: string, name?: string | null) {
  if (!name) return email;
  const display = isAscii(name) ? `"${name.replace(/["\\]/g, "\\$&")}"` : encodeHeader(name);
  return `${display} <${email}>`;
}

const base64Lines = (data: string | Buffer) =>
  (typeof data === "string" ? Buffer.from(data, "utf8") : data).toString("base64").replace(/.{76}/g, "$&\r\n");

// Strip CR/LF so no value can inject extra headers.
const clean = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

/** RFC 2231 filename parameter, with an ASCII fallback for older clients. */
function filenameParams(name: string) {
  const safe = clean(name).replace(/["\\]/g, "_");
  if (isAscii(safe)) return `filename="${safe}"`;
  const ascii = safe.replace(/[^\x20-\x7e]/g, "_");
  return `filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

export interface MailAttachment {
  filename: string;
  contentType: string;
  data: Buffer;
}

export interface OutgoingEmail {
  from: { email: string; name?: string | null };
  to: { email: string; name?: string | null };
  cc?: string[];
  subject: string;
  html: string;
  text: string;
  attachments?: MailAttachment[];
}

const boundary = () => `rpl_${randomBytes(12).toString("hex")}`;

export function buildMime(email: OutgoingEmail): string {
  const alt = boundary();
  const alternative = [
    `--${alt}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(email.text),
    `--${alt}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(email.html),
    `--${alt}--`,
  ];

  const headers = [
    `From: ${formatAddress(clean(email.from.email), email.from.name && clean(email.from.name))}`,
    `To: ${formatAddress(clean(email.to.email), email.to.name && clean(email.to.name))}`,
    ...(email.cc?.length ? [`Cc: ${email.cc.map((a) => clean(a)).join(", ")}`] : []),
    `Subject: ${encodeHeader(clean(email.subject))}`,
    "MIME-Version: 1.0",
  ];

  if (!email.attachments?.length) {
    return [...headers, `Content-Type: multipart/alternative; boundary="${alt}"`, "", ...alternative, ""].join("\r\n");
  }

  const mixed = boundary();
  const parts = email.attachments.flatMap((a) => [
    `--${mixed}`,
    `Content-Type: ${clean(a.contentType)}; name="${clean(a.filename).replace(/["\\]/g, "_")}"`,
    `Content-Disposition: attachment; ${filenameParams(a.filename)}`,
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(a.data),
  ]);
  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    "",
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    "",
    ...alternative,
    ...parts,
    `--${mixed}--`,
    "",
  ].join("\r\n");
}

export type SendFailure = "auth" | "quota" | "permanent" | "transient";

export class GmailSendError extends Error {
  constructor(
    readonly kind: SendFailure,
    message: string,
  ) {
    super(message);
  }
}

export async function sendViaGmail(accessToken: string, email: OutgoingEmail): Promise<{ id: string }> {
  let res: Response;
  try {
    res = await fetch(SEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "message/rfc822" },
      body: buildMime(email),
      cache: "no-store",
    });
  } catch (err) {
    throw new GmailSendError("transient", `Network error: ${(err as Error).message}`);
  }
  if (res.ok) return res.json();

  const body = await res.json().catch(() => ({}));
  const message: string = body?.error?.message ?? `Gmail returned ${res.status}`;
  const reason: string = body?.error?.errors?.[0]?.reason ?? "";

  if (res.status === 401) throw new GmailSendError("auth", message);
  if (res.status === 429 || /rateLimit|dailyLimit|quota/i.test(reason)) throw new GmailSendError("quota", message);
  if (res.status === 403 && /insufficient/i.test(message)) throw new GmailSendError("auth", message);
  if (res.status >= 500) throw new GmailSendError("transient", message);
  throw new GmailSendError("permanent", message);
}
