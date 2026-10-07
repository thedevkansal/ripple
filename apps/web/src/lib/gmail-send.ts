import "server-only";
import { randomBytes } from "node:crypto";

const SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

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

const base64Lines = (s: string) => Buffer.from(s, "utf8").toString("base64").replace(/.{76}/g, "$&\r\n");

export interface OutgoingEmail {
  from: { email: string; name?: string | null };
  to: { email: string; name?: string | null };
  subject: string;
  html: string;
  text: string;
}

export function buildMime(email: OutgoingEmail): string {
  // Strip CR/LF so no value can inject extra headers.
  const clean = (s: string) => s.replace(/[\r\n]+/g, " ").trim();
  const boundary = `rpl_${randomBytes(12).toString("hex")}`;
  return [
    `From: ${formatAddress(clean(email.from.email), email.from.name && clean(email.from.name))}`,
    `To: ${formatAddress(clean(email.to.email), email.to.name && clean(email.to.name))}`,
    `Subject: ${encodeHeader(clean(email.subject))}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(email.text),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(email.html),
    `--${boundary}--`,
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
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: Buffer.from(buildMime(email), "utf8").toString("base64url") }),
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
