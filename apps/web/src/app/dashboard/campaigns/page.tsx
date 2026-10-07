import { Send } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageBody, PageHeader } from "@/components/dashboard/page-header";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  await requireWorkspace();
  return (
    <PageBody>
      <PageHeader title="Campaigns" description="Personal emails to a whole list, sent from your Gmail." />
      <EmptyState
        icon={Send}
        title="No campaigns yet"
        body="Campaign sending arrives in the next build: upload a CSV, write one email with merge fields, and Ripple sends it at a safe pace."
      />
    </PageBody>
  );
}
