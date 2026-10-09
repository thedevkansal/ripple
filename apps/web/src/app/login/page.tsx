import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { auth, signIn } from "@/auth";
import { GoogleIcon } from "@/components/brand/google-icon";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  AccessDenied: "Google sign-in was cancelled. Try again when you're ready.",
  Configuration: "Sign-in isn't configured on this server yet. Check the Google OAuth settings.",
};

function safeNext(next: unknown, fallback = "/dashboard") {
  return typeof next === "string" && /^\/(dashboard|invite)(\/|$|\?)/.test(next) ? next : fallback;
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 size-[900px] -translate-x-1/2 -translate-y-1/2"
      >
        {[0.3, 0.55, 0.8, 1].map((r) => (
          <div
            key={r}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-line"
            style={{ width: `${r * 100}%`, height: `${r * 100}%` }}
          />
        ))}
        <div className="absolute inset-[30%] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--glow)_12%,transparent),transparent)] blur-2xl" />
      </div>

      <div className="relative w-full max-w-sm rounded-3xl border border-line-strong bg-ink-raised/80 p-8 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.9)] backdrop-blur-xl">
        <Link href="/" aria-label="Ripple home">
          <Logo />
        </Link>
        <h1 className="mt-8 text-2xl font-semibold tracking-[-0.03em]">Sign in to Ripple</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Use your Google account. You’ll connect Gmail for sending as a separate step, and you can
          disconnect it at any time.
        </p>
        <Suspense fallback={<GoogleButton disabled />}>
          <LoginForm searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function LoginForm({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  await connection();
  const { next, error } = await searchParams;
  const session = await auth();
  const target = safeNext(next);
  if (session?.user) redirect(target);

  const message = typeof error === "string" ? (ERRORS[error] ?? "Sign-in failed. Try again.") : null;

  return (
    <form
      action={async () => {
        "use server";
        await signIn("google", { redirectTo: target });
      }}
    >
      {message && (
        <p role="alert" className="mt-6 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">
          {message}
        </p>
      )}
      <GoogleButton />
    </form>
  );
}

function GoogleButton({ disabled }: { disabled?: boolean }) {
  return (
    <Button
      type="submit"
      variant="secondary"
      size="lg"
      disabled={disabled}
      className="mt-8 w-full rounded-2xl border-[#dadce0] bg-[#fff] text-[#1f1f1f] hover:bg-[#f1f3f4]"
    >
      <GoogleIcon className="size-5" />
      Continue with Google
    </Button>
  );
}
