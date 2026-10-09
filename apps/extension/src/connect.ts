import { send } from "./messages";

/**
 * Runs only on Ripple's Connect page. Tells the page the extension is installed, and stores the
 * token the page hands over after the user clicks Connect.
 */
window.addEventListener("message", async (e: MessageEvent) => {
  if (e.source !== window || e.origin !== location.origin) return;
  const reply = (type: string) => window.postMessage({ type }, location.origin);

  if (e.data?.type === "ripple:ping") reply("ripple:ready");
  if (e.data?.type === "ripple:token" && typeof e.data.token === "string") {
    const res = await send({ type: "connect", token: e.data.token });
    reply(res.ok ? "ripple:connected" : "ripple:error");
  }
});

// In case the page asked before this script loaded.
window.postMessage({ type: "ripple:ready" }, location.origin);
