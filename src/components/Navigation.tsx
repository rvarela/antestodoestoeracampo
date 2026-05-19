"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/casos", label: "Casos" },
  { href: "/datos", label: "Datos" },
  { href: "/metodologia", label: "Metodología" },
  { href: "/sobre", label: "Sobre" },
];

export default function Navigation() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close menu on route change
  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
        style={{
          backgroundColor: scrolled ? "var(--background)" : "transparent",
          borderBottom: scrolled ? "1px solid var(--border)" : "1px solid transparent",
        }}
      >
        <nav className="flex items-center justify-between px-6 md:px-12 h-[52px] md:h-16">
          {/* Logo */}
          <Link
            href="/"
            className="type-data text-[11px] md:text-[13px] tracking-tight"
            style={{ color: "var(--foreground)" }}
          >
            antestodoestoeracampo.es
          </Link>

          {/* Desktop links */}
          <ul className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="type-small transition-colors duration-150"
                  style={{
                    color: pathname === link.href ? "var(--foreground)" : "var(--muted)",
                  }}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          {/* Mobile hamburger */}
          <button
            className="md:hidden flex flex-col gap-[5px] p-1"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
          >
            <span
              className="block w-5 h-px transition-all duration-200"
              style={{
                backgroundColor: "var(--foreground)",
                transform: menuOpen ? "rotate(45deg) translate(4px, 4px)" : "none",
              }}
            />
            <span
              className="block w-5 h-px transition-all duration-200"
              style={{
                backgroundColor: "var(--foreground)",
                opacity: menuOpen ? 0 : 1,
              }}
            />
            <span
              className="block w-5 h-px transition-all duration-200"
              style={{
                backgroundColor: "var(--foreground)",
                transform: menuOpen ? "rotate(-45deg) translate(4px, -4px)" : "none",
              }}
            />
          </button>
        </nav>
      </header>

      {/* Mobile menu overlay */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-40 flex flex-col justify-center px-6 md:hidden"
          style={{ backgroundColor: "var(--background)" }}
        >
          <ul className="flex flex-col gap-8">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="type-h2"
                  style={{ color: "var(--foreground)" }}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
