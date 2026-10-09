import type { Metadata } from "next";
import { PageBody, PageHeader } from "@/components/dashboard/page-header";
import { ConnectExtension } from "@/components/extension/connect-extension";
import { requireWorkspace } from "@/lib/workspace";

export const metadata: Metadata = { title: "Chrome extension" };

const STEPS = [
  {
    title: "Get the extension",
    body: "Download the Ripple extension folder from the project (apps/extension/dist after building) or the release zip, and unzip it.",
  },
  {
    title: "Load it in your browser",
    body: "Open chrome://extensions (brave://extensions in Brave), switch on Developer mode, click “Load unpacked” and pick the folder.",
  },
  {
    title: "Connect it here",
    body: "Reload this page and click Connect extension. It links the extension to your account and this workspace.",
  },
];

export default async function ExtensionPage() {
  const { workspace } = await requireWorkspace();
  return (
    <PageBody>
      <PageHeader
        title="Chrome extension"
        description="Track single emails you write in Gmail, with read ticks in your Sent folder."
      />

      <section className="mt-8 rounded-2xl border border-line-strong bg-surface p-6">
        <ConnectExtension />
        <p className="mt-4 text-sm text-muted">
          Emails will be tracked in <span className="text-text">{workspace.name}</span>. Switch workspace first if you
          want a different one.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="font-medium">Install</h2>
        <ol className="mt-4 grid gap-6 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="tabular text-sm text-faint">{i + 1}</span>
              <p className="mt-1 font-medium">{s.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10 rounded-2xl border border-line bg-surface p-6 text-sm leading-relaxed text-muted">
        <h2 className="font-medium text-text">What it does</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>Adds a Ripple switch next to Gmail’s Send button. When on, the email gets a tracking image and tracked links as you send it.</li>
          <li>If Ripple can’t be reached within a few seconds, the email is sent untracked. It never holds your email back.</li>
          <li>Your own views of emails you sent never count as opens, including campaign emails in your Sent folder.</li>
          <li>
            It runs only on mail.google.com and this site. It sends Ripple the recipients, subject and links of emails
            you send with tracking on, and the IDs of Ripple tracking images in emails you view. Nothing else from your
            inbox leaves your browser.
          </li>
        </ul>
      </section>
    </PageBody>
  );
}
