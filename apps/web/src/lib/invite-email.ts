import "server-only";

export const INVITE_TTL_DAYS = 7;

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The invite email, sent untracked from the inviter's own Gmail. */
export function inviteEmail({
  inviter,
  workspace,
  role,
  url,
  days,
}: {
  inviter: string;
  workspace: string;
  role: "ADMIN" | "MEMBER";
  url: string;
  days: number;
}) {
  const as = role === "ADMIN" ? "an admin" : "a member";
  const subject = `${inviter} invited you to ${workspace} on Ripple`;
  const text = [
    "Hi,",
    "",
    `${inviter} invited you to join ${workspace} on Ripple as ${as}. Ripple tracks opens and clicks on the team's outreach emails.`,
    "",
    `Join here: ${url}`,
    "",
    `Sign in with this email address's Google account. The link works for ${days} days.`,
  ].join("\n");

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f1729">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e3e8ef;border-radius:16px">
<tr><td style="padding:32px">
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">Hi,</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6"><strong>${escape(inviter)}</strong> invited you to join <strong>${escape(workspace)}</strong> on Ripple as ${as}. Ripple tracks opens and clicks on the team's outreach emails.</p>
<a href="${escape(url)}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#0a9a83;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none">Join ${escape(workspace)}</a>
<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#5b6577">Sign in with this email address's Google account. The link works for ${days} days.</p>
</td></tr></table>
</td></tr></table>
</body></html>`;

  return { subject, html, text };
}
