import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { auth } from "@/auth";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#honest", label: "Honest opens" },
  { href: "#extension", label: "Extension" },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-chrome backdrop-blur-xl">
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
          <ThemeToggle />
          <Suspense fallback={<SignedOutActions />}>
            <NavActions />
          </Suspense>
        </div>
      </nav>
    </header>
  );
}

function SignedOutActions() {
  return (
    <>
      <ButtonLink href="/login" variant="ghost" className="hidden sm:inline-flex">
        Sign in
      </ButtonLink>
      <ButtonLink href="/login">Start free</ButtonLink>
    </>
  );
}

/** Signed-in visitors (e.g. via the dashboard logo) get a way straight back. */
async function NavActions() {
  await connection();
  const session = await auth();
  if (!session?.user) return <SignedOutActions />;
  return <ButtonLink href="/dashboard">Open dashboard</ButtonLink>;
}
