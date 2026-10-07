import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/landing/button";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#honest", label: "Honest opens" },
  { href: "#extension", label: "Extension" },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-ink/70 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="Ripple home">
          <Logo />
        </Link>
        <ul className="hidden items-center gap-8 text-sm text-muted md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="transition-colors duration-150 hover:text-text">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <ButtonLink href="/login" variant="ghost" className="hidden sm:inline-flex">
            Sign in
          </ButtonLink>
          <ButtonLink href="/login">Start free</ButtonLink>
        </div>
      </nav>
    </header>
  );
}
