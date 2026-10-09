"use client";

import { useRouter } from "next/navigation";
import { Fragment, type ReactNode } from "react";

/**
 * Next keeps recently visited pages alive in the background, form state included. Forms that
 * should start fresh on each visit (like "New campaign") remount whenever they're navigated to,
 * while browser back/forward still restores them.
 */
export function ResetOnNavigate({ children }: { children: ReactNode }) {
  const { bfcacheId } = useRouter();
  return <Fragment key={bfcacheId}>{children}</Fragment>;
}
