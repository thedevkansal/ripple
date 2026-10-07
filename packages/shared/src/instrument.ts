export interface TrackedLink {
  index: number;
  url: string;
}

export interface InstrumentOptions {
  /** Public origin of the tracking server, e.g. https://ripple.app */
  baseUrl: string;
  token: string;
  trackClicks?: boolean;
}

export interface InstrumentResult {
  html: string;
  links: TrackedLink[];
}

const trimSlash = (s: string) => s.replace(/\/+$/, "");

export function pixelUrl(baseUrl: string, token: string): string {
  return `${trimSlash(baseUrl)}/t/o/${token}.gif`;
}

export function clickUrl(baseUrl: string, token: string, index: number): string {
  return `${trimSlash(baseUrl)}/t/c/${token}/${index}`;
}

export function pixelTag(baseUrl: string, token: string): string {
  // Not display:none: some clients skip loading hidden images.
  return `<img src="${pixelUrl(baseUrl, token)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;margin:0;padding:0;opacity:0" />`;
}

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const ANCHOR_HREF_RE = /(<a\b[^>]*?\bhref\s*=\s*)(["'])(.*?)\2/gi;

/**
 * Rewrites http(s) links to go through the click redirect and appends the open pixel.
 * Identical URLs share one index so per-link stats aggregate naturally.
 */
export function instrumentHtml(html: string, opts: InstrumentOptions): InstrumentResult {
  const { baseUrl, token, trackClicks = true } = opts;
  const links: TrackedLink[] = [];
  const indexByUrl = new Map<string, number>();

  let out = html;
  if (trackClicks) {
    out = out.replace(ANCHOR_HREF_RE, (match, prefix: string, quote: string, rawHref: string) => {
      const url = decodeEntities(rawHref.trim());
      if (!/^https?:\/\//i.test(url)) return match;
      if (url.startsWith(trimSlash(baseUrl) + "/t/")) return match;

      let index = indexByUrl.get(url);
      if (index === undefined) {
        index = links.length;
        indexByUrl.set(url, index);
        links.push({ index, url });
      }
      return `${prefix}${quote}${clickUrl(baseUrl, token, index)}${quote}`;
    });
  }

  // At the top: Gmail's app loads images lazily, so a pixel at the end only fires once the
  // reader scrolls down to it.
  const pixel = pixelTag(baseUrl, token);
  out = /<body[^>]*>/i.test(out) ? out.replace(/<body[^>]*>/i, (tag) => tag + pixel) : pixel + out;

  return { html: out, links };
}
