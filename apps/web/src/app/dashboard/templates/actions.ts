"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/workspace";

const templateSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Give the template a name.").max(80),
  subject: z.string().trim().max(200),
  body: z.string().max(20_000),
});
export type TemplateInput = z.input<typeof templateSchema>;

export interface TemplateInfo {
  id: string;
  name: string;
  subject: string;
  body: string;
}

export async function saveTemplate(
  input: TemplateInput,
): Promise<{ ok: true; template: TemplateInfo } | { ok: false; error: string }> {
  const { user, workspace } = await requireWorkspace();
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { id, ...data } = parsed.data;
  if (!data.subject && !data.body.trim()) return { ok: false, error: "Add a subject or a message first." };

  const select = { id: true, name: true, subject: true, body: true } as const;
  let template: TemplateInfo;
  if (id) {
    const { count } = await db.template.updateMany({ where: { id, workspaceId: workspace.id }, data });
    if (!count) return { ok: false, error: "That template no longer exists." };
    template = await db.template.findUniqueOrThrow({ where: { id }, select });
  } else {
    template = await db.template.create({
      data: { ...data, workspaceId: workspace.id, createdById: user.id },
      select,
    });
  }
  revalidatePath("/dashboard/templates");
  return { ok: true, template };
}

export async function deleteTemplate(id: string) {
  const { workspace } = await requireWorkspace();
  await db.template.deleteMany({ where: { id, workspaceId: workspace.id } });
  revalidatePath("/dashboard/templates");
  redirect("/dashboard/templates");
}
