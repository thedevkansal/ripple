"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { createExtensionToken } from "@/lib/extension-auth";
import { requireWorkspace } from "@/lib/workspace";

/** A fresh token for this browser's extension, scoped to the current workspace. */
export async function connectExtension(browser: string): Promise<{ token: string }> {
  const { user, workspace } = await requireWorkspace();
  const label = `${browser.slice(0, 40) || "Browser"} · ${workspace.name}`;
  const token = await createExtensionToken(user.id, workspace.id, label);
  revalidatePath("/dashboard/settings");
  return { token };
}

export async function revokeExtension(id: string) {
  const { user } = await requireWorkspace();
  await db.extensionToken.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/dashboard/settings");
}
