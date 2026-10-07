import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { ALLOWED_TYPES, attachmentPrefix, MAX_TOTAL_BYTES } from "@/lib/attachments";

/** Issues short-lived tokens so the browser uploads files straight to Vercel Blob. */
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const session = await auth();
        if (!session?.user?.id) throw new Error("Sign in to upload files.");
        // Path is attachments/<workspaceId>/<file>; the user must belong to that workspace.
        const workspaceId = pathname.split("/")[1] ?? "";
        const member = await db.member.findUnique({
          where: { userId_workspaceId: { userId: session.user.id, workspaceId } },
        });
        if (!member || !pathname.startsWith(attachmentPrefix(workspaceId))) {
          throw new Error("You can't upload to this workspace.");
        }
        return {
          allowedContentTypes: ALLOWED_TYPES,
          maximumSizeInBytes: MAX_TOTAL_BYTES,
          addRandomSuffix: true,
        };
      },
    });
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
