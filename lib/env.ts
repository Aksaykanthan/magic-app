/**
 * Type-safe, validated environment variables — powered by @t3-oss/env-nextjs.
 *
 * WHY THIS FILE EXISTS
 * Reading `process.env.FOO` directly gives you `string | undefined` with no
 * validation: a missing or malformed var only blows up deep inside a request
 * handler, often in production. Importing `env` from here instead fails fast
 * at boot with a readable error naming exactly which variable is wrong.
 *
 * HOW TO EXTEND THIS FILE
 * - Server-only secret (DB/Redis/MinIO creds, API keys) -> add to `server`.
 * - Value that must reach the browser bundle -> add to `client`, and it MUST
 *   be prefixed `NEXT_PUBLIC_` (enforced at both the type and runtime level).
 * - Every var also needs an entry in `experimental__runtimeEnv` below (Next.js
 *   inlines `process.env.X` via static analysis at build time — you cannot
 *   loop over `process.env` dynamically for client vars).
 * - `bun run setup` regenerates `.env.example` to match whatever modules are
 *   selected; keep the optional/required-ness of each var here in sync with
 *   that script (see scripts/setup.ts -> buildEnvExample).
 *
 * Every other file in this template should import `env` from here instead of
 * touching `process.env` directly (the sole sanctioned exception is this
 * file, and `next.config.ts`/`prisma.config.ts`, which run before this
 * module's validation is relevant).
 */
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

    // --- Prisma / Postgres --------------------------------------------------
    // Required whenever the `auth` or `trpc` module is kept (both need the DB).
    DATABASE_URL: z.string().min(1).optional(),

    // --- better-auth (module: auth) -----------------------------------------
    BETTER_AUTH_SECRET: z.string().min(1).optional(),
    BETTER_AUTH_URL: z.string().min(1).optional(),
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),

    // --- Redis (module: redis) ----------------------------------------------
    REDIS_URL: z.string().min(1).optional(),

    // --- MinIO (module: minio) ----------------------------------------------
    MINIO_ENDPOINT: z.string().min(1).optional(),
    MINIO_PORT: z.coerce.number().int().positive().optional(),
    MINIO_USE_SSL: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => v === "true"),
    MINIO_ACCESS_KEY: z.string().min(1).optional(),
    MINIO_SECRET_KEY: z.string().min(1).optional(),
    MINIO_BUCKET: z.string().min(1).optional(),

    // --- Captcha — module: auth-method "captcha" (Cloudflare Turnstile) -----
    TURNSTILE_SECRET_KEY: z.string().min(1).optional(),

    // --- Mailer (module: mailer) ---------------------------------------------
    MAIL_PROVIDER: z.enum(["resend", "smtp", "console"]).optional(),
    MAIL_FROM: z.string().min(1).optional(),
    RESEND_API_KEY: z.string().min(1).optional(),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SMTP_SECURE: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => v === "true"),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
  },

  client: {
    NEXT_PUBLIC_APP_URL: z.string().min(1).default("http://localhost:3000"),
    // Client-side Turnstile site key — safe to expose (paired server-side
    // with TURNSTILE_SECRET_KEY, which never leaves the server).
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1).optional(),
  },

  // Next.js inlines `NEXT_PUBLIC_*` references at build time via static
  // string replacement, so every var has to be spelled out here rather than
  // spread from `process.env` dynamically — see the t3-env docs for why.
  experimental__runtimeEnv: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  },

  // Empty strings in `.env` (e.g. `GITHUB_CLIENT_ID=`) become `undefined`
  // instead of failing an otherwise-optional schema.
  emptyStringAsUndefined: true,

  // Let the build proceed without a real DB/Redis/MinIO during `next build`
  // static-page collection (no server is reachable at build time) — the
  // README/AGENTS.md make clear these are required at *runtime*.
  skipValidation:
    !!process.env.SKIP_ENV_VALIDATION || process.env.NODE_ENV === "test",
});
