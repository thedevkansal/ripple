import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { encrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { exchangeCode, GMAIL_SEND_SCOPE, GMAIL_STATE_COOKIE } from "@/lib/google";

function back(request: NextRequest, result: string) {
  return Response.redirect(new URL(`/dashboard/settings?gmail=${result}`, request.url), 302);
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.redirect(new URL("/login", request.url), 302);

  const params = request.nextUrl.searchParams;
  const jar = await cookies();
  const expected = jar.get(GMAIL_STATE_COOKIE)?.value;
  jar.delete({ name: GMAIL_STATE_COOKIE, path: "/api/gmail" });

  if (params.get("error")) return back(request, "denied");
  const code = params.get("code");
  if (!code || !expected || params.get("state") !== expected) return back(request, "expired");

  try {
    const { refreshToken, email, grantedScopes } = await exchangeCode(code);
    if (!grantedScopes.includes(GMAIL_SEND_SCOPE)) return back(request, "missing-scope");
    if (!refreshToken || !email) return back(request, "failed");

    const encryptedRefreshToken = encrypt(refreshToken);
    await db.gmailAccount.upsert({
      where: { userId_email: { userId: session.user.id, email } },
      create: { userId: session.user.id, email, encryptedRefreshToken },
      update: { encryptedRefreshToken },
    });
    return back(request, "connected");
  } catch (err) {
    console.error("Gmail connect failed", err);
    return back(request, "failed");
  }
}
