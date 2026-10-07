"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-fetches the page's server data on an interval while the tab is visible, and on return. */
export function LiveRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = setInterval(refresh, seconds * 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, seconds]);

  return null;
}
