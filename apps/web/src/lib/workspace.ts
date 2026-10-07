import "server-only";
import { generateToken } from "@ripple/shared";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { auth } from "@/auth";
import type { Role } from "@/generated/prisma/client";
import { db } from "@/lib/db";

export const WORKSPACE_COOKIE = "rpl_ws";

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  return `${base || "team"}-${generateToken(6).toLowerCase()}`;
}

export async function createPersonalWorkspace(userId: string, ownerName: string) {
  const first = ownerName.split(/[\s@]/)[0] || "My";
  return db.workspace.create({
    data: {
      name: `${first}'s workspace`,
      slug: slugify(first),
      members: { create: { userId, role: "OWNER" } },
    },
  });
}

/** The signed-in user, or a redirect to /login. */
export const requireUser = cache(async () => {
  // Auth.js touches crypto before reading the request; mark the render dynamic first.
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user as typeof session.user & { id: string };
});

export interface CurrentWorkspace {
  user: Awaited<ReturnType<typeof requireUser>>;
  workspace: { id: string; name: string; slug: string };
  role: Role;
  memberships: { workspace: { id: string; name: string }; role: Role }[];
}

/**
 * Resolves the workspace the user is acting in: the one in the cookie if they still belong to it,
 * otherwise their oldest membership. Creates a personal workspace if they somehow have none.
 */
export const requireWorkspace = cache(async (): Promise<CurrentWorkspace> => {
  const user = await requireUser();
  const memberships = await db.member.findMany({
    where: { userId: user.id },
    select: { role: true, workspace: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: "asc" },
  });

  if (memberships.length === 0) {
    const ws = await createPersonalWorkspace(user.id, user.name ?? user.email ?? "My");
    const workspace = { id: ws.id, name: ws.name, slug: ws.slug };
    return { user, workspace, role: "OWNER", memberships: [{ workspace, role: "OWNER" }] };
  }

  const preferred = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  const current = memberships.find((m) => m.workspace.id === preferred) ?? memberships[0];

  return { user, workspace: current.workspace, role: current.role, memberships };
});

export function canManage(role: Role) {
  return role === "OWNER" || role === "ADMIN";
}
