import type { Metadata } from "next";
import { CampaignEditor } from "@/components/campaigns/campaign-editor";
import { PageBody, PageHeader } from "@/components/dashboard/page-header";
import { contactTagCounts, senderAccounts } from "@/lib/campaign-data";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "New campaign" };

export default async function NewCampaignPage() {
  const { user, workspace } = await requireWorkspace();
  const [accounts, tags] = await Promise.all([senderAccounts(user.id), contactTagCounts(workspace.id)]);
  const usable = accounts.find((a) => !a.needsReconnect);

  return (
    <PageBody>
      <PageHeader title="New campaign" />
      <div className="mt-8">
        <CampaignEditor
          initial={{
            name: "",
            tag: "",
            gmailAccountId: usable?.id ?? "",
            subject: "",
            body: "",
            trackClicks: true,
            linkAttachments: true,
          }}
          initialRecipients={[]}
          initialAttachments={[]}
          workspaceId={workspace.id}
          accounts={accounts}
          tags={tags}
          senderName={user.name ?? ""}
        />
      </div>
    </PageBody>
  );
}
