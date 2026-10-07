import { after } from "next/server";
import { NO_STORE_HEADERS, PIXEL_GIF, recordOpen, requestMeta } from "@/lib/tracking";

export async function GET(request: Request, ctx: RouteContext<"/t/o/[file]">) {
  const { file } = await ctx.params;
  const token = file.replace(/\.gif$/i, "");
  const meta = requestMeta(request);

  // Respond instantly; logging never delays or breaks the image.
  after(() => recordOpen(token, meta).catch((err) => console.error("recordOpen failed", err)));

  return new Response(PIXEL_GIF, {
    headers: { "Content-Type": "image/gif", ...NO_STORE_HEADERS },
  });
}
