# AGENTS.md

Canonical onboarding doc for **magic-nextjs-template** — read this first, whether you're a human or an AI coding agent.

## Table of contents

1. [Overview](#1-overview)
2. [Tech stack](#2-tech-stack)
3. [File structure](#3-file-structure)
4. [Auth rules](#4-auth-rules)
5. [Design / CSS conventions](#5-design--css-conventions)
6. [Data layer](#6-data-layer)
7. [tRPC conventions](#7-trpc-conventions)
8. [Environment variables](#8-environment-variables)
9. [Docker services](#9-docker-services)
10. [Module selection (`bun run setup`)](#10-module-selection-bun-run-setup)
11. [Commands cheat-sheet](#11-commands-cheat-sheet)

---

## 1. Overview

This is a **modular Next.js 16 starter**: instead of shipping every integration turned on, it ships all of them *written and working*, and lets you opt out of what you don't need.

```bash
bun run setup
```

`bun run setup` runs `scripts/setup.ts`, an interactive CLI (`@clack/prompts`) that asks which modules you want (auth, tRPC, Redis, MinIO, Docker — see [§10](#10-module-selection-bun-run-setup)), then writes `.env` from `.env.example` and strips the code/config for anything you declined. The goal is that after setup finishes, the repo contains *only* the modules you picked, with no dead imports or unused env vars left behind.

If you're an agent working in this repo: don't re-invent auth, data-fetching, or the UI kit — they're already wired (see the stack table below). Extend the existing patterns (a new tRPC router, a new page under the right route group, a new shadcn component) rather than introducing a parallel convention.

---

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16** (App Router) | React Server Components by default; route guarding via `proxy.ts` (replaces `middleware.ts`). |
| Language | **TypeScript** (strict) | `@types/node`, `@types/react`, `@types/react-dom` pinned in devDependencies. |
| Styling | **Tailwind CSS v4** | CSS-variable theme in `app/globals.css`, no `tailwind.config.ts` — v4 is CSS-first. |
| UI kit | **shadcn/ui on Base UI** (`@base-ui/react`) | **Not Radix.** Component APIs differ — no `asChild`, polymorphism via the `render` prop (see [§5](#5-design--css-conventions)). |
| Icons | **lucide-react** v1.x | Generic icon set only — brand/logo icons (Github, Twitter, etc.) are not exported. |
| Auth | **better-auth** | Server instance in `lib/auth.ts`, client instance in `lib/auth-client.ts`, session cache in Redis. |
| API layer | **tRPC v11** + `@trpc/tanstack-react-query` | End-to-end typed procedures; React Query under the hood. |
| ORM | **Prisma 7** | Driver adapters (`@prisma/adapter-pg`), config lives in `prisma.config.ts`, **no `datasource url` field in `schema.prisma`**. |
| Cache / sessions | **Redis** (`ioredis`) | Backs better-auth's `secondaryStorage` and general app caching (`lib/redis.ts`). |
| Object storage | **MinIO** | S3-compatible; `lib/minio.ts` wraps upload/presign/delete. |
| Local infra | **docker-compose** | Postgres + Redis + MinIO, see [§9](#9-docker-services). |
| Package manager | **Bun** (pnpm/npm supported as fallbacks via `scripts/setup.ts`) | Docs and scripts in this repo assume `bun`. |

---

## 3. File structure

```
app/
  layout.tsx              # Root layout: ThemeProvider, TRPCReactProvider, TooltipProvider, Toaster — don't re-wrap these
  page.tsx                 # Public marketing/landing page
  globals.css               # Tailwind v4 theme tokens (oklch), dark mode variant, base layer
  api/
    auth/[...all]/route.ts  # better-auth's catch-all handler (mounts every auth endpoint)
    trpc/[trpc]/route.ts    # tRPC HTTP handler (fetch adapter)
  (auth)/                  # Route group: /login, /register — unauthenticated-only pages
    login/page.tsx
    register/page.tsx
  (app)/                   # Route group: /dashboard, /settings — authenticated-only pages
    layout.tsx              # Dashboard shell: SidebarProvider + AppSidebar + SidebarInset
    dashboard/page.tsx
    settings/page.tsx

components/
  theme-provider.tsx        # next-themes wrapper (class strategy)
  ui/                       # shadcn/Base UI primitives — generated, treat as a library, avoid hand-editing
    button.tsx, input.tsx, sidebar.tsx, dropdown-menu.tsx, dialog.tsx, ...
  # composed, app-specific pieces (app sidebar nav, auth forms, user menu, etc.) live directly
  # under components/ alongside ui/, e.g. components/app-sidebar.tsx, components/login-form.tsx

lib/
  auth.ts                  # better-auth server instance (Prisma adapter + Redis secondaryStorage)
  auth-client.ts             # better-auth React client (authClient, signIn, signUp, signOut, useSession)
  db.ts                     # Prisma singleton (PrismaPg driver adapter)
  redis.ts                  # ioredis singleton + cacheGet/cacheSet/cacheDel helpers
  minio.ts                  # MinIO client singleton + uploadObject/getPresignedUrl/deleteObject
  utils.ts                  # cn() (clsx + tailwind-merge)
  trpc/
    init.ts                  # createTRPCContext, publicProcedure, protectedProcedure
    server.tsx                # RSC helpers: trpc proxy, prefetch(), HydrateClient
    client.tsx                 # Client helpers: TRPCReactProvider, useTRPC
    query-client.ts            # makeQueryClient() shared by server.tsx and client.tsx
    routers/
      _app.ts                  # Root router — register every domain router here
      post.ts                  # Sample CRUD router (list/byId/create/delete) — delete once replaced

prisma/
  schema.prisma              # User/Session/Account/Verification (better-auth) + Post (sample model)
  seed.ts                    # bun run db:seed entry point
  migrations/                # created by `prisma migrate dev`

scripts/
  setup.ts                   # `bun run setup` — interactive module picker (see §10)

proxy.ts                     # Route guard (Next.js 16's middleware.ts replacement) — see §4
prisma.config.ts             # Prisma 7 config: schema path, migrations, seed command, datasource url
components.json              # shadcn CLI config (aliases, style, base color)
docker-compose.yml            # postgres / redis / minio services
.env.example                 # template for .env — see §8
```

**Route groups**: `(auth)` and `(app)` are Next.js route groups — the parens are stripped from the URL, so `app/(auth)/login/page.tsx` serves `/login` and `app/(app)/dashboard/page.tsx` serves `/dashboard`. They exist purely to give each half of the app its own layout: `(auth)` gets a bare centered-card layout for sign-in/sign-up, `(app)` gets the sidebar dashboard shell. Auth **enforcement** is not done in these layouts — that's `proxy.ts`'s job (see [§4](#4-auth-rules)); a page under `(app)` can assume `auth.api.getSession()` will return a session because `proxy.ts` already redirected anonymous requests away.

**Adding a tRPC router**: create `lib/trpc/routers/<domain>.ts` exporting a `createTRPCRouter({...})`, then register it as a field on the router in `lib/trpc/routers/_app.ts`. See [§7](#7-trpc-conventions).

**UI primitives vs. composed components**: anything under `components/ui/` is a shadcn-generated primitive (installed via `bunx shadcn add <name>`) — treat it as a vendored library, don't hand-roll app logic into it. App-specific composed components (forms, nav, cards that combine several primitives) live directly under `components/` (or a subfolder you introduce, e.g. `components/dashboard/`), built out of the `ui/` primitives.

---

<!-- MODULE:auth:start -->
## 4. Auth rules

- **Server instance** — `lib/auth.ts` exports `auth = betterAuth({...})`: Prisma adapter (`provider: "postgresql"`), Redis-backed `secondaryStorage` (session lookups skip Postgres), email/password enabled (min length 8, `autoSignIn: true`), optional GitHub/Google OAuth (enabled only when their env vars are set), 30-day sessions with a 5-minute cookie cache, and the `nextCookies()` plugin so Server Actions/Route Handlers can set cookies. It also exports `type Session = typeof auth.$Infer.Session`.
- **Client instance** — `lib/auth-client.ts` exports `authClient = createAuthClient({ baseURL: NEXT_PUBLIC_APP_URL })` and re-exports `signIn`, `signUp`, `signOut`, `useSession`. Use these only in Client Components (`"use client"`); Server Components/Route Handlers should call `auth.api.*` from `lib/auth.ts` directly instead.
- **HTTP handler** — `app/api/auth/[...all]/route.ts` mounts every better-auth endpoint (sign-in, sign-up, OAuth callbacks, etc.) behind one catch-all route.
- **Session shape** — `Session["user"]` has `id`, `name`, `email`, `emailVerified`, `image` (plus whatever Prisma's `User` model defines — see [§6](#6-data-layer)).

**Usage**

```ts
// Client Component
"use client";
import { signIn, useSession } from "@/lib/auth-client";

await signIn.email({ email, password }, {
  onSuccess: () => router.push("/dashboard"),
  onError: (ctx) => toast.error(ctx.error.message),
});

const { data, isPending } = useSession(); // data?.user
```

```ts
// Server Component / Route Handler
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

const session = await auth.api.getSession({ headers: await headers() });
```

### Route protection (`proxy.ts`)

`proxy.ts` is the Next.js 16 replacement for `middleware.ts`. It runs on the Node.js runtime (so `auth.api.getSession` can hit Redis/Postgres directly instead of an internal HTTP round trip) and does two things on every matched request:

1. If the path is `/login` or `/register` **and** a session exists → redirect to `/dashboard`.
2. If the path is anything else matched **and no** session exists → redirect to `/login?redirectTo=<original path>`.

```ts
export const config = {
  matcher: ["/dashboard/:path*", "/settings/:path*", "/login", "/register"],
};
```

**To protect a new route**, add its pattern to that `matcher` array — nothing else. Because `proxy.ts` already guarantees a session exists for anything under `(app)`, pages/layouts inside `app/(app)/**` must **not** duplicate the auth check (no `if (!session) redirect(...)` inside those pages) — that logic lives exclusively in `proxy.ts`.

### tRPC: `protectedProcedure` vs `publicProcedure`

Defined in `lib/trpc/init.ts`:

- `publicProcedure` — no auth check, `ctx.session` may be `null`.
- `protectedProcedure` — wraps `publicProcedure` with a middleware that throws `TRPCError({ code: "UNAUTHORIZED" })` if `ctx.session?.user` is missing, and narrows `ctx.session` to non-null for the rest of the procedure chain. Use this for any mutation/query that reads or writes user-owned data (see `postRouter.create`/`postRouter.delete` in `lib/trpc/routers/post.ts` for the pattern — `ctx.session.user.id` is used directly, no extra null check needed).

### Redis-backed session cache

better-auth's `secondaryStorage` option (in `lib/auth.ts`) is wired to the `redis` singleton from `lib/redis.ts` (`get`/`set`/`delete`), so session reads/writes go to Redis instead of Postgres on the hot path. Combined with the 5-minute `cookieCache`, most requests avoid both a DB and a Redis round trip. This is why `proxy.ts` can afford to call `auth.api.getSession` on every matched request without a meaningful latency hit.
<!-- MODULE:auth:end -->

---

## 5. Design / CSS conventions

- **Theme tokens** — `app/globals.css` defines the entire palette as CSS variables in `oklch(...)` color space, split into `:root` (light) and `.dark` (dark) blocks, then re-exposed to Tailwind via `@theme inline` (e.g. `--color-primary: var(--primary)`). Includes standard shadcn tokens (`background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`, `chart-1..5`) **plus sidebar-specific tokens** (`--sidebar`, `--sidebar-foreground`, `--sidebar-primary`, `--sidebar-primary-foreground`, `--sidebar-accent`, `--sidebar-accent-foreground`, `--sidebar-border`, `--sidebar-ring`) consumed by `components/ui/sidebar.tsx`.
- **Radius scale** — one variable, `--radius: 0.625rem`, drives everything: `--radius-sm` = `radius * 0.6`, `-md` = `*0.8`, `-lg` = `radius` itself, `-xl` = `*1.4`, `-2xl` = `*1.8`, up to `-4xl`. Don't hardcode `rounded-[Npx]` — use the scale (`rounded-lg`, `rounded-xl`, ...).
- **Dark mode** — `next-themes` with the `class` strategy, configured in `app/layout.tsx` (`attribute="class" defaultTheme="system" enableSystem`) and `@custom-variant dark (&:is(.dark *))` in `globals.css`. Use Tailwind's `dark:` variant directly (e.g. `dark:border-input dark:bg-input/30`); never branch on theme in JS unless building a theme toggle itself.
- **Base UI `render` prop (replaces Radix `asChild`)** — Base UI has no `asChild`. To make a component render as a different element (e.g. a `Button` that's really a `Link`), pass the target element to `render`; the wrapped element receives the component's own props/children, and its own children are discarded:

  ```tsx
  import Link from "next/link";
  import { Button } from "@/components/ui/button";

  <Button size="lg" nativeButton={false} render={<Link href="/register" />}>
    Create an account
  </Button>
  ```

  **Gotcha:** the literal `Button` component (`@/components/ui/button`) defaults to `nativeButton={true}` and warns loudly in dev (`Base UI: A component that acts as a button expected a native <button>...`) if `render` swaps it for a non-`<button>` element like `Link`/`<a>`. Always pass `nativeButton={false}` alongside `render={<Link .../>}` on `Button`. Other Base UI trigger components (`SidebarMenuButton`, `DropdownMenuItem`, `DropdownMenuTrigger`, `TabsTrigger`, …) use a different lower-level primitive and do **not** need this — only the `Button` component itself.

  Same pattern for any Base UI-backed trigger, e.g. `<DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}><Icon /></DropdownMenuTrigger>`. If you don't need a different underlying element, just nest a plain child — Base UI triggers already render as real `<button>`s by default.
- **`"use client"`** — only on components that need hooks, event handlers, or browser APIs (forms, `useSession`, `useTRPC` mutations, anything interactive). Page-level composition (`app/**/page.tsx`) stays a Server Component unless it directly needs client state; push interactivity down into small client leaf components instead of marking whole pages `"use client"`.
- **Spacing/typography, observed in `app/page.tsx`**:
  - `text-balance` on headings/subheads that wrap to multiple lines (`h1`, intro `p`) for even line breaks.
  - Icon sizing via Tailwind's `size-*` utility, not `h-*`/`w-*` pairs (`className="size-3.5"`, `className="size-4"`); the button component itself defaults inline SVGs to `size-4` unless overridden.
  - Card-like content blocks use `rounded-xl border bg-card p-5`; the design-token radius scale reserves `rounded-lg` for form controls/buttons (per `button.tsx`'s own class list) and `rounded-xl`+ for larger surfaces.
  - Section rhythm: generous vertical gaps (`gap-16`, `py-16 md:py-24`) at the page level, tighter `gap-4`/`gap-6` inside a card grid.
  - Muted secondary text via `text-muted-foreground`, never a raw gray.

---

## 6. Data layer

**Models** (`prisma/schema.prisma`):

| Model | Purpose |
|---|---|
| `User` | better-auth user — `id, name, email, emailVerified, image, createdAt, updatedAt` + relations to `sessions`, `accounts`, `posts`. |
| `Session` | better-auth session — `id, expiresAt, token, ipAddress, userAgent`, belongs to a `User`. |
| `Account` | better-auth linked credential/OAuth account — `accountId, providerId, accessToken, refreshToken, idToken, ...`. |
| `Verification` | better-auth email verification / password reset tokens. |
| `Post` | **Sample domain model** — `id, title, content?, published, authorId → User`. Demonstrates the tRPC+Prisma+Zod pattern end to end; safe to delete once you have real models. |

Do not rename auth-model fields/relations without also updating `lib/auth.ts` — better-auth's Prisma adapter expects this exact shape.

**Migrations & tooling**:

```bash
bun run db:push      # prisma db push — fast, no migration history; use while prototyping the schema
bun run db:migrate    # prisma migrate dev — generates a real migration file under prisma/migrations
bun run db:studio     # prisma studio — visual DB browser
bun run db:seed       # bun prisma/seed.ts — runs prisma/seed.ts
bun run db:generate   # prisma generate — regenerate the Prisma client after a schema change
```

**Driver adapter** — Prisma 7 no longer talks to the database directly; it requires a driver adapter. `lib/db.ts` constructs `new PrismaPg({ connectionString: process.env.DATABASE_URL })` from `@prisma/adapter-pg` and passes it to `new PrismaClient({ adapter })`. Correspondingly `prisma/schema.prisma`'s `datasource db` block has **no `url` field** — the connection string is supplied at runtime by the adapter (and, for the Prisma CLI itself, by `prisma.config.ts`'s `datasource: { url: env("DATABASE_URL") }`), not by `schema.prisma`. This is a Prisma 7 requirement, not a stylistic choice — omitting the adapter throws at startup.

`lib/db.ts` also guards against Next.js dev-mode hot-reload spawning a new `PrismaClient`/connection pool per edit, by stashing the instance on `globalThis` outside of production.

---

<!-- MODULE:trpc:start -->
## 7. tRPC conventions

- **One router file per domain** under `lib/trpc/routers/` (e.g. `post.ts`, `user.ts`, `billing.ts`). Each exports `createTRPCRouter({ ... })` built from `publicProcedure`/`protectedProcedure` (from `lib/trpc/init.ts`), with Zod schemas for input validation.
- **Register it** as a field on the object passed to `createTRPCRouter` in `lib/trpc/routers/_app.ts`:

  ```ts
  import { createTRPCRouter } from "@/lib/trpc/init";
  import { postRouter } from "@/lib/trpc/routers/post";
  import { userRouter } from "@/lib/trpc/routers/user"; // new router

  export const appRouter = createTRPCRouter({
    post: postRouter,
    user: userRouter,
  });
  export type AppRouter = typeof appRouter;
  ```

  Add a new router whenever you introduce a new domain concept (a new Prisma model, a new external integration) that needs its own set of queries/mutations — don't keep bolting unrelated procedures onto `post.ts`.

- **RSC prefetch pattern** (Server Components) — call the server-side `trpc` proxy's `.queryOptions()`, hand it to `prefetch()`, then wrap the part of the tree that needs the data in `<HydrateClient>` so the client-side React Query cache is seeded without a second fetch:

  ```tsx
  // app/(app)/dashboard/page.tsx
  import { trpc, prefetch, HydrateClient } from "@/lib/trpc/server";
  import { PostList } from "@/components/post-list"; // client component using useQuery

  export default function DashboardPage() {
    prefetch(trpc.post.list.queryOptions());
    return (
      <HydrateClient>
        <PostList />
      </HydrateClient>
    );
  }
  ```

- **Client hook pattern** (Client Components) — `useTRPC()` from `@/lib/trpc/client` returns the same options-proxy shape for use with React Query's own hooks:

  ```tsx
  "use client";
  import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
  import { useTRPC } from "@/lib/trpc/client";

  export function PostList() {
    const trpc = useTRPC();
    const { data: posts } = useQuery(trpc.post.list.queryOptions());
    const queryClient = useQueryClient();
    const createPost = useMutation(
      trpc.post.create.mutationOptions({
        onSuccess: () => queryClient.invalidateQueries(trpc.post.list.queryFilter()),
      }),
    );
    // ...
  }
  ```

- Use the **RSC prefetch pattern** for the initial data a page needs (avoids a client-side loading spinner on first paint); use the **client hook pattern** for anything that mutates, refetches, or depends on client-only state.
<!-- MODULE:trpc:end -->

---

## 8. Environment variables

All variables live in `.env.example` at the repo root; copy it to `.env` and fill in (or let `bun run setup` do it for the modules you select).

| Variable | Description | Module |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Public base URL of the app (e.g. `http://localhost:3000`); used by the better-auth client and the tRPC client's server-side fetch URL. | core |
| `DATABASE_URL` | Postgres connection string, consumed by the Prisma driver adapter (`lib/db.ts`) and `prisma.config.ts`. Matches the `postgres` docker-compose service by default. | database (Prisma/Postgres) |
| `BETTER_AUTH_SECRET` | Secret used by better-auth to sign sessions/tokens. Generate with `bunx @better-auth/cli@latest secret`. | auth |
| `BETTER_AUTH_URL` | Base URL better-auth uses for callback/redirect construction. | auth |
| `REDIS_URL` | Connection string for the `redis` docker-compose service, consumed by `lib/redis.ts` (and, transitively, better-auth's session cache). | redis |
| `MINIO_ENDPOINT` | MinIO host (default `localhost`). | minio |
| `MINIO_PORT` | MinIO S3 API port (default `9000`). | minio |
| `MINIO_USE_SSL` | Whether to use HTTPS against MinIO (`"false"` locally). | minio |
| `MINIO_ACCESS_KEY` | MinIO access key (default `minioadmin`, matches `docker-compose.yml`). | minio |
| `MINIO_SECRET_KEY` | MinIO secret key (default `minioadmin`, matches `docker-compose.yml`). | minio |
| `MINIO_BUCKET` | Default bucket name `lib/minio.ts` uploads into (`app-uploads`), auto-created if missing. | minio |
| `GITHUB_CLIENT_ID` | GitHub OAuth app client ID — leave blank to disable the provider in `lib/auth.ts`. | auth (optional OAuth) |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth app client secret. | auth (optional OAuth) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID — leave blank to disable the provider in `lib/auth.ts`. | auth (optional OAuth) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret. | auth (optional OAuth) |

---

<!-- MODULE:docker:start -->
## 9. Docker services

`docker-compose.yml` defines three local services (project name `magic-nextjs-template`):

| Service | Image | Port(s) | Default credentials |
|---|---|---|---|
| `postgres` | `postgres:17-alpine` | `5432` | user `postgres`, password `postgres`, db `app` |
| `redis` | `redis:7-alpine` | `6379` | none |
| `minio` | `minio/minio:latest` | `9000` (S3 API), `9001` (web console) | `minioadmin` / `minioadmin` |

All three have healthchecks (`pg_isready`, `redis-cli ping`, `mc ready local`) and named volumes (`postgres_data`, `redis_data`, `minio_data`) so data survives `docker compose down` (but not `down -v`).

```bash
bun run docker:up     # docker compose up -d      — start postgres/redis/minio in the background
bun run docker:down    # docker compose down        — stop and remove the containers (volumes persist)
bun run docker:logs    # docker compose logs -f      — tail logs from all three services
```
<!-- MODULE:docker:end -->

---

## 10. Module selection (`bun run setup`)

`bun run setup` runs `scripts/setup.ts`, a `@clack/prompts`-driven CLI that lets you toggle modules on/off before you start building, so the shipped app only contains what you actually use. Toggles:

- **auth** — keep/remove better-auth: `lib/auth.ts`, `lib/auth-client.ts`, `app/api/auth/[...all]/route.ts`, the `(auth)` route group (`/login`, `/register`), `proxy.ts`'s guard logic, and the auth-related `User`/`Session`/`Account`/`Verification` models in `prisma/schema.prisma`. Disabling it also removes `protectedProcedure` usage from the sample tRPC router (or the router entirely, since `post.create`/`post.delete` require a session).
- **trpc** — keep/remove the tRPC layer: `lib/trpc/**`, `app/api/trpc/[trpc]/route.ts`, the `TRPCReactProvider` wrapper in `app/layout.tsx`, and the sample `postRouter`. Disabling it removes the typed-API layer entirely — you'd fall back to plain Route Handlers or Server Actions.
- **redis** — keep/remove `lib/redis.ts`, the `redis` docker-compose service, `REDIS_URL`, and better-auth's `secondaryStorage` wiring in `lib/auth.ts` (auth falls back to hitting Postgres directly for session reads if this is off while auth stays on).
- **minio** — keep/remove `lib/minio.ts`, the `minio` docker-compose service, and the `MINIO_*` env vars. Nothing else depends on it out of the box (it's opt-in storage, not wired into auth or the sample router).
- **docker** — keep/remove `docker-compose.yml` itself and the `docker:*` scripts; useful if you're pointing at externally-hosted Postgres/Redis/MinIO instead of running them locally.

After you answer the prompts, the script writes `.env` from `.env.example` (only the vars for modules you kept) and deletes the files/config for anything you declined, so the resulting repo has no dead code referencing a module you turned off.

> `scripts/setup.ts` is still being authored alongside this doc — if you don't see it yet, the behavior above is the target design; check the file itself for the current implementation before relying on exact file names it deletes.

---

## 11. Commands cheat-sheet

| Command | Description |
|---|---|
| `bun run setup` | Interactive module picker (`scripts/setup.ts`) — choose modules, writes `.env`. See [§10](#10-module-selection-bun-run-setup). |
| `bun run dev` | `next dev` — start the Next.js dev server. |
| `bun run build` | `next build` — production build. |
| `bun run start` | `next start` — run the production build. |
| `bun run lint` | `eslint` — lint the codebase. |
| `bun run typecheck` | `tsc --noEmit` — type-check without emitting output. |
| `bun run db:generate` | `prisma generate` — regenerate the Prisma client from `schema.prisma`. |
| `bun run db:push` | `prisma db push` — push schema changes to the DB without creating a migration (prototyping). |
| `bun run db:migrate` | `prisma migrate dev` — create and apply a real, versioned migration. |
| `bun run db:studio` | `prisma studio` — visual database browser. |
| `bun run db:seed` | `bun prisma/seed.ts` — run the seed script. |
| `bun run docker:up` | `docker compose up -d` — start postgres/redis/minio. |
| `bun run docker:down` | `docker compose down` — stop the docker services. |
| `bun run docker:logs` | `docker compose logs -f` — tail docker service logs. |
