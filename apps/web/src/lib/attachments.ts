/** Total size of a campaign's files. Base64 adds a third, keeping emails well under Gmail's 25 MB. */
export const MAX_TOTAL_BYTES = 15 * 1024 * 1024;

export const ALLOWED_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

export const ACCEPT_ATTR = ".pdf,.png,.jpg,.jpeg,.docx,.pptx,.xlsx";

export const attachmentPrefix = (workspaceId: string) => `attachments/${workspaceId}/`;

export function isOwnBlobUrl(url: string, workspaceId: string) {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      u.hostname.endsWith(".public.blob.vercel-storage.com") &&
      decodeURIComponent(u.pathname).startsWith(`/${attachmentPrefix(workspaceId)}`)
    );
  } catch {
    return false;
  }
}

export interface AttachmentInfo {
  id: string;
  name: string;
  size: number;
  contentType: string;
  url: string;
}
