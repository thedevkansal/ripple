import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";

export function ClosingCta() {
  return (
    <section className="relative overflow-hidden border-t border-line">
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-60%] left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--glow)_14%,transparent),transparent)] blur-3xl"
      />
      <div className="relative mx-auto flex max-w-6xl flex-col items-center px-4 py-28 text-center sm:px-6">
        <h2 className="max-w-2xl text-4xl leading-[1.05] font-semibold tracking-[-0.035em] sm:text-6xl">
          Send your next invite with Ripple.
        </h2>
        <p className="mt-6 max-w-md text-lg text-muted">Free while in beta. Set up in two minutes.</p>
        <ButtonLink href="/login" size="lg" className="mt-9">
          Start tracking free
        </ButtonLink>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-sm text-faint sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Logo className="opacity-80" />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <a
            href="https://github.com/thedevkansal/ripple"
            className="transition-colors duration-150 hover:text-text"
          >
            GitHub
          </a>
          <span>Built by Dev Kansal</span>
          <span>© 2026 Ripple</span>
        </div>
      </div>
    </footer>
  );
}
