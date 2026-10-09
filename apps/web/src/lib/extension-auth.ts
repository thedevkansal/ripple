import "server-only";
import { generateToken } from "@ripple/shared";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Issues a token for the extension. Only its hash is stored; the raw value is shown once. */
export async function createExtensionToken(userId: string, workspaceId: string, label: string) {
  const token = `rpl_${generateToken(40)}`;
  await db.extensionToken.create({ data: { userId, workspaceId, label, tokenHash: hash(token) } });
  return token;
}

export interface ExtensionAuth {
  tokenId: string;
  userId: string;
  workspaceId: string;
}

/** Resolves `Authorization: Bearer rpl_…` to the user and workspace it acts for. */
export async function authenticateExtension(request: Request): Promise<ExtensionAuth | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token?.startsWith("rpl_")) return null;
  const row = await db.extensionToken.findUnique({
    where: { tokenHash: hash(token) },
    select: { id: true, userId: true, workspaceId: true, lastUsedAt: true },
  });
  if (!row) return null;
  // Keep "last used" roughly current without a write on every request.
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 5 * 60_000) {
    await db.extensionToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  }
  return { tokenId: row.id, userId: row.userId, workspaceId: row.workspaceId };
}

export const unauthorized = () =>
  Response.json({ error: "Reconnect the Ripple extension: its token is missing or was revoked." }, { status: 401 });
