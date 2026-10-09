"use client";

import { CheckCircle2, Plug } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { connectExtension } from "@/app/dashboard/extension/actions";
import { Button } from "@/components/ui/button";

type State = "checking" | "missing" | "ready" | "connected" | "error";

function browserName() {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "Edge";
  if ((navigator as { brave?: unknown }).brave) return "Brave";
  if (/Chrome\//.test(ua)) return "Chrome";
  return "Browser";
}

/**
 * Talks to the extension's content script through window.postMessage: it answers "ready" when
 * installed, and stores the token this page hands it.
 */
export function ConnectExtension() {
  const [state, setState] = useState<State>("checking");
  const [pending, start] = useTransition();

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== location.origin) return;
      if (e.data?.type === "ripple:ready") setState((s) => (s === "checking" || s === "missing" ? "ready" : s));
      if (e.data?.type === "ripple:connected") setState("connected");
      if (e.data?.type === "ripple:error") setState("error");
    };
    window.addEventListener("message", onMessage);
    window.postMessage({ type: "ripple:ping" }, location.origin);
    const timer = setTimeout(() => setState((s) => (s === "checking" ? "missing" : s)), 1500);
    return () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
    };
  }, []);

  const connect = () =>
    start(async () => {
      const { token } = await connectExtension(browserName());
      window.postMessage({ type: "ripple:token", token }, location.origin);
    });

  if (state === "connected") {
    return (
      <p role="status" className="flex items-center gap-2 text-glow">
        <CheckCircle2 className="size-5" />
        Connected. Open Gmail and you’ll see the Ripple switch next to Send.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="lg" onClick={connect} disabled={pending || state !== "ready"}>
        <Plug className="size-4" />
        {pending ? "Connecting…" : "Connect extension"}
      </Button>
      <p className="text-sm text-muted">
        {state === "checking" && "Looking for the extension…"}
        {state === "missing" && "Extension not found in this browser. Install it first (steps below), then reload this page."}
        {state === "ready" && "Extension found."}
        {state === "error" && "The extension couldn’t save the connection. Reload the page and try again."}
      </p>
    </div>
  );
}
