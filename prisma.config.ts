// Prisma's own config surface — read by the `prisma` CLI (generate/migrate/
// studio/db push) OUTSIDE of Next.js entirely, so it can't import
// `@/lib/env` (that module assumes a Next.js runtime and its own module
// resolution). Loads `.env` itself via `dotenv/config` and reads
// `DATABASE_URL` with Prisma's own `env()` helper. This is the one
// sanctioned place in the app that reads a raw env var outside `lib/env.ts`.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "./prisma/schema.prisma",
  migrations: {
    path: "./prisma/migrations",
    seed: "bun prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
