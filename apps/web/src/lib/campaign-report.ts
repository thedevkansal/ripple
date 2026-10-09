import "server-only";
import { contactVars, summarize, type MergeVars } from "@ripple/shared";
import type { RecipientRowData } from "@/components/campaigns/recipients-table";
import { db } from "@/lib/db";

export interface ReportRow extends RecipientRowData {
  cc: string[];
  firstOpenAt: string | null;
}

/**
 * Per-recipient results for one campaign, shared by the campaign page, its CSV export and its
 * printable report so all three always agree.
 */
export async function campaignReport(campaignId: string) {
  const [messages, files] = await Promise.all([
    db.message.findMany({
      where: { campaignId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        toEmail: true,
        status: true,
        sentAt: true,
        error: true,
        cc: true,
        contact: { select: { name: true, email: true, org: true, fields: true } },
        events: {
          select: { type: true, at: true, isPrefetch: true, isBot: true, link: { select: { url: true } } },
        },
      },
    }),
    db.attachment.findMany({
      where: { campaignId },
      orderBy: { createdAt: "asc" },
      select: { name: true, size: true, url: true },
    }),
  ]);

  const fileUrls = new Set(files.map((f) => f.url));
  const rows: ReportRow[] = messages.map((m) => {
    const s = summarize(
      m.events.map((e) => ({ ...e, type: e.type === "OPEN" ? ("open" as const) : ("click" as const) })),
      m.sentAt,
    );
    return {
      id: m.id,
      name: m.contact?.name ?? null,
      email: m.toEmail,
      org: m.contact?.org ?? null,
      status: m.status,
      error: m.error,
      sentAt: m.sentAt?.toISOString() ?? null,
      opens: s.opens,
      onlyPrefetched: s.onlyPrefetched,
      clicks: s.clicks,
      fileOpens: m.events.filter(
        (e) => e.type === "CLICK" && !e.isBot && !e.isPrefetch && e.link && fileUrls.has(e.link.url),
      ).length,
      firstOpenAt: s.firstOpenAt?.toISOString() ?? null,
      lastOpenAt: s.lastOpenAt?.toISOString() ?? null,
      cc: m.cc,
    };
  });

  // Merge fields of the first recipient who was sent the email, to show it as they got it.
  const sample = messages.find((m) => m.status === "SENT") ?? messages[0];
  const sampleVars: MergeVars = sample?.contact
    ? contactVars({
        email: sample.contact.email,
        name: sample.contact.name,
        org: sample.contact.org,
        fields: sample.contact.fields as Record<string, unknown> | null,
      })
    : { email: sample?.toEmail };

  return {
    rows,
    files,
    sampleVars,
    sampleName: sample?.contact?.name ?? sample?.toEmail ?? null,
  };
}
