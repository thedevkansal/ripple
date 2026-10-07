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

const BOT_RE =
  /bot\b|crawler|spider|scanner|barracuda|mimecast|proofpoint|python-requests|curl\/|wget|headlesschrome|go-http-client|okhttp|java\/|libwww|httpclient/i;

function detectClient(ua: string): { client: MailClient; isProxy: boolean; isApplePrefetch: boolean } {
  if (/GoogleImageProxy|ggpht\.com/i.test(ua)) return { client: "gmail", isProxy: true, isApplePrefetch: false };
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
  const { client, isProxy, isApplePrefetch } = detectClient(ua);
  const isBot = ua === "" || BOT_RE.test(ua);
  const tooSoon =
    signal.sentAt != null && signal.at.getTime() - signal.sentAt.getTime() < PREFETCH_WINDOW_MS;

  return {
    client,
    device: isProxy ? "unknown" : detectDevice(ua),
    isProxy,
    isPrefetch: isApplePrefetch || tooSoon,
    isBot,
  };
}
