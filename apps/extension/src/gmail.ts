import {
  BODY_SELECTOR,
  composeBody,
  composeRecipients,
  composeRootFor,
  composeSubject,
  inSentFolder,
  isQuoted,
  isSendButton,
  listRows,
  messageBodyFor,
  rowRecipients,
  rowSubject,
  SEND_SELECTOR,
  toggleAnchor,
} from "./gmail-dom";
import { RIPPLE_URL, type Registered, send, SETTINGS, type Status } from "./messages";

// ─── Styles ──────────────────────────────────────────────────────────

const css = `
.ripple-toggle{display:inline-flex;align-items:center;gap:6px;height:30px;margin:0 8px;padding:0 12px 0 9px;border-radius:999px;border:1px solid #dadce0;background:#fff;color:#5f6368;font:500 13px/1 "Google Sans",Roboto,Arial,sans-serif;cursor:pointer;user-select:none;transition:background-color .15s,border-color .15s,color .15s}
.ripple-toggle:hover{background:#f1f3f4}
.ripple-toggle[aria-pressed="true"]{border-color:#0b7f70;background:#e6f4f1;color:#0b7f70}
.ripple-toggle svg{width:16px;height:16px}
.ripple-toast{position:fixed;left:50%;bottom:24px;z-index:2147483647;transform:translateX(-50%);max-width:420px;padding:10px 16px;border-radius:8px;background:#202124;color:#fff;font:14px/1.4 "Google Sans",Roboto,Arial,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.25)}
.ripple-badge{display:inline-flex;align-items:center;gap:6px;margin:4px 0 10px;padding:4px 10px;border-radius:999px;background:#e6f4f1;color:#0b5f54;font:500 12px/1.4 "Google Sans",Roboto,Arial,sans-serif}
.ripple-badge.is-unread{background:#f1f3f4;color:#5f6368}
.ripple-badge svg{width:14px;height:14px}
.ripple-tick{display:inline-flex;margin-right:6px;vertical-align:-3px;color:#9aa0a6}
.ripple-tick.is-read{color:#0b7f70}
.ripple-tick svg{width:16px;height:16px}
`;
const style = document.createElement("style");
style.textContent = css;
document.documentElement.append(style);

const LOGO = `<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><circle cx="9" cy="16" r="3.5" fill="currentColor"/><path d="M15 8.5a10.5 10.5 0 0 1 0 15" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M21 4a16 16 0 0 1 0 24" stroke="currentColor" stroke-opacity=".45" stroke-width="2.6" stroke-linecap="round"/></svg>`;
const TICK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12l5 5L18 6"/></svg>`;
const DOUBLE_TICK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12l5 5L17 6"/><path d="M11 16l1 1L23 6"/></svg>`;

function toast(text: string, ms = 5000) {
  const el = document.createElement("div");
  el.className = "ripple-toast";
  el.setAttribute("role", "status");
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.remove(), ms);
}

// ─── Compose: the Track switch ───────────────────────────────────────

interface ComposeState {
  enabled: boolean;
  /** Tracking added (or deliberately skipped): the next Send goes straight through. */
  ready: boolean;
  busy: boolean;
}
const states = new WeakMap<Element, ComposeState>();
let trackByDefault = true;
chrome.storage.sync.get(SETTINGS.trackByDefault).then((s) => {
  trackByDefault = s[SETTINGS.trackByDefault] !== false;
});

function stateFor(root: Element): ComposeState {
  let st = states.get(root);
  if (!st) {
    st = { enabled: trackByDefault, ready: false, busy: false };
    states.set(root, st);
  }
  return st;
}

function decorate(sendButton: HTMLElement) {
  if (sendButton.dataset.rippleDecorated) return;
  const root = composeRootFor(sendButton);
  const anchor = toggleAnchor(sendButton);
  if (!root || !anchor) return;
  sendButton.dataset.rippleDecorated = "1";
  const st = stateFor(root);

  const toggle = document.createElement(anchor.parent.tagName === "TR" ? "td" : "span");
  const button = document.createElement("div");
  button.className = "ripple-toggle";
  button.setAttribute("role", "button");
  button.tabIndex = 0;
  const render = () => {
    button.setAttribute("aria-pressed", String(st.enabled));
    button.innerHTML = `${LOGO}<span>${st.enabled ? "Tracking" : "Not tracked"}</span>`;
    button.title = st.enabled
      ? "Ripple will track opens and clicks on this email. Click to turn off."
      : "Click to track opens and clicks on this email with Ripple.";
  };
  const flip = () => {
    if (st.ready) return; // already instrumented for this send
    st.enabled = !st.enabled;
    render();
  };
  button.addEventListener("click", flip);
  button.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), flip()));
  render();
  toggle.append(button);
  anchor.parent.insertBefore(toggle, anchor.before);
}

// ─── Compose: adding tracking at send time ───────────────────────────

const PIXEL_RE = new RegExp(`${RIPPLE_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/t/o/([0-9A-Za-z]{22})\\.gif`);

async function instrument(root: Element): Promise<"tracked" | "skipped"> {
  const body = composeBody(root);
  if (!body) return "skipped";

  // Pixels from earlier emails quoted in a reply would count opens for those emails.
  body.querySelectorAll("img").forEach((img) => {
    if (PIXEL_RE.test(img.getAttribute("src") ?? "")) img.remove();
  });

  const anchors = [...body.querySelectorAll<HTMLAnchorElement>("a[href]")].filter(
    (a) => !isQuoted(a) && /^https?:\/\//i.test(a.href) && !a.href.startsWith(RIPPLE_URL),
  );
  const recipients = composeRecipients(root);
  if (!recipients.length) return "skipped";

  const res = await send<Registered>({
    type: "register",
    to: recipients,
    cc: [],
    subject: composeSubject(root),
    links: [...new Set(anchors.map((a) => a.href))],
  });
  if (!res.ok) {
    toast(
      res.unauthorized
        ? "Ripple isn’t connected, so this email was sent without tracking. Open the Ripple extension to connect."
        : `${res.error} This email was sent without tracking.`,
      7000,
    );
    return "skipped";
  }

  const tracked = new Map(res.data.links.map((l) => [l.url, l.trackedUrl]));
  for (const a of anchors) {
    const url = tracked.get(a.href);
    if (url) {
      a.setAttribute("href", url);
      a.removeAttribute("data-saferedirecturl");
    }
  }
  // First thing in the body: Gmail's app loads images lazily as the reader scrolls.
  const pixel = document.createElement("img");
  pixel.src = res.data.pixelUrl;
  pixel.width = 1;
  pixel.height = 1;
  pixel.alt = "";
  pixel.setAttribute("style", "display:block;width:1px;height:1px;border:0;margin:0;padding:0;opacity:0");
  body.prepend(pixel);
  body.dispatchEvent(new Event("input", { bubbles: true }));
  return "tracked";
}

function clickSend(sendButton: HTMLElement) {
  for (const type of ["mousedown", "mouseup", "click"]) {
    sendButton.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  }
}

async function prepareAndSend(root: Element, sendButton: HTMLElement) {
  const st = stateFor(root);
  if (st.busy) return;
  st.busy = true;
  try {
    await instrument(root);
  } catch (err) {
    console.error("[Ripple] couldn’t add tracking", err);
    toast("Ripple hit an error, so this email was sent without tracking.");
  } finally {
    st.ready = true;
    st.busy = false;
  }
  clickSend(sendButton);
  // If Gmail ignored the synthetic click, the window is still open: one more click sends it.
  setTimeout(() => {
    if (sendButton.isConnected && root.isConnected && composeBody(root)) {
      toast("Tracking is added. Click Send once more to send it.", 6000);
    }
  }, 2500);
}

function interceptPointer(e: MouseEvent) {
  if (!e.isTrusted) return; // our own synthetic click
  const sendButton = (e.target as Element | null)?.closest?.(SEND_SELECTOR) ?? null;
  if (!isSendButton(sendButton)) return;
  const root = composeRootFor(sendButton);
  if (!root) return;
  const st = stateFor(root);
  if (!st.enabled || st.ready) return;

  // Hold the whole click gesture until tracking is in place.
  e.preventDefault();
  e.stopImmediatePropagation();
  // Cancelling pointerdown suppresses mousedown, so start on whichever arrives first.
  if (e.type === "pointerdown" || e.type === "mousedown") void prepareAndSend(root, sendButton);
}

function interceptShortcut(e: KeyboardEvent) {
  if (!e.isTrusted || e.key !== "Enter" || !(e.ctrlKey || e.metaKey)) return;
  const body = (e.target as Element | null)?.closest?.(BODY_SELECTOR);
  if (!body) return;
  let root: Element | null = null;
  let sendButton: HTMLElement | null = null;
  for (const btn of document.querySelectorAll<HTMLElement>(SEND_SELECTOR)) {
    const r = composeRootFor(btn);
    if (r?.contains(body)) {
      root = r;
      sendButton = btn;
      break;
    }
  }
  if (!root || !sendButton) return;
  const st = stateFor(root);
  if (!st.enabled || st.ready) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  void prepareAndSend(root, sendButton);
}

for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"] as const) {
  document.addEventListener(type, interceptPointer as EventListener, true);
}
document.addEventListener("keydown", interceptShortcut, true);

// ─── Reading: self-views and read badges ─────────────────────────────

const reported = new Map<string, number>();
const SELF_VIEW_REFRESH_MS = 20_000;

function tokenFromImg(img: HTMLImageElement): string | null {
  // Gmail serves images through its proxy with the original URL after "#".
  const src = img.getAttribute("src") ?? "";
  const m = src.match(PIXEL_RE);
  return m ? m[1] : null;
}

const ago = (iso: string) => {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
};

function badgeText(s: Status): string {
  if (!s.opens) return s.maybe ? "Ripple · loaded automatically, not confirmed read" : "Ripple · not opened yet";
  const parts = [`Opened ${s.opens}×`];
  if (s.lastOpenAt) parts.push(`last ${ago(s.lastOpenAt)}`);
  if (s.clicks) parts.push(`${s.clicks} click${s.clicks === 1 ? "" : "s"}`);
  return `Ripple · ${parts.join(" · ")}`;
}

async function scanMessages() {
  const found = new Map<string, HTMLElement>();
  for (const img of document.querySelectorAll<HTMLImageElement>("img")) {
    if (img.closest(BODY_SELECTOR)) continue; // our own pixel in a compose window
    const token = tokenFromImg(img);
    const body = token && messageBodyFor(img);
    if (token && body) found.set(token, body);
  }
  if (!found.size) return;

  const now = Date.now();
  const fresh = [...found.keys()].filter((t) => now - (reported.get(t) ?? 0) > SELF_VIEW_REFRESH_MS);
  if (!fresh.length) return;
  fresh.forEach((t) => reported.set(t, now));

  // Seeing the pixel here means the sender is reading their own copy.
  void send({ type: "selfView", tokens: fresh });
  const res = await send<{ messages: Status[] }>({ type: "status", tokens: fresh });
  if (!res.ok) return;
  for (const s of res.data.messages) {
    const body = found.get(s.token);
    if (!body?.isConnected) continue;
    let badge = body.previousElementSibling as HTMLElement | null;
    if (!badge?.classList.contains("ripple-badge")) {
      badge = document.createElement("div");
      badge.className = "ripple-badge";
      body.before(badge);
    }
    badge.classList.toggle("is-unread", !s.opens);
    badge.innerHTML = s.opens ? DOUBLE_TICK : TICK;
    badge.append(badgeText(s));
  }
}

// ─── Sent folder: read ticks ─────────────────────────────────────────

let recent: Status[] = [];
let recentAt = 0;

const norm = (s: string) => s.toLowerCase().replace(/^(re|fwd?):\s*/i, "").replace(/\s+/g, " ").trim();

async function tickSentRows() {
  if (!inSentFolder()) return;
  if (Date.now() - recentAt > 60_000) {
    recentAt = Date.now();
    const res = await send<{ messages: Status[] }>({ type: "status", tokens: [], recent: true });
    if (res.ok) recent = res.data.messages;
  }
  if (!recent.length) return;
  for (const row of listRows()) {
    const subject = norm(rowSubject(row));
    const people = rowRecipients(row);
    // Best match: same subject, a shared recipient, the newest send.
    const match = recent.find((m) => norm(m.subject) === subject && m.to.some((t) => people.includes(t)));
    const holder = row.querySelector(".bog");
    if (!match || !holder) continue;
    let tick = holder.parentElement?.querySelector<HTMLElement>(":scope > .ripple-tick");
    if (!tick) {
      tick = document.createElement("span");
      tick.className = "ripple-tick";
      holder.before(tick);
    }
    tick.classList.toggle("is-read", match.opens > 0);
    tick.innerHTML = match.opens > 0 ? DOUBLE_TICK : TICK;
    tick.title = badgeText(match);
  }
}

// ─── Wiring ──────────────────────────────────────────────────────────

let scheduled = false;
function onChange() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    document.querySelectorAll<HTMLElement>(SEND_SELECTOR).forEach((b) => isSendButton(b) && decorate(b));
    void scanMessages();
    void tickSentRows();
  }, 400);
}

new MutationObserver(onChange).observe(document.body, { childList: true, subtree: true });
window.addEventListener("hashchange", onChange);
onChange();
