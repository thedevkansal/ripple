import "server-only";
import { decrypt } from "@/lib/crypto";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export const GMAIL_STATE_COOKIE = "rpl_gstate";
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const SCOPES = ["openid", "email", GMAIL_SEND_SCOPE];

function clientCredentials() {
  const id = process.env.AUTH_GOOGLE_ID;
  const secret = process.env.AUTH_GOOGLE_SECRET;
  if (!id || !secret) throw new Error("AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET are not set");
  return { id, secret };
}

export function appUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function gmailRedirectUri() {
  return `${appUrl()}/api/gmail/callback`;
}

export function gmailConsentUrl(state: string, loginHint?: string) {
  const params = new URLSearchParams({
    client_id: clientCredentials().id,
    redirect_uri: gmailRedirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    // Always ask, so Google always returns a refresh token.
    prompt: "consent select_account",
    include_granted_scopes: "true",
    state,
  });
  if (loginHint) params.set("login_hint", loginHint);
  return `${AUTH_URL}?${params}`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  id_token?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const { id, secret } = clientCredentials();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, ...body }),
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new GoogleAuthError(err.error ?? `http_${res.status}`, err.error_description);
  }
  return res.json();
}

export class GoogleAuthError extends Error {
  constructor(
    readonly code: string,
    description?: string,
  ) {
    super(description ?? code);
  }
  /** The user revoked access or the grant expired: they must reconnect. */
  get needsReconnect() {
    return this.code === "invalid_grant";
  }
}

export async function exchangeCode(code: string) {
  const tokens = await tokenRequest({
    code,
    grant_type: "authorization_code",
    redirect_uri: gmailRedirectUri(),
  });
  // The ID token came straight from Google's token endpoint over TLS, so its claims can be read directly.
  const claims = tokens.id_token
    ? (JSON.parse(Buffer.from(tokens.id_token.split(".")[1], "base64url").toString()) as {
        email?: string;
        email_verified?: boolean;
      })
    : {};
  return {
    refreshToken: tokens.refresh_token,
    email: claims.email_verified ? claims.email?.toLowerCase() : undefined,
    grantedScopes: tokens.scope.split(" "),
  };
}

export async function accessTokenFor(encryptedRefreshToken: string) {
  const tokens = await tokenRequest({
    refresh_token: decrypt(encryptedRefreshToken),
    grant_type: "refresh_token",
  });
  return tokens.access_token;
}

export async function revokeRefreshToken(encryptedRefreshToken: string) {
  await fetch(REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: decrypt(encryptedRefreshToken) }),
  }).catch(() => undefined);
}
