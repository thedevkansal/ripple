import { generateToken } from "@ripple/shared";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { GMAIL_STATE_COOKIE, gmailConsentUrl } from "@/lib/google";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return Response.redirect(new URL("/login", request.url), 302);

  const state = generateToken();
  (await cookies()).set(GMAIL_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/gmail",
    maxAge: 600,
  });

  // ?account= preselects the mailbox when reconnecting one that isn't the sign-in address.
  const hint = new URL(request.url).searchParams.get("account") ?? session.user.email ?? undefined;
  return Response.redirect(gmailConsentUrl(state, hint), 302);
}
