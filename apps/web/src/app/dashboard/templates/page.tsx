import { FileText, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageBody, PageHeader } from "@/components/dashboard/page-header";
import { ButtonLink } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/local-time";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Templates" };

export default async function TemplatesPage() {
  const { workspace } = await requireWorkspace();
  const templates = await db.template.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, subject: true, body: true, updatedAt: true },
  });

  const newButton = (
    <ButtonLink href="/dashboard/templates/new">
      <Plus className="size-4" />
      New template
    </ButtonLink>
  );

  return (
    <PageBody>
      <PageHeader
        title="Templates"
        description="Reusable emails for invites, follow-ups and thank-yous. Load one into any campaign."
        actions={templates.length > 0 && newButton}
      />
      {templates.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No templates yet"
          body="Write your invite or follow-up once and reuse it. You can also click “Save as template” while writing a campaign."
          action={newButton}
        />
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {templates.map((t) => (
            <li key={t.id}>
              <Link
                href={`/dashboard/templates/${t.id}`}
                className="flex h-full flex-col rounded-2xl border border-line-strong bg-ink-raised/40 p-5 transition-colors duration-150 hover:border-glow/40"
              >
                <p className="font-medium">{t.name}</p>
                <p className="mt-1 truncate text-sm text-muted">{t.subject || "(no subject)"}</p>
                <p className="mt-3 line-clamp-3 flex-1 text-sm leading-relaxed whitespace-pre-line text-faint">
                  {t.body}
                </p>
                <p className="mt-4 text-xs text-faint">
                  Edited <LocalTime date={t.updatedAt} format="date" />
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageBody>
  );
}
