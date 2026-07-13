---
name: backend-conventions
description: Deep-dive on this template's backend conventions — tRPC routers, Prisma driver adapters, Redis caching, MinIO object storage, the logger, env validation, and the mailer — read when adding or modifying backend code.
---

# Backend conventions

This template's backend surface is: **tRPC v11** (`lib/trpc/**`) for the typed API layer, **Prisma 7** (`lib/db.ts`, `prisma/schema.prisma`) for Postgres, **Redis** (`lib/redis.ts`) for caching/sessions, **MinIO** (`lib/minio.ts`) for object storage, a small custom **logger** (`lib/logger.ts`), a validated **env** module (`lib/env.ts`), and a provider-agnostic **mailer** (`lib/mailer.ts`). Each is a thin, singleton-backed wrapper — extend the existing pattern rather than introducing a new one.

## tRPC routers

**One file per domain** under `lib/trpc/routers/` (e.g. `post.ts`, and a new `user.ts`/`billing.ts` when you add a domain), each exporting `createTRPCRouter({...})` built from `publicProcedure`/`protectedProcedure` (`lib/trpc/init.ts`). Register every router as a field in `lib/trpc/routers/_app.ts`:

```ts
// lib/trpc/routers/_app.ts
import { createTRPCRouter } from "@/lib/trpc/init";
import { postRouter } from "@/lib/trpc/routers/post";

export const appRouter = createTRPCRouter({
  post: postRouter,
});

export type AppRouter = typeof appRouter;
```

Don't keep bolting unrelated procedures onto `post.ts` — a new Prisma model or external integration gets its own router file and its own `_app.ts` field.

### Worked example: `postRouter`

`lib/trpc/routers/post.ts` is the canonical shape to copy:

```ts
import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "@/lib/trpc/init";

export const postRouter = createTRPCRouter({
  list: publicProcedure.query(({ ctx }) =>
    ctx.db.post.findMany({
      where: { published: true },
      orderBy: { createdAt: "desc" },
      include: { author: { select: { name: true, image: true } } },
    }),
  ),

  byId: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => ctx.db.post.findUniqueOrThrow({ where: { id: input.id } })),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200),
        content: z.string().max(10_000).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.db.post.create({
        data: { ...input, authorId: ctx.session.user.id },
      }),
    ),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.post.delete({
        where: { id: input.id, authorId: ctx.session.user.id },
      });
      return { success: true };
    }),
});
```

Rules this demonstrates:

- **Reads (`list`/`byId`) are `publicProcedure`** — no auth required, `ctx.session` may be `null`. Anyone can view published posts.
- **Writes (`create`/`delete`) are `protectedProcedure`** — the middleware in `lib/trpc/init.ts` already threw `TRPCError({ code: "UNAUTHORIZED" })` and narrowed `ctx.session` to non-null before the handler body runs, so `ctx.session.user.id` is used directly with **no extra null check**.
- **Ownership is enforced in the `where` clause, not a separate check** — `delete` scopes by `{ id: input.id, authorId: ctx.session.user.id }` so a user can only delete their own posts; Prisma throws if the row doesn't match (no row belongs to someone else *and* matches the id).
- **Zod validates every input** (`.input(z.object({...}))`) before the resolver runs — reject malformed input at the router boundary, not inside the handler.
- `ctx` (from `createTRPCContext` in `lib/trpc/init.ts`) always carries `{ session, db }` — `ctx.db` is the same `prisma` singleton from `lib/db.ts`, so router code never imports `prisma` directly.

### RSC prefetch pattern vs client hook pattern

There are two ways to consume a router, and the choice depends on where the data is first needed.

**RSC prefetch** — for the initial data a Server Component page needs, so there's no client-side loading spinner on first paint. Call the server-side `trpc` proxy's `.queryOptions()`, hand it to `prefetch()`, then wrap the tree that reads the query in `<HydrateClient>` so the client-side React Query cache is seeded without a second fetch. Real example, `app/(app)/dashboard/page.tsx`:

```tsx
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { HydrateClient, prefetch, trpc } from "@/lib/trpc/server";
import { PostList } from "@/components/dashboard/post-list";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  prefetch(trpc.post.list.queryOptions());

  return (
    <div className="flex flex-col gap-6">
      {/* ... */}
      <HydrateClient>
        <PostList />
      </HydrateClient>
    </div>
  );
}
```

`prefetch()` (in `lib/trpc/server.tsx`) is a `void`-fired `prefetchQuery`/`prefetchInfiniteQuery` — it doesn't block rendering, it just warms the cache concurrently with the rest of the RSC render. `trpc` there is `createTRPCOptionsProxy({ ctx, router: appRouter, queryClient: getQueryClient })` — a server-only proxy, never imported into a Client Component.

**Client hook** — for anything that mutates, refetches, or depends on client-only state. `useTRPC()` (`lib/trpc/client.tsx`) returns the same options-proxy shape for use with React Query's own hooks. Real example, `components/dashboard/post-list.tsx`:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

export function PostList() {
  const trpc = useTRPC();
  const { data: posts, isLoading } = useQuery(trpc.post.list.queryOptions());
  // ...
}
```

Because the page already prefetched `trpc.post.list.queryOptions()` server-side and hydrated it via `<HydrateClient>`, this `useQuery` call resolves instantly from cache on first render — no spinner, no duplicate network round trip. Note the query key (`trpc.post.list.queryOptions()`) must match exactly between the server prefetch and the client `useQuery` call for hydration to hit.

For mutations, `trpc.post.create.mutationOptions({...})` feeds `useMutation`, typically invalidating the list query on success:

```tsx
const queryClient = useQueryClient();
const createPost = useMutation(
  trpc.post.create.mutationOptions({
    onSuccess: () => queryClient.invalidateQueries(trpc.post.list.queryFilter()),
  }),
);
```

**Rule of thumb**: RSC prefetch for a page's initial read; client hooks for every mutation and for any query a Client Component drives independently of the page load.

## Prisma

### Driver adapter (Prisma 7 requirement)

Prisma 7 no longer talks to Postgres directly — it requires a driver adapter. `prisma/schema.prisma`'s `datasource db` block has **no `url` field**:

```prisma
datasource db {
  provider = "postgresql"
}
```

The connection string is supplied at runtime by the adapter instead. `lib/db.ts` is the singleton:

```ts
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@/lib/env";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

The `globalForPrisma` stash exists because Next.js hot-reloads modules in dev: without it, every file edit would re-run this module top-to-bottom and spawn a brand-new `PrismaClient` (and a new connection pool) on top of the previous one, quickly exhausting Postgres connections. Stashing the instance on `globalThis` in non-production means dev hot-reloads reuse the same client instead of leaking a new one each time; production always constructs fresh (no `globalThis` involved, matching a real serverless/container cold start).

For the **CLI** (`prisma generate`/`migrate`/`studio`/`db push`), `prisma.config.ts` supplies the URL instead, because the CLI runs outside Next.js entirely and can't import `@/lib/env` (that module assumes a Next.js runtime):

```ts
// prisma.config.ts
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
```

This is one of the two sanctioned places in the app that reads a raw env var outside `lib/env.ts` (see [`lib/env.ts` — raw `process.env` exceptions](#raw-processenv-exceptions) below).

### Models

`prisma/schema.prisma` has five models:

| Model | Purpose |
|---|---|
| `User` | better-auth user — `id, name, email, emailVerified, image, createdAt, updatedAt` + relations to `sessions`, `accounts`, `posts`. |
| `Session` | better-auth session — `id, expiresAt, token, ipAddress, userAgent`, belongs to a `User`. |
| `Account` | better-auth linked credential/OAuth account — `accountId, providerId, accessToken, refreshToken, idToken, accessTokenExpiresAt, refreshTokenExpiresAt, scope, password`. |
| `Verification` | better-auth email verification / password reset tokens — `identifier, value, expiresAt`. |
| `Post` | **Sample domain model** — `id, title, content?, published, authorId → User`. Demonstrates the tRPC + Prisma + Zod pattern end to end; safe to delete once you have real models. |

**Do not rename auth-model fields or relations** (`User`, `Session`, `Account`, `Verification`) without also updating `lib/auth.ts` — better-auth's Prisma adapter expects this exact shape (see the schema's own header comment, which points at better-auth's adapter docs). Adding a new field to `User`/etc. is fine; renaming/removing an existing one breaks the adapter.

### Migration commands

From `package.json`:

```bash
bun run db:generate   # prisma generate         — regenerate the Prisma client after a schema change
bun run db:push       # prisma db push           — push schema changes directly, no migration history (prototyping)
bun run db:migrate    # prisma migrate dev        — create + apply a real, versioned migration file under prisma/migrations
bun run db:studio     # prisma studio             — visual DB browser
bun run db:seed       # bun prisma/seed.ts        — run the seed script
```

Use `db:push` while iterating on a schema shape with no need for history (e.g. early prototyping, a throwaway branch); switch to `db:migrate` once the schema is stabilizing and you want a reviewable, reversible migration file checked into `prisma/migrations/`.

## Redis

`lib/redis.ts` is an `ioredis` singleton, same `globalThis` dev-hot-reload guard as `lib/db.ts`:

```ts
export const redis =
  globalForRedis.redis ??
  new Redis(env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });
```

`lazyConnect: true` matters: Next.js imports route modules during `next build`'s static-page collection to gather metadata, even for pages that render statically — at that point no Redis server is reachable. Without `lazyConnect`, `ioredis` would eagerly open a connection at import time and noisily retry against nothing during every build. With it, the connection only opens on the first real command, which happens at request time when a server is actually up.

Three JSON convenience helpers sit on top of the raw string client:

```ts
export async function cacheGet<T>(key: string): Promise<T | null>
export async function cacheSet(key: string, value: unknown, ttlSeconds?: number): Promise<void>
export async function cacheDel(key: string): Promise<void>
```

`cacheGet` JSON-parses the stored value (or returns `null` if the key is missing); `cacheSet` JSON-stringifies and optionally sets a TTL via `EX`; `cacheDel` is a plain `redis.del`. Use these for arbitrary app-level caching rather than reaching for `redis.get`/`redis.set` directly, unless you specifically need raw string/non-JSON semantics.

### Current consumers

Both live in `lib/auth.ts`:

1. **`secondaryStorage`** — better-auth's session store, wired straight to the raw `redis` client (not the JSON helpers, since better-auth manages its own serialization):

   ```ts
   secondaryStorage: {
     get: (key) => redis.get(key),
     set: (key, value, ttl) =>
       ttl ? redis.set(key, value, "EX", ttl).then(() => undefined) : redis.set(key, value).then(() => undefined),
     delete: (key) => redis.del(key).then(() => undefined),
   },
   ```

   This means session reads/writes hit Redis instead of Postgres on the hot path — combined with a 5-minute `cookieCache`, most requests avoid both a DB and Redis round trip, which is why `proxy.ts` can call `auth.api.getSession()` on every matched request without a meaningful latency hit.

2. **`rateLimit.storage: "secondary-storage"`** — better-auth's built-in rate limiter (applies to every auth endpoint: sign-in, sign-up, forget-password, ...) is told to use the same Redis-backed secondary storage instead of its in-memory default, so limits are shared across server instances rather than reset per-instance:

   ```ts
   rateLimit: {
     enabled: true,
     window: 60,
     max: 100,
     storage: "secondary-storage",
   },
   ```

If you drop the `redis` module while keeping `auth`, both blocks are stripped and better-auth falls back to Postgres-backed sessions and in-memory rate limiting.

## MinIO

`lib/minio.ts` is an S3-compatible object storage client (the `minio` docker-compose service), same singleton pattern as Redis/Prisma. It exports `DEFAULT_BUCKET` (from `env.MINIO_BUCKET ?? "app-uploads"`) and four helpers:

```ts
export async function ensureBucket(bucket = DEFAULT_BUCKET): Promise<void>
export async function uploadObject(key: string, data: Buffer | Readable, size?: number, bucket = DEFAULT_BUCKET): Promise<string>
export async function getPresignedUrl(key: string, expirySeconds = 60 * 60, bucket = DEFAULT_BUCKET): Promise<string>
export async function deleteObject(key: string, bucket = DEFAULT_BUCKET): Promise<void>
```

- `ensureBucket` is idempotent (checks `bucketExists` first) and is called automatically at the top of `uploadObject` — you don't need to call it yourself before an upload, only if you want to guarantee a bucket exists ahead of time for some other reason.
- `uploadObject` accepts either a `Buffer` (size inferred from `.length`) or a `Readable` stream (pass `size` explicitly if known — required for MinIO to avoid buffering the whole stream). Returns the object `key` you passed in, for chaining into a DB write.
- `getPresignedUrl` returns a time-limited signed download URL, defaulting to a 1-hour expiry — use this instead of exposing objects as permanently public.
- `deleteObject` removes a single object by key.

### Uploading from a Server Action or Route Handler

`lib/minio.ts` is guarded with `import "server-only"`, so it can only be imported from server code — a Server Action, a Route Handler, or a tRPC procedure. Typical shape, built from the real signatures above:

```ts
"use server";

import { uploadObject, getPresignedUrl } from "@/lib/minio";

export async function uploadAvatar(formData: FormData) {
  const file = formData.get("avatar") as File;
  const buffer = Buffer.from(await file.arrayBuffer());

  const key = `avatars/${crypto.randomUUID()}-${file.name}`;
  await uploadObject(key, buffer);

  return getPresignedUrl(key);
}
```

Store the returned `key` (not the presigned URL, which expires) on the relevant Prisma row, and call `getPresignedUrl(key)` again whenever you need a fresh download link.

## Logging

`lib/logger.ts` exports a single `logger` with five level methods plus `.child()` for a namespaced sub-logger:

```ts
export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  success: (...args: unknown[]) => void;
  child: (scope: string) => Logger;
}
```

Each call prints a `HH:MM:SS.mmm`-timestamped, color-coded `[LEVEL]` tag via `picocolors`, with an optional `[scope]` prefix from `.child()`. Real usage, straight from the file's own doc comment:

```ts
import { logger } from "@/lib/logger";
logger.info("Server started");
const authLog = logger.child("auth");
authLog.warn("Rate limit hit", { userId });
```

**`debug()` is silent in production** — it only writes when `LOG_LEVEL=debug` is set or `NODE_ENV !== "production"`. If you need a `debug()` call visible in a live production environment for a one-off investigation, set `LOG_LEVEL=debug` there rather than switching the call to `info()`.

This is intentionally not a structured-logging framework (no pino/winston, no JSON output). If you outgrow it — need a log pipeline, shipping, or request-scoped correlation ids — swap the implementation inside `lib/logger.ts`; every call site only depends on the `Logger` interface it exports.

## Env validation (`lib/env.ts`)

Every environment variable is wrapped in a `@t3-oss/env-nextjs` `createEnv({...})` schema (Zod underneath), split into `server` (server-only secrets — DB/Redis/MinIO creds, API keys) and `client` (values that must reach the browser bundle):

```ts
export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    DATABASE_URL: z.string().min(1).optional(),
    // ... BETTER_AUTH_SECRET, REDIS_URL, MINIO_*, MAIL_*, etc.
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().min(1).default("http://localhost:3000"),
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1).optional(),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  },
  emptyStringAsUndefined: true,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION || process.env.NODE_ENV === "test",
});
```

- **Any `NEXT_PUBLIC_*` var must be listed in `experimental__runtimeEnv`**, spelled out individually as `process.env.NEXT_PUBLIC_X` — Next.js inlines these via static string replacement at build time, so you cannot loop over `process.env` dynamically for client vars. Adding a client var to the `client` block without also adding it here will throw at validation time.
- **`SKIP_ENV_VALIDATION`** — set to any truthy value to bypass the whole Zod schema (used automatically during `next build`'s static-page collection, and whenever `NODE_ENV=test`, since no real DB/Redis/MinIO is reachable at those points but they're required at runtime).
- Adding a new var: server-only secret → `server` block; anything that must reach the browser → `client` block **and** `experimental__runtimeEnv`. Keep `.env.example` and `scripts/setup.ts`'s `buildEnvExample` in sync with whatever you add.

**Every backend file should import `env` from `@/lib/env`** instead of touching `process.env` directly — a missing or malformed required var then fails fast with a readable error at boot, instead of surfacing as an obscure runtime error deep inside a request handler. `lib/db.ts`, `lib/redis.ts`, `lib/minio.ts`, `lib/mailer.ts`, and `lib/auth.ts` all follow this.

### Raw `process.env` exceptions

Exactly two files are exempt, both for the same underlying reason: they run in a context where `@/lib/env` isn't available or isn't the right contract.

- **`prisma.config.ts`** — runs via the standalone `prisma` CLI (`db:push`, `db:migrate`, `db:studio`, `db:generate`), entirely outside the Next.js process. It can't import `@/lib/env` because that module assumes Next.js's own module resolution and runtime; instead it loads `.env` itself via `dotenv/config` and reads `DATABASE_URL` with Prisma's own `env()` helper from `prisma/config`.
- **`lib/trpc/client.tsx`'s `VERCEL_URL` check** — `VERCEL_URL` is a platform-injected variable Vercel sets automatically at build/runtime; it isn't part of this template's own validated env contract (it's not something `.env`/`.env.example` should declare), so it's read directly:

  ```ts
  function getUrl() {
    if (typeof window !== "undefined") return "/api/trpc";
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/api/trpc`;
    return `${env.NEXT_PUBLIC_APP_URL}/api/trpc`;
  }
  ```

Any other direct `process.env.X` read in server code is a bug — add the var to `lib/env.ts` instead.

## Mailer (`lib/mailer.ts`)

Three providers, selected by the `MAIL_PROVIDER` env var (`z.enum(["resend", "smtp", "console"])`):

- **`resend`** — hosted API via the `resend` SDK, no SMTP credentials to manage. Requires `RESEND_API_KEY`.
- **`smtp`** — any SMTP server via `nodemailer`. Requires `SMTP_HOST` (plus optional `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`/`SMTP_PASSWORD`).
- **`console`** — no real provider; logs what would have been sent via `lib/logger.ts` (`mailLog.info`/`mailLog.debug`). This is also the fallback when `MAIL_PROVIDER` is unset, e.g. local dev before credentials are configured.

Every consumer calls the same function regardless of which provider is active:

```ts
export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text?: string; // plain-text fallback; some providers auto-generate one from html if omitted
}

export async function sendMail(input: SendMailInput): Promise<void>
```

`sendMail` dispatches on `env.MAIL_PROVIDER` internally (`resend` → `sendViaResend`, `smtp` → `sendViaSmtp`, otherwise → `sendViaConsole`) — call sites never branch on the provider themselves. `FROM_ADDRESS` comes from `env.MAIL_FROM ?? "onboarding@resend.dev"`.

### Current callers

Both in `lib/auth.ts`, wired into better-auth's own hooks:

```ts
emailAndPassword: {
  enabled: true,
  minPasswordLength: 8,
  autoSignIn: true,
  sendResetPassword: async ({ user, url }) => {
    await sendMail({
      to: user.email,
      subject: "Reset your password",
      html: `<p>Someone requested a password reset for this account.</p><p><a href="${url}">Reset your password</a></p><p>If this wasn't you, you can safely ignore this email.</p>`,
    });
  },
},
emailVerification: {
  sendOnSignUp: true,
  sendVerificationEmail: async ({ user, url }) => {
    await sendMail({
      to: user.email,
      subject: "Verify your email address",
      html: `<p>Click the link below to verify your email address.</p><p><a href="${url}">Verify email</a></p>`,
    });
  },
},
```

`url` in both cases is a better-auth-constructed callback link (password reset / verification), already scoped to `BETTER_AUTH_URL`. If you add a new transactional email (e.g. a welcome email, a notification), call `sendMail({ to, subject, html })` the same way — never construct a provider client directly outside `lib/mailer.ts`.
