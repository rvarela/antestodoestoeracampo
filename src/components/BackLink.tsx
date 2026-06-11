"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

interface BackLinkProps {
  fallback: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

/**
 * Goes back to the page the visitor came from (tracked by NavigationTracker);
 * direct visits (new tab, external link) navigate to `fallback` instead.
 */
export default function BackLink({ fallback, className, style, children }: BackLinkProps) {
  const router = useRouter();

  function onClick(e: React.MouseEvent) {
    // Let modified clicks (new tab, etc.) behave like a normal link
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    const prev = sessionStorage.getItem("nav:prev");
    if (prev && prev.startsWith("/")) {
      e.preventDefault();
      router.back();
    }
  }

  return (
    <Link href={fallback} onClick={onClick} className={className} style={style}>
      {children}
    </Link>
  );
}
