import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { auth, signIn } from "@/auth";
import { Logo } from "@/components/brand/logo";
import { SubmitButton } from "@/components/dashboard/forms";
import { acceptInvite } from "@/app/dashboard/actions";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Join workspace" };

export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-3xl border border-line-strong bg-ink-raised/80 p-8">
        <Link href="/" aria-label="Ripple home">
          <Logo />
        </Link>
        <Suspense fallback={<div className="mt-8 h-32 animate-pulse rounded-xl bg-white/5" />}>
          <InviteBody params={params} />
        </Suspense>
      </div>
    </main>
  );
}

async function InviteBody({ params }: { params: PageProps<"/invite/[token]">["params"] }) {
  await connection();
  const { token } = await params;
  const [session, invite] = await Promise.all([
    auth(),
    db.invite.findUnique({
      where: { token },
      select: {
        revokedAt: true,
        expiresAt: true,
        role: true,
        workspace: { select: { name: true, _count: { select: { members: true } } } },
      },
    }),
  ]);

  if (!invite || invite.revokedAt || invite.expiresAt < new Date()) {
    return (
      <>
        <h1 className="mt-8 text-2xl font-semibold tracking-[-0.03em]">This invite no longer works</h1>
        <p className="mt-2 text-sm text-muted">
          It was revoked or has expired. Ask the person who sent it for a new link.
        </p>
      </>
    );
  }

  const members = invite.workspace._count.members;
  return (
    <>
      <h1 className="mt-8 text-2xl font-semibold tracking-[-0.03em]">Join {invite.workspace.name}</h1>
      <p className="mt-2 text-sm text-muted">
        {members} {members === 1 ? "person is" : "people are"} already tracking outreach here. You’ll
        join as {invite.role === "ADMIN" ? "an admin" : "a member"}.
      </p>
      {session?.user ? (
        <form action={acceptInvite.bind(null, token)} className="mt-8">
          <SubmitButton size="lg">Join as {session.user.email}</SubmitButton>
        </form>
      ) : (
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: `/invite/${token}` });
          }}
          className="mt-8"
        >
          <SubmitButton size="lg">Sign in with Google to join</SubmitButton>
        </form>
      )}
    </>
  );
}
