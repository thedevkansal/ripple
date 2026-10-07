import { ButtonLink } from "@/components/landing/button";
import { RippleRadar } from "@/components/landing/ripple-radar";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Horizon glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(139_124_255/0.16),transparent)] blur-3xl"
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pt-16 pb-24 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:gap-10 lg:pt-24">
        <div className="max-w-xl">
          <h1 className="text-[clamp(2.75rem,7vw,4.75rem)] leading-[0.98] font-semibold tracking-[-0.045em] [font-stretch:92%]">
            Know the moment they read it.
          </h1>
          <p className="mt-6 max-w-[46ch] text-lg leading-relaxed text-muted">
            Ripple tracks opens and clicks on the email you send from Gmail. See who opened, how often,
            and the right moment to follow up.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <ButtonLink href="/login" size="lg">
              Start tracking free
            </ButtonLink>
            <ButtonLink href="#extension" size="lg" variant="secondary">
              Get the Chrome extension
            </ButtonLink>
          </div>
          <p className="mt-5 text-sm text-faint">Sends from your own Gmail. Replies land in your inbox.</p>
        </div>
        <RippleRadar />
      </div>
    </section>
  );
}
