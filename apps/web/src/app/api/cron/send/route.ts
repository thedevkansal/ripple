import { timingSafeEqual } from "node:crypto";
import { processQueue } from "@/lib/queue";

export const maxDuration = 60;

type AuthResult = "ok" | "missing" | "wrong";

/** Bearer token, tolerating the quotes people copy from .env files. */
function checkAuth(request: Request): AuthResult {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!header) return "missing";
  const token = header.replace(/^Bearer\s+/i, "").trim().replace(/^["']|["']$/g, "");
  if (!secret || !token) return "wrong";
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b) ? "ok" : "wrong";
}

const AUTH_HINTS = {
  missing: "No Authorization header arrived. Add a header named exactly Authorization.",
  wrong: "Authorization header arrived but the secret doesn't match CRON_SECRET. Value should be: Bearer <CRON_SECRET>.",
};

/**
 * Drains the send queue. Called every minute by an external cron (cron-job.org, GitHub Actions)
 * with `Authorization: Bearer $CRON_SECRET`. GET and POST both work, since cron services default to GET.
 */
async function handle(request: Request) {
  const auth = checkAuth(request);
  if (auth !== "ok") return Response.json({ error: "unauthorized", hint: AUTH_HINTS[auth] }, { status: 401 });
  const run = await processQueue({ budgetMs: 50_000 });
  return Response.json(run, { headers: { "Cache-Control": "no-store" } });
}

export { handle as GET, handle as POST };
