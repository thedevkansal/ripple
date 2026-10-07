export type MailClient =
  | "gmail"
  | "apple-mail"
  | "outlook"
  | "yahoo"
  | "thunderbird"
  | "browser"
  | "unknown";

export type Device = "desktop" | "mobile" | "tablet" | "unknown";

export interface Signal {
  userAgent: string | null | undefined;
  ip?: string | null;
  at: Date;
  sentAt?: Date | null;
}

export interface Classification {
  client: MailClient;
  device: Device;
  /** Fetched through a mail provider's image proxy: timing is real, IP/device are not. */
  isProxy: boolean;
  /** Fetched automatically, not by a human opening the mail (Apple MPP, security scanners). */
  isPrefetch: boolean;
  isBot: boolean;
}

/** Events this soon after sending are almost always scanners or the sender's own view. */
export const PREFETCH_WINDOW_MS = 10_000;

/** Gmail fetches images at delivery, a few seconds after sending. Nobody has read it yet. */
export const GMAIL_PREFETCH_WINDOW_MS = 30_000;

/**
 * Gmail's image proxy. It used the "GoogleImageProxy" UA for years; it now sends a fixed,
 * years-old Edge UA with a trailing "Mozilla/5.0".
 */
const GMAIL_PROXY_UA = /GoogleImageProxy|ggpht\.com|Edge\/12\.246 Mozilla\/5\.0$/i;

/** Google's proxy ranges (rate-limited-proxy-*.google.com and friends). */
const GOOGLE_PROXY_IP = /^(66\.249\.(8[0-9]|9[0-5])|66\.102\.([0-9]|1[0-5])|64\.233\.(1[6-8][0-9]|19[01])|74\.125)\./;

const BOT_RE =
  /bot\b|crawler|spider|scanner|barracuda|mimecast|proofpoint|python-requests|curl\/|wget|headlesschrome|go-http-client|okhttp|java\/|libwww|httpclient/i;

function detectClient(
  ua: string,
  ip: string | null | undefined,
): { client: MailClient; isProxy: boolean; isApplePrefetch: boolean } {
  if (GMAIL_PROXY_UA.test(ua) || (ip && GOOGLE_PROXY_IP.test(ip)))
    return { client: "gmail", isProxy: true, isApplePrefetch: false };
  if (/YahooMailProxy/i.test(ua)) return { client: "yahoo", isProxy: true, isApplePrefetch: false };
  // Apple Mail Privacy Protection fetches with a bare "Mozilla/5.0" from Apple's proxies.
  if (ua.trim() === "Mozilla/5.0") return { client: "apple-mail", isProxy: true, isApplePrefetch: true };
  if (/Microsoft Outlook|MSOffice|ms-office|Outlook-iOS|Outlook-Android|OneOutlook/i.test(ua))
    return { client: "outlook", isProxy: false, isApplePrefetch: false };
  if (/Thunderbird/i.test(ua)) return { client: "thunderbird", isProxy: false, isApplePrefetch: false };
  // Apple Mail's own WebKit view: AppleWebKit without a browser token.
  if (/AppleWebKit/i.test(ua) && !/Safari|Chrome|CriOS|FxiOS|Edg/i.test(ua))
    return { client: "apple-mail", isProxy: false, isApplePrefetch: false };
  if (/Chrome|Firefox|Safari|Edg/i.test(ua)) return { client: "browser", isProxy: false, isApplePrefetch: false };
  return { client: "unknown", isProxy: false, isApplePrefetch: false };
}

function detectDevice(ua: string): Device {
  if (/iPad|Tablet/i.test(ua)) return "tablet";
  if (/Mobile|iPhone|Android|Outlook-iOS|Outlook-Android/i.test(ua)) return "mobile";
  if (/Windows|Macintosh|Mac OS X|X11|Linux|CrOS/i.test(ua)) return "desktop";
  return "unknown";
}

export function classify(signal: Signal): Classification {
  const ua = signal.userAgent ?? "";
  const { client, isProxy, isApplePrefetch } = detectClient(ua, signal.ip);
  const isBot = ua === "" || BOT_RE.test(ua);
  const window = client === "gmail" ? GMAIL_PREFETCH_WINDOW_MS : PREFETCH_WINDOW_MS;
  const tooSoon = signal.sentAt != null && signal.at.getTime() - signal.sentAt.getTime() < window;

  return {
    client,
    device: isProxy ? "unknown" : detectDevice(ua),
    isProxy,
    isPrefetch: isApplePrefetch || tooSoon,
    isBot,
  };
}

/**
 * Whether to withhold the pixel from this fetch. Gmail caches whatever its proxy gets at delivery
 * and serves that copy on every open, so answering the delivery fetch with an image would hide
 * all real opens. Refusing it makes Gmail fetch again when the email is actually opened.
 */
export function shouldWithholdPixel(c: Classification): boolean {
  return c.client === "gmail" && c.isProxy && c.isPrefetch;
}
