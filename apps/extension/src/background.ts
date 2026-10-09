import { RIPPLE_URL, type Request, type Response } from "./messages";

const TOKEN_KEY = "rippleToken";
/** Sending must never wait long on Ripple: past this, Gmail sends untracked. */
const REGISTER_TIMEOUT_MS = 4000;

async function token(): Promise<string | null> {
  const { [TOKEN_KEY]: t } = await chrome.storage.local.get(TOKEN_KEY);
  return typeof t === "string" ? t : null;
}

async function api<T>(path: string, init: RequestInit = {}, timeoutMs = 10_000): Promise<Response<T>> {
  const t = await token();
  if (!t) return { ok: false, error: "Not connected to Ripple.", unauthorized: true };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${RIPPLE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}`, ...init.headers },
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) return { ok: false, error: body.error ?? "Reconnect Ripple.", unauthorized: true };
    if (!res.ok) return { ok: false, error: body.error ?? `Ripple returned ${res.status}` };
    return { ok: true, data: body as T };
  } catch (err) {
    const aborted = (err as Error).name === "AbortError";
    return { ok: false, error: aborted ? "Ripple took too long to answer." : "Couldn’t reach Ripple." };
  } finally {
    clearTimeout(timer);
  }
}

async function handle(req: Request): Promise<Response<unknown>> {
  switch (req.type) {
    case "connect":
      if (!/^rpl_[0-9A-Za-z]{20,}$/.test(req.token)) return { ok: false, error: "That doesn’t look like a Ripple token." };
      await chrome.storage.local.set({ [TOKEN_KEY]: req.token });
      return api("/api/ext/me");
    case "disconnect":
      await chrome.storage.local.remove(TOKEN_KEY);
      return { ok: true, data: null };
    case "me":
      return api("/api/ext/me");
    case "register":
      return api(
        "/api/ext/messages",
        { method: "POST", body: JSON.stringify({ to: req.to, cc: req.cc, subject: req.subject, links: req.links }) },
        REGISTER_TIMEOUT_MS,
      );
    case "selfView":
      return api("/api/ext/self-view", { method: "POST", body: JSON.stringify({ tokens: req.tokens }) });
    case "status":
      return api("/api/ext/status", {
        method: "POST",
        body: JSON.stringify({ tokens: req.tokens, recent: req.recent ?? false }),
      });
  }
}

chrome.runtime.onMessage.addListener((req: Request, _sender, reply) => {
  handle(req).then(reply);
  return true; // reply asynchronously
});

// First install: open the Connect page so setup is one click.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") chrome.tabs.create({ url: `${RIPPLE_URL}/dashboard/extension` });
});
