import { clickUrl, generateToken, pixelUrl } from "@ripple/shared";
import { z } from "zod";
import { db } from "@/lib/db";
import { authenticateExtension, unauthorized } from "@/lib/extension-auth";
import { appUrl } from "@/lib/google";
import { requestMeta } from "@/lib/tracking";

const bodySchema = z.object({
  to: z.array(z.email().transform((e) => e.toLowerCase())).max(100),
  cc: z.array(z.email().transform((e) => e.toLowerCase())).max(100).default([]),
  subject: z.string().max(500).default(""),
  /** http(s) links found in the compose body, in order. */
  links: z.array(z.url({ protocol: /^https?$/ }).max(2048)).max(200).default([]),
});

/**
 * Called by the extension the moment the user clicks Send in Gmail. Registers the email and
 * returns the pixel and tracked link URLs to put into the compose body before it goes out.
 */
export async function POST(request: Request) {
  const auth = await authenticateExtension(request);
  if (!auth) return unauthorized();

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid email details." }, { status: 400 });
  const { to, cc, subject, links } = parsed.data;
  if (!to.length && !cc.length) return Response.json({ error: "No recipients." }, { status: 400 });

  const primary = to[0] ?? cc[0];
  const others = [...new Set([...to.slice(1), ...cc])].filter((e) => e !== primary);
  // Recipients show up in Contacts like campaign recipients do.
  const contact = await db.contact.upsert({
    where: { workspaceId_email: { workspaceId: auth.workspaceId, email: primary } },
    create: { workspaceId: auth.workspaceId, email: primary },
    update: {},
    select: { id: true },
  });

  const unique = [...new Set(links)];
  const token = generateToken();
  await db.message.create({
    data: {
      token,
      workspaceId: auth.workspaceId,
      senderUserId: auth.userId,
      senderIp: requestMeta(request).ip,
      contactId: contact.id,
      toEmail: primary,
      cc: others,
      subject,
      source: "EXTENSION",
      status: "SENT",
      sentAt: new Date(),
      links: { create: unique.map((url, index) => ({ index, url })) },
    },
  });

  const base = appUrl();
  return Response.json({
    token,
    pixelUrl: pixelUrl(base, token),
    links: unique.map((url, index) => ({ url, trackedUrl: clickUrl(base, token, index) })),
  });
}
