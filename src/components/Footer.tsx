import Link from "next/link";

const FOOTER_LINKS = [
  { href: "/metodologia", label: "Metodología" },
  { href: "/sobre", label: "Sobre el proyecto" },
  { href: "/fuentes", label: "Fuentes" },
];

export default function Footer() {
  return (
    <footer
      className="px-6 md:px-12 py-10 md:py-12 flex flex-col md:flex-row md:items-center justify-between gap-6"
      style={{
        backgroundColor: "var(--foreground)",
        borderTop: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Logo */}
      <Link
        href="/"
        className="type-data text-[11px]"
        style={{ color: "rgba(140,136,128,0.7)" }}
      >
        antestodoestoeracampo.es
      </Link>

      {/* Source note */}
      <p
        className="type-small text-[11px] max-w-sm"
        style={{ color: "rgba(140,136,128,0.5)" }}
      >
        Datos de fuentes públicas: MITECO / EGIF, Catastro, BOE, sentencias judiciales.
        Sin fines comerciales.
      </p>

      {/* Links */}
      <nav>
        <ul className="flex flex-wrap gap-5">
          {FOOTER_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="type-small text-[12px] transition-colors duration-150"
                style={{ color: "rgba(140,136,128,0.5)" }}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  );
}
