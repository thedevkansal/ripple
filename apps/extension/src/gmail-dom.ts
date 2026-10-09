/**
 * Everything that depends on Gmail's (undocumented) markup lives here, so a Gmail redesign means
 * fixing one file. Each lookup has a fallback where Gmail has used more than one structure.
 */

export const BODY_SELECTOR = 'div[contenteditable="true"][role="textbox"], div[contenteditable="true"][g_editable="true"]';

/** Gmail's Send button: class aoO has been stable for years; the tooltip is a fallback. */
export const SEND_SELECTOR = 'div[role="button"].aoO, div[role="button"][data-tooltip^="Send"]';

export function isSendButton(el: Element | null): el is HTMLElement {
  return !!el && el.matches(SEND_SELECTOR) && !el.closest(".ripple-toggle");
}

/** The compose window (or inline reply) a Send button belongs to: the nearest ancestor holding a body. */
export function composeRootFor(sendButton: Element): HTMLElement | null {
  let el: HTMLElement | null = sendButton.parentElement;
  for (let i = 0; el && i < 30; i++, el = el.parentElement) {
    if (el.querySelector(BODY_SELECTOR)) return el;
  }
  return null;
}

export function composeBody(root: Element): HTMLElement | null {
  return root.querySelector<HTMLElement>(BODY_SELECTOR);
}

const EMAIL_RE = /[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}/gi;

/** Every recipient address in the compose window (To, Cc and Bcc chips, plus hidden inputs). */
export function composeRecipients(root: Element): string[] {
  const found = new Set<string>();
  const add = (v: string | null | undefined) => v?.match(EMAIL_RE)?.forEach((e) => found.add(e.toLowerCase()));
  root.querySelectorAll("[email]").forEach((el) => add(el.getAttribute("email")));
  root.querySelectorAll("[data-hovercard-id]").forEach((el) => add(el.getAttribute("data-hovercard-id")));
  root.querySelectorAll<HTMLInputElement>('input[name="to"], input[name="cc"], input[name="bcc"]').forEach((el) => add(el.value));
  return [...found];
}

/** The subject: the compose field, or for an inline reply the thread's heading. */
export function composeSubject(root: Element): string {
  const input = root.querySelector<HTMLInputElement>('input[name="subjectbox"]');
  if (input?.value) return input.value;
  return document.querySelector("h2.hP")?.textContent?.trim() ?? "";
}

/** Quoted earlier messages in a reply: their links and pixels belong to older emails. */
export function isQuoted(el: Element): boolean {
  return !!el.closest(".gmail_quote, blockquote");
}

/** Where to put the Track switch: right after the Send button's toolbar cell. */
export function toggleAnchor(sendButton: Element): { parent: Element; before: Element | null } | null {
  const cell = sendButton.closest("td");
  if (cell?.parentElement) return { parent: cell.parentElement, before: cell.nextElementSibling };
  const parent = sendButton.parentElement;
  return parent ? { parent, before: sendButton.nextElementSibling } : null;
}

/** The rendered body of a message in a thread, which contains the (proxied) images. */
export function messageBodyFor(img: Element): HTMLElement | null {
  return img.closest<HTMLElement>(".a3s");
}

/** Rows in the current mailbox list (Sent folder). */
export function listRows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("tr.zA")];
}

export function rowSubject(row: Element): string {
  return row.querySelector(".bog")?.textContent?.trim() ?? "";
}

export function rowRecipients(row: Element): string[] {
  return [...row.querySelectorAll("[email]")].map((el) => el.getAttribute("email")!.toLowerCase());
}

export function inSentFolder(): boolean {
  return /^#(sent|label\/sent)/i.test(location.hash);
}
