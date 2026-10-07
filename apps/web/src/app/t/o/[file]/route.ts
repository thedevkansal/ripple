import { shouldWithholdPixel } from "@ripple/shared";
import { after } from "next/server";
import { classifyOpen, NO_STORE_HEADERS, PIXEL_GIF, requestMeta, saveOpen } from "@/lib/tracking";

export async function GET(request: Request, ctx: RouteContext<"/t/o/[file]">) {
  const { file } = await ctx.params;
  const token = file.replace(/\.gif$/i, "");
  const meta = requestMeta(request);

  const open = await classifyOpen(token, meta).catch((err) => {
    console.error("classifyOpen failed", err);
    return null;
  });
  if (open) after(() => saveOpen(open, meta).catch((err) => console.error("saveOpen failed", err)));

  // Gmail caches what its proxy receives at delivery and reuses it for every open. Give that
  // fetch nothing to cache, so the real open makes Gmail come back.
  if (open && shouldWithholdPixel(open.classification)) {
    return new Response(null, { status: 503, headers: { ...NO_STORE_HEADERS, "Retry-After": "60" } });
  }

  return new Response(PIXEL_GIF, {
    headers: { "Content-Type": "image/gif", ...NO_STORE_HEADERS },
  });
}
