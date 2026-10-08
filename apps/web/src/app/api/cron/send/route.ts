import { timingSafeEqual } from "node:crypto";
import { processQueue } from "@/lib/queue";

export const maxDuration = 60;

/** Bearer token, tolerating the quotes people copy from .env files. */
function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim().replace(/^["']|["']$/g, "");
  if (!secret || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Drains the send queue. Called every minute by an external cron (cron-job.org, GitHub Actions)
 * with `Authorization: Bearer $CRON_SECRET`. GET and POST both work, since cron services default to GET.
 */
async function handle(request: Request) {
  if (!authorized(request)) {
    return Response.json(
      { error: "unauthorized", hint: "Send the header Authorization: Bearer <CRON_SECRET>, without quotes." },
      { status: 401 },
    );
  }
  const run = await processQueue({ budgetMs: 50_000 });
  return Response.json(run, { headers: { "Cache-Control": "no-store" } });
}

export { handle as GET, handle as POST };
