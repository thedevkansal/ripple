import { db } from "@/lib/db";
import { authenticateExtension, unauthorized } from "@/lib/extension-auth";

/** Who the extension is connected as, for its popup. */
export async function GET(request: Request) {
  const auth = await authenticateExtension(request);
  if (!auth) return unauthorized();
  const [user, workspace] = await Promise.all([
    db.user.findUnique({ where: { id: auth.userId }, select: { name: true, email: true } }),
    db.workspace.findUnique({ where: { id: auth.workspaceId }, select: { name: true } }),
  ]);
  return Response.json({ user, workspace });
}
