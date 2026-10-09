import { Contact } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ImportContacts } from "@/components/campaigns/import-contacts";
import { EmptyState } from "@/components/dashboard/empty-state";
import { inputClass } from "@/components/dashboard/forms";
import { PageBody, PageHeader } from "@/components/dashboard/page-header";
import { LocalTime } from "@/components/ui/local-time";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Contacts" };

const PAGE_SIZE = 50;

export default async function ContactsPage({ searchParams }: PageProps<"/dashboard/contacts">) {
  const { workspace } = await requireWorkspace();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const page = Math.max(1, Number(sp.page) || 1);

  const where: Prisma.ContactWhereInput = {
    workspaceId: workspace.id,
    ...(q && {
      OR: [
        { email: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { org: { contains: q, mode: "insensitive" } },
      ],
    }),
  };

  const [contacts, total] = await Promise.all([
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
        ccEmails: true,
        createdAt: true,
        _count: { select: { messages: { where: { status: "SENT" } } } },
      },
    }),
    db.contact.count({ where }),
  ]);

  const href = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (p > 1) u.set("page", String(p));
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

      {total === 0 && !q ? (
        <EmptyState
          icon={Contact}
          title="No contacts yet"
          body="Import a CSV with an email column. Name and company are picked up automatically, extra email columns become CC, and any other column becomes a merge field."
        />
      ) : (
        <>
          <form className="mt-8" action="/dashboard/contacts">
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
          </form>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-line-strong">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-faint">
                  <th className="px-5 py-3 font-normal">Name</th>
                  <th className="px-3 py-3 font-normal">Company</th>
                  <th className="px-3 py-3 text-right font-normal">Emails sent</th>
                  <th className="px-5 py-3 text-right font-normal">Added</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <td className="max-w-[320px] px-5 py-3">
                      <p className="truncate font-medium">{c.name ?? c.email}</p>
                      <p className="truncate text-faint">
                        {c.name && c.email}
                        {c.ccEmails.length > 0 && (
                          <span className="ml-2 text-dusk" title={`CC: ${c.ccEmails.join(", ")}`}>
                            +{c.ccEmails.length} cc
                          </span>
                        )}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-muted">{c.org ?? "–"}</td>
                    <td className="tabular px-3 py-3 text-right">{c._count.messages}</td>
                    <td className="tabular px-5 py-3 text-right text-muted">
                      <LocalTime date={c.createdAt} format="date" />
                    </td>
                  </tr>
                ))}
                {contacts.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-muted">
                      No contacts match “{q}”.
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
              <div className="flex gap-4">
                {page > 1 && (
                  <Link href={href(page - 1)} className="hover:text-text">
                    Previous
                  </Link>
                )}
                {page * PAGE_SIZE < total && (
                  <Link href={href(page + 1)} className="hover:text-text">
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
