import { describe, expect, test } from "bun:test";
import {
  classify,
  shouldWithholdPixel,
  generateToken,
  instrumentHtml,
  isValidToken,
  summarize,
  TOKEN_LENGTH,
  type EventLike,
} from "./index";

const BASE = "https://ripple.test";

describe("token", () => {
  test("generates valid unique tokens", () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generateToken()));
    expect(tokens.size).toBe(1000);
    for (const t of tokens) {
      expect(t).toHaveLength(TOKEN_LENGTH);
      expect(isValidToken(t)).toBe(true);
    }
  });

  test("rejects malformed tokens", () => {
    expect(isValidToken("short")).toBe(false);
    expect(isValidToken("a".repeat(21) + "!")).toBe(false);
  });
});

describe("instrumentHtml", () => {
  test("rewrites http links, dedupes urls, skips mailto, puts pixel at top of body", () => {
    const html = `<html><body>
      <a href="https://esummit.in/speakers?a=1&amp;b=2">Speakers</a>
      <a href='https://esummit.in/speakers?a=1&amp;b=2'>Again</a>
      <a href="mailto:me@x.com">Mail</a>
      <a class="btn" href="http://deck.pdf">Deck</a>
    </body></html>`;
    const { html: out, links } = instrumentHtml(html, { baseUrl: BASE + "/", token: "T" });

    expect(links).toEqual([
      { index: 0, url: "https://esummit.in/speakers?a=1&b=2" },
      { index: 1, url: "http://deck.pdf" },
    ]);
    expect(out).toContain(`href="${BASE}/t/c/T/0"`);
    expect(out).toContain(`href='${BASE}/t/c/T/0'`);
    expect(out).toContain(`class="btn" href="${BASE}/t/c/T/1"`);
    expect(out).toContain(`href="mailto:me@x.com"`);
    expect(out).toMatch(/^<html><body><img src="https:\/\/ripple\.test\/t\/o\/T\.gif"[^>]*\/>/);
  });

  test("puts the pixel first when there is no body tag and respects trackClicks=false", () => {
    const { html, links } = instrumentHtml(`<p><a href="https://a.com">a</a></p>`, {
      baseUrl: BASE,
      token: "T",
      trackClicks: false,
    });
    expect(links).toHaveLength(0);
    expect(html).toMatch(/^<img [^>]*\/><p><a href="https:\/\/a\.com">a<\/a><\/p>$/);
  });
});

describe("classify", () => {
  const at = new Date("2026-10-08T10:00:00Z");
  const sentAt = new Date("2026-10-08T09:00:00Z");

  test("gmail proxy", () => {
    const c = classify({
      userAgent: "Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)",
      at,
      sentAt,
    });
    expect(c).toMatchObject({ client: "gmail", isProxy: true, isPrefetch: false, isBot: false, device: "unknown" });
  });

  test("apple MPP is prefetch", () => {
    expect(classify({ userAgent: "Mozilla/5.0", at, sentAt })).toMatchObject({
      client: "apple-mail",
      isPrefetch: true,
    });
  });

  test("apple mail on iPhone", () => {
    const c = classify({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
      at,
      sentAt,
    });
    expect(c).toMatchObject({ client: "apple-mail", device: "mobile", isPrefetch: false });
  });

  test("outlook desktop", () => {
    const c = classify({
      userAgent: "Mozilla/4.0 (compatible; ms-office; MSOffice 16) Windows NT 10.0",
      at,
      sentAt,
    });
    expect(c).toMatchObject({ client: "outlook", device: "desktop" });
  });

  test("scanner right after send", () => {
    const c = classify({ userAgent: "python-requests/2.31", at: new Date(sentAt.getTime() + 2000), sentAt });
    expect(c.isBot).toBe(true);
    expect(c.isPrefetch).toBe(true);
  });
});

describe("summarize", () => {
  const sentAt = new Date("2026-10-08T09:00:00Z");
  const t = (min: number) => new Date(sentAt.getTime() + min * 60_000);
  const open = (min: number, extra: Partial<EventLike> = {}): EventLike => ({
    type: "open",
    at: t(min),
    isPrefetch: false,
    isBot: false,
    ...extra,
  });

  test("collapses bursts and computes intervals", () => {
    const s = summarize(
      [open(120), open(120.1), open(60 * 24 + 120), { ...open(130), type: "click" }, open(0.05, { isPrefetch: true })],
      sentAt,
    );
    expect(s.rawOpens).toBe(4);
    expect(s.opens).toBe(2);
    expect(s.clicks).toBe(1);
    expect(s.timeToFirstOpenMs).toBe(120 * 60_000);
    expect(s.intervalsMs).toEqual([24 * 60 * 60_000]);
    expect(s.score).toBe(2 * 10 + 15 + 5);
  });

  test("prefetch-only is flagged", () => {
    const s = summarize([open(0.01, { isPrefetch: true })], sentAt);
    expect(s.opens).toBe(0);
    expect(s.onlyPrefetched).toBe(true);
    expect(s.score).toBe(5);
  });
});

describe("gmail delivery prefetch", () => {
  const sentAt = new Date("2026-10-07T17:31:36Z");
  const NEW_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.135 Safari/537.36 Edge/12.246 Mozilla/5.0";

  test("current proxy UA is gmail; the delivery fetch is withheld", () => {
    const c = classify({ userAgent: NEW_UA, ip: "66.249.91.171", at: new Date(sentAt.getTime() + 3_772), sentAt });
    expect(c).toMatchObject({ client: "gmail", isProxy: true, isPrefetch: true });
    expect(shouldWithholdPixel(c)).toBe(true);
  });

  test("a later proxy fetch is a real open and gets the pixel", () => {
    const c = classify({ userAgent: NEW_UA, ip: "66.249.91.171", at: new Date(sentAt.getTime() + 5 * 60_000), sentAt });
    expect(c).toMatchObject({ client: "gmail", isPrefetch: false });
    expect(shouldWithholdPixel(c)).toBe(false);
  });

  test("an instant open right after the delivery fetch still counts", () => {
    const c = classify({
      userAgent: NEW_UA,
      ip: "66.249.91.171",
      at: new Date(sentAt.getTime() + 6_000),
      sentAt,
      priorGmailFetches: 1,
    });
    expect(c.isPrefetch).toBe(false);
    expect(shouldWithholdPixel(c)).toBe(false);
  });

  test("google proxy IP alone identifies gmail", () => {
    expect(classify({ userAgent: "Mozilla/5.0 (X11)", ip: "66.102.8.1", at: new Date(), sentAt }).client).toBe("gmail");
    expect(classify({ userAgent: "Mozilla/5.0 (X11)", ip: "8.8.8.8", at: new Date(), sentAt }).client).not.toBe("gmail");
  });

  test("non-gmail early fetches are never withheld", () => {
    const c = classify({ userAgent: "Mozilla/5.0", at: new Date(sentAt.getTime() + 1_000), sentAt });
    expect(shouldWithholdPixel(c)).toBe(false);
  });
});

describe("self views", () => {
  test("the sender's own views count for nothing, not even 'maybe'", () => {
    const sentAt = new Date("2026-10-09T10:00:00Z");
    const s = summarize(
      [{ type: "open", at: new Date("2026-10-09T10:05:00Z"), isPrefetch: false, isBot: false, isSelf: true }],
      sentAt,
    );
    expect(s).toMatchObject({ opens: 0, rawOpens: 0, onlyPrefetched: false, score: 0 });
  });
});
