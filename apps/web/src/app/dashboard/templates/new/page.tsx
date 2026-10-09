import type { Metadata } from "next";
import { PageBody, PageHeader } from "@/components/dashboard/page-header";
import { TemplateEditor } from "@/components/templates/template-editor";
import { ResetOnNavigate } from "@/components/ui/reset-on-navigate";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "New template" };

export default async function NewTemplatePage() {
  await requireWorkspace();
  return (
    <PageBody>
      <PageHeader title="New template" back={{ href: "/dashboard/templates", label: "Templates" }} />
      <div className="mt-8">
        <ResetOnNavigate>
          <TemplateEditor initial={{ name: "", subject: "", body: "" }} />
        </ResetOnNavigate>
      </div>
    </PageBody>
  );
}
