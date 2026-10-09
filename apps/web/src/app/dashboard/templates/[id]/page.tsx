import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageBody, PageHeader } from "@/components/dashboard/page-header";
import { TemplateEditor } from "@/components/templates/template-editor";
import { ResetOnNavigate } from "@/components/ui/reset-on-navigate";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Template" };

export default async function TemplatePage({ params }: PageProps<"/dashboard/templates/[id]">) {
  const { id } = await params;
  const { workspace } = await requireWorkspace();
  const template = await db.template.findFirst({
    where: { id, workspaceId: workspace.id },
    select: { id: true, name: true, subject: true, body: true },
  });
  if (!template) notFound();

  return (
    <PageBody>
      <PageHeader title={template.name} back={{ href: "/dashboard/templates", label: "Templates" }} />
      <div className="mt-8">
        <ResetOnNavigate>
          <TemplateEditor initial={template} />
        </ResetOnNavigate>
      </div>
    </PageBody>
  );
}
