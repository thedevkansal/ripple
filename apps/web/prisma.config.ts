import "dotenv/config";
import { defineConfig } from "prisma/config";

// Migrations need a direct connection; Neon's pooled host just adds "-pooler".
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL?.replace("-pooler.", ".");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url },
});
