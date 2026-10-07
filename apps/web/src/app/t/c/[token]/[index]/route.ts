import { after } from "next/server";
import { findLink, NO_STORE_HEADERS, recordClick, requestMeta } from "@/lib/tracking";

export async function GET(request: Request, ctx: RouteContext<"/t/c/[token]/[index]">) {
  const { token, index } = await ctx.params;
  const meta = requestMeta(request);

  // Only redirect to URLs stored at send time: never an open redirect.
  const link = await findLink(token, Number(index)).catch(() => null);
  if (!link) return Response.redirect(new URL("/", request.url), 302);

  after(() => recordClick(link, meta).catch((err) => console.error("recordClick failed", err)));

  return new Response(null, {
    status: 302,
    headers: { Location: link.url, ...NO_STORE_HEADERS },
  });
}
