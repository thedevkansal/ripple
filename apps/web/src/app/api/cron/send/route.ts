import { processQueue } from "@/lib/queue";

export const maxDuration = 60;

/** Called on a schedule (GitHub Actions / any cron) with `Authorization: Bearer $CRON_SECRET`. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const run = await processQueue({ budgetMs: 50_000 });
  return Response.json(run);
}
