import "server-only";
import {
  clickUrl,
  instrumentHtml,
  renderTemplate,
  textToHtml,
  textToPlain,
  type MergeVars,
  type TrackedLink,
} from "@ripple/shared";
import type { MailAttachment } from "@/lib/gmail-send";
import { appUrl } from "@/lib/google";

export interface ComposeCampaign {
  subject: string;
  body: string;
  trackClicks: boolean;
  linkAttachments: boolean;
  attachments: { name: string; size: number; contentType: string; url: string }[];
}

export type FileLoader = (url: string) => Promise<Buffer>;

/** Downloads each attachment once per run, however many emails carry it. */
export function createFileLoader(): FileLoader {
  const cache = new Map<string, Promise<Buffer>>();
  return (url) => {
    let file = cache.get(url);
    if (!file) {
      file = fetch(url, { cache: "no-store" }).then(async (res) => {
        if (!res.ok) throw new Error(`Couldn't load attachment (${res.status})`);
        return Buffer.from(await res.arrayBuffer());
      });
      cache.set(url, file);
    }
    return file;
  };
}

export interface ComposedEmail {
  subject: string;
  html: string;
  text: string;
  links: TrackedLink[];
  attachments: MailAttachment[];
}

/**
 * Renders one recipient's email. With a token, the pixel and click tracking are added;
 * without one (test sends) the email is untracked.
 */
export async function composeEmail(
  campaign: ComposeCampaign,
  vars: MergeVars,
  token: string | null,
  loadFile: FileLoader,
): Promise<ComposedEmail> {
  const subject = renderTemplate(campaign.subject, vars).output;
  const bodyText = renderTemplate(campaign.body, vars).output;
  const files = campaign.linkAttachments ? campaign.attachments : [];

  let html = textToHtml(bodyText, { files });
  let links: TrackedLink[] = [];
  let plainFiles = files;

  if (token) {
    const base = appUrl();
    ({ html, links } = instrumentHtml(html, { baseUrl: base, token, trackClicks: campaign.trackClicks }));
    // The plain-text part should count clicks too.
    const indexByUrl = new Map(links.map((l) => [l.url, l.index]));
    plainFiles = files.map((f) => {
      const index = indexByUrl.get(f.url);
      return index === undefined ? f : { ...f, url: clickUrl(base, token, index) };
    });
  }

  const attachments = await Promise.all(
    campaign.attachments.map(async (a) => ({
      filename: a.name,
      contentType: a.contentType,
      data: await loadFile(a.url),
    })),
  );

  return { subject, html, text: textToPlain(bodyText, { files: plainFiles }), links, attachments };
}
