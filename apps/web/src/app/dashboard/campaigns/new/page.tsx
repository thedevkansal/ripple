import type { Metadata } from "next";
import { CampaignEditor } from "@/components/campaigns/campaign-editor";
import { PageBody, PageHeader } from "@/components/dashboard/page-header";
import { ResetOnNavigate } from "@/components/ui/reset-on-navigate";
import { contactTagCounts, listTemplates, senderAccounts } from "@/lib/campaign-data";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "New campaign" };

export default async function NewCampaignPage() {
  const { user, workspace } = await requireWorkspace();
  const [accounts, tags, templates] = await Promise.all([
    senderAccounts(user.id),
    contactTagCounts(workspace.id),
    listTemplates(workspace.id),
  ]);
  const usable = accounts.find((a) => !a.needsReconnect);

  return (
    <PageBody>
      <PageHeader title="New campaign" back={{ href: "/dashboard/campaigns", label: "Campaigns" }} />
      <div className="mt-8">
        <ResetOnNavigate>
          <CampaignEditor
            initial={{
              name: "",
              tag: "",
              gmailAccountId: usable?.id ?? "",
              subject: "",
              body: "",
              trackClicks: true,
              linkAttachments: true,
              cc: [],
            }}
            initialRecipients={[]}
            initialAttachments={[]}
            templates={templates}
            workspaceId={workspace.id}
            accounts={accounts}
            tags={tags}
            senderName={user.name ?? ""}
          />
        </ResetOnNavigate>
      </div>
    </PageBody>
  );
}
