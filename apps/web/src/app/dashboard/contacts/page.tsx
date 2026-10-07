import { Contact } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageBody, PageHeader } from "@/components/dashboard/page-header";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Contacts" };

export default async function ContactsPage() {
  await requireWorkspace();
  return (
    <PageBody>
      <PageHeader title="Contacts" description="Everyone your workspace has emailed, with their engagement." />
      <EmptyState
        icon={Contact}
        title="No contacts yet"
        body="Contacts are added when you import a list for a campaign. CSV import arrives in the next build."
      />
    </PageBody>
  );
}
