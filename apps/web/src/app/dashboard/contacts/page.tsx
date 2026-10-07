import { Contact } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ImportContacts } from "@/components/campaigns/import-contacts";
import { EmptyState } from "@/components/dashboard/empty-state";
import { inputClass } from "@/components/dashboard/forms";
import { PageBody, PageHeader } from "@/components/dashboard/page-header";
import type { Prisma } from "@/generated/prisma/client";
import { contactTagCounts } from "@/lib/campaign-data";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Contacts" };

const PAGE_SIZE = 50;

export default async function ContactsPage({ searchParams }: PageProps<"/dashboard/contacts">) {
  const { workspace } = await requireWorkspace();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const tag = typeof sp.tag === "string" ? sp.tag : "";
  const page = Math.max(1, Number(sp.page) || 1);

  const where: Prisma.ContactWhereInput = {
    workspaceId: workspace.id,
    ...(tag && { tags: { has: tag } }),
    ...(q && {
      OR: [
        { email: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { org: { contains: q, mode: "insensitive" } },
      ],
    }),
  };

  const [contacts, total, tags] = await Promise.all([
    db.contact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      select: {
        id: true,
        email: true,
        name: true,
        org: true,
        tags: true,
        _count: { select: { messages: { where: { status: "SENT" } } } },
      },
    }),
    db.contact.count({ where }),
    contactTagCounts(workspace.id),
  ]);

  const href = (params: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    const merged = { q, tag, ...params };
    for (const [k, v] of Object.entries(merged)) if (v) u.set(k, String(v));
    const s = u.toString();
    return `/dashboard/contacts${s ? `?${s}` : ""}`;
  };

  return (
    <PageBody>
      <PageHeader
        title="Contacts"
        description="Everyone your workspace has imported or emailed."
        actions={<ImportContacts />}
      />

      {total === 0 && !q && !tag ? (
        <EmptyState
          icon={Contact}
          title="No contacts yet"
          body="Import a CSV with an email column. Name, company and tags are picked up automatically, and any other column becomes a merge field."
        />
      ) : (
        <>
          <form className="mt-8 flex flex-wrap items-center gap-2" action="/dashboard/contacts">
            <label htmlFor="contact-search" className="sr-only">
              Search contacts
            </label>
            <input
              id="contact-search"
              name="q"
              defaultValue={q}
              placeholder="Search name, email or company"
              className={cn(inputClass, "w-full max-w-xs")}
            />
            {tag && <input type="hidden" name="tag" value={tag} />}
            <div className="flex flex-wrap gap-1.5">
              <Link
                href={href({ tag: undefined, page: undefined })}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm",
                  !tag ? "border-glow/40 bg-glow/10 text-glow" : "border-line-strong text-muted hover:text-text",
                )}
              >
                All
              </Link>
              {tags.map((t) => (
                <Link
                  key={t.tag}
                  href={href({ tag: t.tag, page: undefined })}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm",
                    tag === t.tag ? "border-glow/40 bg-glow/10 text-glow" : "border-line-strong text-muted hover:text-text",
                  )}
                >
                  {t.tag} <span className="tabular opacity-70">{t.count}</span>
                </Link>
              ))}
            </div>
          </form>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-line-strong">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-faint">
                  <th className="px-5 py-3 font-normal">Name</th>
                  <th className="px-3 py-3 font-normal">Company</th>
                  <th className="px-3 py-3 font-normal">Tags</th>
                  <th className="px-5 py-3 text-right font-normal">Emails sent</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <td className="max-w-[280px] px-5 py-3">
                      <p className="truncate font-medium">{c.name ?? c.email}</p>
                      {c.name && <p className="truncate text-faint">{c.email}</p>}
                    </td>
                    <td className="px-3 py-3 text-muted">{c.org ?? "–"}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {c.tags.map((t) => (
                          <span key={t} className="rounded-md bg-white/5 px-2 py-0.5 text-xs text-muted">
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="tabular px-5 py-3 text-right">{c._count.messages}</td>
                  </tr>
                ))}
                {contacts.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-muted">
                      No contacts match. Try another search or tag.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {total > PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-between text-sm text-muted">
              <span className="tabular">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link href={href({ page: page - 1 })} className="hover:text-text">
                    Previous
                  </Link>
                )}
                {page * PAGE_SIZE < total && (
                  <Link href={href({ page: page + 1 })} className="hover:text-text">
                    Next
                  </Link>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </PageBody>
  );
}
