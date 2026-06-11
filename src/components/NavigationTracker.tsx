"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Keeps the previous internal URL in sessionStorage so back links can return
 * to wherever the visitor actually came from (homepage, /casos with filters…).
 * document.referrer can't do this — client-side navigations don't update it.
 */
export default function NavigationTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const url = searchParams.size > 0 ? `${pathname}?${searchParams}` : pathname;
    const current = sessionStorage.getItem("nav:current");
    if (current === url) return; // reload or params-only rewrite of same view
    if (current) sessionStorage.setItem("nav:prev", current);
    sessionStorage.setItem("nav:current", url);
  }, [pathname, searchParams]);

  return null;
}
