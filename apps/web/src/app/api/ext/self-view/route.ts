import { z } from "zod";
import { db } from "@/lib/db";
import { authenticateExtension, unauthorized } from "@/lib/extension-auth";
import { recordSelfView } from "@/lib/tracking";

const bodySchema = z.object({ tokens: z.array(z.string().max(64)).min(1).max(50) });

/** The sender is looking at their own copy of these emails right now; their image loads aren't opens. */
export async function POST(request: Request) {
  const auth = await authenticateExtension(request);
  if (!auth) return unauthorized();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });

  const messages = await db.message.findMany({
    where: { token: { in: parsed.data.tokens }, workspaceId: auth.workspaceId },
    select: { id: true },
  });
  await recordSelfView(messages.map((m) => m.id));
  return Response.json({ ok: true, marked: messages.length });
}
