import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { db } from "@/lib/db";
import { createPersonalWorkspace } from "@/lib/workspace";

const baseAdapter = PrismaAdapter(db as unknown as Parameters<typeof PrismaAdapter>[0]);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: {
    ...baseAdapter,
    // Login only needs identity. Gmail send access is granted separately and stored encrypted,
    // so never keep Google's login tokens around.
    linkAccount: (account) =>
      baseAdapter.linkAccount!({
        ...account,
        access_token: undefined,
        refresh_token: undefined,
        id_token: undefined,
      }),
  },
  providers: [Google],
  session: { strategy: "database" },
  pages: { signIn: "/login" },
  events: {
    async createUser({ user }) {
      if (user.id) await createPersonalWorkspace(user.id, user.name ?? user.email ?? "My");
    },
  },
});
