# AGENTS.md

Canonical onboarding doc for **magic-app** — read this first, whether you're a human or an AI coding agent.

## Table of contents

1. [Overview](#1-overview)
2. [Tech stack](#2-tech-stack)
3. [File structure](#3-file-structure)
4. [Auth rules](#4-auth-rules)
5. [Design / CSS conventions](#5-design--css-conventions)
6. [Theming (multi-theme + providers)](#6-theming-multi-theme--providers)
7. [Environment variables & validation](#7-environment-variables--validation)
8. [Logging](#8-logging)
9. [Data layer](#9-data-layer)
10. [tRPC conventions](#10-trpc-conventions)
11. [Docker services](#11-docker-services)
12. [Module selection & scaffolding](#12-module-selection--scaffolding)
13. [Commands cheat-sheet](#13-commands-cheat-sheet)
14. [Focused AI-agent skills](#14-focused-ai-agent-skills)

---

## 1. Overview

This is a **modular Next.js 16 starter**: instead of shipping every integration turned on, it ships all of them *written and working*, and lets you opt out of what you don't need — either right when you scaffold a new project (`npx create-magic-app`) or any time later inside an existing checkout (`bun run setup`).

```bash
# scaffold a brand-new project (clones this repo, then runs the picker below)
npx github:Aksaykanthan/magic-app
# (or, once this package is published to npm: npx create-magic-app@latest)

# already have a checkout? run the same picker in place
bun run setup
```

Both commands end up in the same interactive `@clack/prompts` flow (`scripts/setup.ts`): pick a package manager, pick which optional modules to keep (auth, tRPC, Redis, MinIO, Docker — see [§12](#12-module-selection--scaffolding)), pick a default color theme and light/dark/system mode (see [§6](#6-theming-multi-theme--providers)). The script then writes `.env` from `.env.example`, strips the code/config for anything you declined (including surgically rewriting files that partially depend on a dropped module, not just deleting whole directories), rewrites `docker-compose.yml`/`AGENTS.md` to match, and — for a fresh scaffold — re-initializes git with a single clean "Initial commit" so the template's own history isn't part of your project's history.

If you're an agent working in this repo: don't re-invent auth, data-fetching, theming, or the UI kit — they're already wired (see the stack table below). Extend the existing patterns (a new tRPC router, a new page under the right route group, a new shadcn component, a new color preset) rather than introducing a parallel convention.

---

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16** (App Router) | React Server Components by default; route guarding via `proxy.ts` (replaces `middleware.ts`). |
| Language | **TypeScript** (strict) | `@types/node`, `@types/react`, `@types/react-dom` pinned in devDependencies. |
| Styling | **Tailwind CSS v4** | CSS-variable theme in `app/globals.css`, no `tailwind.config.ts` — v4 is CSS-first. Multi-theme (7 color presets) — see [§6](#6-theming-multi-theme--providers). |
| UI kit | **shadcn/ui on Base UI** (`@base-ui/react`) | **Not Radix.** Component APIs differ — no `asChild`, polymorphism via the `render` prop (see [§5](#5-design--css-conventions)). |
| Icons | **lucide-react** v1.x | Generic icon set only — brand/logo icons (Github, Twitter, etc.) are not exported. |
| Env validation | **@t3-oss/env-nextjs** | `lib/env.ts` — typed, validated `process.env` access; fails fast at boot instead of deep in a request. See [§7](#7-environment-variables--validation). |
| Logging | **Custom colored logger** | `lib/logger.ts` — no external logging framework; `picocolors` for ANSI. See [§8](#8-logging). |
| Auth | **better-auth** | Server instance in `lib/auth.ts`, client instance in `lib/auth-client.ts`, session cache in Redis, React context in `providers/auth-provider.tsx`. |
| API layer | **tRPC v11** + `@trpc/tanstack-react-query` | End-to-end typed procedures; React Query under the hood. |
| ORM | **Prisma 7** | Driver adapters (`@prisma/adapter-pg`), config lives in `prisma.config.ts`, **no `datasource url` field in `schema.prisma`**. |
| Cache / sessions | **Redis** (`ioredis`) | Backs better-auth's `secondaryStorage` and general app caching (`lib/redis.ts`). |
| Object storage | **MinIO** | S3-compatible; `lib/minio.ts` wraps upload/presign/delete. |
| Local infra | **docker-compose** | Postgres + Redis + MinIO, regenerated per-module by `scripts/setup.ts`. See [§11](#11-docker-services). |
| Package manager | **Bun** (pnpm/npm supported as fallbacks via `scripts/setup.ts`) | Docs and scripts in this repo assume `bun`. |
| Scaffolding | **create-magic-app** (`create-magic-app/`) | `npx`-able CLI that clones this repo and hands off to `scripts/setup.ts`. See [§12](#12-module-selection--scaffolding). |

---

## 3. File structure

```
app/
  layout.tsx               # Root layout: <AppProviders> wraps everything, next/font vars — don't hand-nest providers here
  page.tsx                  # Public marketing/landing page
  globals.css                # Tailwind v4 theme tokens (oklch base + hsl color-theme presets), dark mode variant, base layer
  api/
    auth/[...all]/route.ts   # better-auth's catch-all handler (mounts every auth endpoint)
    trpc/[trpc]/route.ts     # tRPC HTTP handler (fetch adapter)
  (auth)/                   # Route group: /login, /register — unauthenticated-only pages
    login/page.tsx
    register/page.tsx
  (app)/                    # Route group: /dashboard, /settings — authenticated-only pages
    layout.tsx               # Dashboard shell: SidebarProvider + AppSidebar + SidebarInset
    dashboard/page.tsx
    settings/page.tsx

components/
  theme-switcher.tsx         # Combined light/dark/system + color-preset dropdown (mounted in site-header.tsx)
  ui/                        # shadcn/Base UI primitives — generated, treat as a library, avoid hand-editing
    button.tsx, input.tsx, sidebar.tsx, dropdown-menu.tsx, dialog.tsx, ...
  # composed, app-specific pieces (dashboard post list, auth forms, dashboard shell nav, etc.) live in
  # subfolders alongside ui/, e.g. components/auth/, components/dashboard/, components/layout/, components/settings/

providers/
  index.tsx                  # AppProviders — the single composition root mounted in app/layout.tsx
  theme-provider.tsx          # Light/dark/system mode (next-themes wrapper)
  color-theme-provider.tsx     # Accent color preset (data-theme attribute + localStorage + no-flash script)
  trpc-provider.tsx            # Barrel re-export of lib/trpc/client.tsx's TRPCReactProvider
  auth-provider.tsx            # Session React context (dedupes authClient.useSession() across the tree)

lib/
  env.ts                     # @t3-oss/env-nextjs — validated, typed env vars (see §7)
  logger.ts                  # Colored console logger (see §8)
  themes.ts                   # Color/mode preset metadata + the two DEFAULT_* constants scripts/setup.ts edits
  auth.ts                     # better-auth server instance (Prisma adapter + Redis secondaryStorage)
  auth-client.ts               # better-auth React client (authClient, signIn, signUp, signOut, useSession)
  db.ts                       # Prisma singleton (PrismaPg driver adapter)
  redis.ts                    # ioredis singleton + cacheGet/cacheSet/cacheDel helpers
  minio.ts                    # MinIO client singleton + uploadObject/getPresignedUrl/deleteObject
  utils.ts                    # cn() (clsx + tailwind-merge)
  trpc/
    init.ts                   # createTRPCContext, publicProcedure, protectedProcedure
    server.tsx                 # RSC helpers: trpc proxy, prefetch(), HydrateClient
    client.tsx                  # Client helpers: TRPCReactProvider, useTRPC
    query-client.ts             # makeQueryClient() shared by server.tsx and client.tsx
    routers/
      _app.ts                   # Root router — register every domain router here
      post.ts                   # Sample CRUD router (list/byId/create/delete) — delete once replaced

prisma/
  schema.prisma               # User/Session/Account/Verification (better-auth) + Post (sample model)
  seed.ts                     # bun run db:seed entry point
  migrations/                 # created by `prisma migrate dev`

scripts/
  setup.ts                    # `bun run setup` — interactive module + theme picker (see §12), also importable
                               # (its pure functions are `export`ed) for testing without triggering the CLI

create-magic-app/
  package.json                 # Standalone npm package (publishable separately as `create-magic-app`)
  bin/create-magic-app.mjs      # The actual npx-able CLI — clones this repo, hands off to scripts/setup.ts

proxy.ts                      # Route guard (Next.js 16's middleware.ts replacement) — see §4
prisma.config.ts              # Prisma 7 config: schema path, migrations, seed command, datasource url
components.json               # shadcn CLI config (aliases, style, base color)
docker-compose.yml             # postgres / redis / minio services — regenerated per-module by scripts/setup.ts
.env.example                  # template for .env — see §7
```

**Route groups**: `(auth)` and `(app)` are Next.js route groups — the parens are stripped from the URL, so `app/(auth)/login/page.tsx` serves `/login` and `app/(app)/dashboard/page.tsx` serves `/dashboard`. They exist purely to give each half of the app its own layout: `(auth)` gets a bare centered-card layout for sign-in/sign-up, `(app)` gets the sidebar dashboard shell. Auth **enforcement** is not done in these layouts — that's `proxy.ts`'s job (see [§4](#4-auth-rules)); a page under `(app)` can assume `auth.api.getSession()` will return a session because `proxy.ts` already redirected anonymous requests away.

**Adding a tRPC router**: create `lib/trpc/routers/<domain>.ts` exporting a `createTRPCRouter({...})`, then register it as a field on the router in `lib/trpc/routers/_app.ts`. See [§10](#10-trpc-conventions).

**UI primitives vs. composed components**: anything under `components/ui/` is a shadcn-generated primitive (installed via `bunx shadcn add <name>`) — treat it as a vendored library, don't hand-roll app logic into it. App-specific composed components live in `components/<domain>/` subfolders, built out of the `ui/` primitives.

**Adding a provider**: define it under `providers/`, then wire it into `providers/index.tsx`'s `<AppProviders>` composition (respect the ordering comment at the top of that file). If the provider is tied to an optional module (like `TRPCProvider`/`AuthProvider`), keep its JSX tag on its own line with no extra props, exactly matching the pattern those two use — `scripts/setup.ts`'s `unwrapJsxWrapper` surgically removes a provider's tag by exact-match-on-its-own-line when the backing module is dropped, and silently no-ops (leaving a dangling import) if the shape doesn't match.

---

<!-- MODULE:auth:start -->
## 4. Auth rules

- **Server instance** — `lib/auth.ts` exports `auth = betterAuth({...})`: Prisma adapter (`provider: "postgresql"`), Redis-backed `secondaryStorage` (session lookups skip Postgres — dropped automatically if you decline the `redis` module while keeping `auth`), email/password enabled (min length 8, `autoSignIn: true`), optional GitHub/Google OAuth (enabled only when their env vars are set), 30-day sessions with a 5-minute cookie cache, and the `nextCookies()` plugin so Server Actions/Route Handlers can set cookies. It also exports `type Session = typeof auth.$Infer.Session`.
- **Client instance** — `lib/auth-client.ts` exports `authClient = createAuthClient({ baseURL: env.NEXT_PUBLIC_APP_URL })` and re-exports `signIn`, `signUp`, `signOut`, `useSession`. Use `signIn`/`signUp`/`signOut` directly in Client Components for mutations; for **reading** the current session, prefer `useAuth()` from `providers/auth-provider.tsx` instead of calling `useSession()` yourself (see next bullet) — Server Components/Route Handlers should call `auth.api.*` from `lib/auth.ts` directly.
- **Session context** — `providers/auth-provider.tsx`'s `<AuthProvider>` (mounted once in `providers/index.tsx`) wraps `authClient.useSession()` in a React context, so every component reading the session in the same tree shares one subscription instead of each firing its own `/api/auth/get-session` request. Consume it with `useAuth()` → `{ session, isPending, refetch }`.
- **HTTP handler** — `app/api/auth/[...all]/route.ts` mounts every better-auth endpoint (sign-in, sign-up, OAuth callbacks, etc.) behind one catch-all route.
- **Session shape** — `Session["user"]` has `id`, `name`, `email`, `emailVerified`, `image` (plus whatever Prisma's `User` model defines — see [§9](#9-data-layer)).

**Usage**

```ts
// Client Component — reading the session
"use client";
import { useAuth } from "@/providers/auth-provider";

const { session, isPending } = useAuth(); // session?.user
```

```ts
// Client Component — signing in
"use client";
import { signIn } from "@/lib/auth-client";

await signIn.email({ email, password }, {
  onSuccess: () => router.push("/dashboard"),
  onError: (ctx) => toast.error(ctx.error.message),
});
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

Defined in `lib/trpc/init.ts` (only exists in this shape while `auth` is kept — see [§12](#12-module-selection--scaffolding) for what changes if you drop it):

- `publicProcedure` — no auth check, `ctx.session` may be `null`.
- `protectedProcedure` — wraps `publicProcedure` with a middleware that throws `TRPCError({ code: "UNAUTHORIZED" })` if `ctx.session?.user` is missing, and narrows `ctx.session` to non-null for the rest of the procedure chain. Use this for any mutation/query that reads or writes user-owned data (see `postRouter.create`/`postRouter.delete` in `lib/trpc/routers/post.ts` for the pattern — `ctx.session.user.id` is used directly, no extra null check needed).

### Redis-backed session cache

better-auth's `secondaryStorage` option (in `lib/auth.ts`) is wired to the `redis` singleton from `lib/redis.ts` (`get`/`set`/`delete`), so session reads/writes go to Redis instead of Postgres on the hot path. Combined with the 5-minute `cookieCache`, most requests avoid both a DB and a Redis round trip. This is why `proxy.ts` can afford to call `auth.api.getSession` on every matched request without a meaningful latency hit.
<!-- MODULE:auth:end -->

---

## 5. Design / CSS conventions

- **Theme tokens** — `app/globals.css` defines the neutral base palette as CSS variables in `oklch(...)` color space, split into `:root` (light) and `.dark` (dark) blocks, then re-exposed to Tailwind via `@theme inline` (e.g. `--color-primary: var(--primary)`). Includes standard shadcn tokens (`background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`, `chart-1..5`) **plus sidebar-specific tokens** (`--sidebar`, `--sidebar-foreground`, `--sidebar-primary`, `--sidebar-primary-foreground`, `--sidebar-accent`, `--sidebar-accent-foreground`, `--sidebar-border`, `--sidebar-ring`) consumed by `components/ui/sidebar.tsx`. Color-preset overrides on top of this base are covered in [§6](#6-theming-multi-theme--providers).
- **Radius scale** — one variable, `--radius: 0.625rem`, drives everything: `--radius-sm` = `radius * 0.6`, `-md` = `*0.8`, `-lg` = `radius` itself, `-xl` = `*1.4`, `-2xl` = `*1.8`, up to `-4xl`. Don't hardcode `rounded-[Npx]` — use the scale (`rounded-lg`, `rounded-xl`, ...).
- **Dark mode** — `next-themes` with the `class` strategy, configured in `providers/theme-provider.tsx` and `@custom-variant dark (&:is(.dark *))` in `globals.css`. Use Tailwind's `dark:` variant directly (e.g. `dark:border-input dark:bg-input/30`); never branch on theme in JS unless building a theme toggle itself.
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
- **`"use client"`** — only on components that need hooks, event handlers, or browser APIs (forms, `useAuth`, `useTRPC` mutations, anything interactive). Page-level composition (`app/**/page.tsx`) stays a Server Component unless it directly needs client state; push interactivity down into small client leaf components instead of marking whole pages `"use client"`.
- **Spacing/typography, observed in `app/page.tsx`**:
  - `text-balance` on headings/subheads that wrap to multiple lines (`h1`, intro `p`) for even line breaks.
  - Icon sizing via Tailwind's `size-*` utility, not `h-*`/`w-*` pairs (`className="size-3.5"`, `className="size-4"`); the button component itself defaults inline SVGs to `size-4` unless overridden.
  - Card-like content blocks use `rounded-xl border bg-card p-5`; the design-token radius scale reserves `rounded-lg` for form controls/buttons (per `button.tsx`'s own class list) and `rounded-xl`+ for larger surfaces.
  - Section rhythm: generous vertical gaps (`gap-16`, `py-16 md:py-24`) at the page level, tighter `gap-4`/`gap-6` inside a card grid.
  - Muted secondary text via `text-muted-foreground`, never a raw gray.

---

## 6. Theming (multi-theme + providers)

Two independent theme dimensions, each with its own provider and both driven by `lib/themes.ts`:

| Dimension | Provider | Storage | CSS mechanism |
|---|---|---|---|
| Light/dark/system **mode** | `providers/theme-provider.tsx` (wraps `next-themes`) | next-themes' own localStorage key | `.dark` class on `<html>` |
| Accent **color preset** (zinc/red/rose/orange/green/blue/violet) | `providers/color-theme-provider.tsx` | `localStorage["color-theme"]` (`COLOR_THEME_STORAGE_KEY`) | `data-theme="<id>"` attribute on `<html>` |

**`lib/themes.ts`** is the single source of truth for both: `COLOR_THEMES` (id/label/swatch per preset), `DEFAULT_COLOR_THEME`, `THEME_MODES`, `DEFAULT_THEME_MODE`. Add a new color preset by (1) adding a `[data-theme="foo"]` + `.dark[data-theme="foo"]` block to `app/globals.css` overriding `--primary`/`--ring`/`--sidebar-primary`/`--sidebar-primary-foreground`/`--sidebar-ring` (leave every other token alone — presets intentionally share one neutral base so only the accent color changes) and (2) adding one entry to `COLOR_THEMES`.

**Runtime switching** — `components/theme-switcher.tsx` is a single dropdown covering both dimensions (mounted in `components/layout/site-header.tsx`): `useTheme()` from `next-themes` for mode, `useColorTheme()` from `providers/color-theme-provider.tsx` for the color preset.

**Install-time default** — `bun run setup` / `npx create-magic-app` prompt "which color theme?" and "default appearance?", then regex-replace the two literal `DEFAULT_COLOR_THEME`/`DEFAULT_THEME_MODE` values in `lib/themes.ts`. This only changes what a first-time visitor sees before they touch anything — every preset and mode stays switchable at runtime regardless of the install-time choice.

**Flash-of-wrong-theme guard** — `ColorThemeProvider` inlines a tiny synchronous `<script>` (same trick `next-themes` itself uses) that reads `localStorage` and sets the `data-theme` attribute before React hydrates, so the very first paint already has the right accent color instead of flashing the default and then swapping. `next-themes` handles the equivalent guard for dark/light mode itself.

**Composition root** — `providers/index.tsx`'s `<AppProviders>` nests `ThemeProvider > ColorThemeProvider > TRPCProvider > AuthProvider > TooltipProvider`, mounted once in `app/layout.tsx`. See [§3](#3-file-structure)'s "Adding a provider" note for the contract `scripts/setup.ts` relies on to surgically remove `TRPCProvider`/`AuthProvider` when those modules are dropped.

---

## 7. Environment variables & validation

**Validation** — `lib/env.ts` wraps every environment variable in a `@t3-oss/env-nextjs` `createEnv({...})` schema (Zod under the hood). Import `env` from `@/lib/env` everywhere instead of touching `process.env` directly — a missing or malformed required var throws a readable error at boot instead of failing deep inside a request handler. `NEXT_PUBLIC_*` client vars must be listed in `experimental__runtimeEnv` individually (Next.js inlines them via static analysis at build time, so you can't loop over `process.env` dynamically). Set `SKIP_ENV_VALIDATION=1` to bypass validation (already auto-skipped during `next build`'s static-page collection and in `NODE_ENV=test`).

The only files that read raw `process.env` instead of `lib/env.ts` are `prisma.config.ts` (runs via the `prisma` CLI outside of Next.js entirely, so it can't import a Next-aware module) and `lib/trpc/client.tsx`'s `VERCEL_URL` check (a Vercel-platform-injected var, not part of this template's own env contract).

All variables live in `.env.example` at the repo root; copy it to `.env` and fill in (or let `bun run setup` do it for the modules you select — it regenerates `.env.example` to only include the vars for kept modules).

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
| `SKIP_ENV_VALIDATION` | Set to any truthy value to bypass `lib/env.ts`'s Zod validation (e.g. in a build step without real secrets yet). | core (optional) |

---

## 8. Logging

`lib/logger.ts` exports `logger` (and `logger.child("scope")` for a namespaced sub-logger): `logger.debug/info/warn/error/success(...)`, each printing a `HH:MM:SS.mmm`-timestamped, color-coded `[LEVEL]` tag via `picocolors`. `debug()` is silent unless `NODE_ENV !== "production"` or `LOG_LEVEL=debug` is set. This is intentionally a thin wrapper, not a structured-logging framework (pino/winston) — swap the implementation if you outgrow it; every call site only depends on the `Logger` shape it exports.

```ts
import { logger } from "@/lib/logger";

logger.info("Server started");
const authLog = logger.child("auth");
authLog.warn("Rate limit hit", { userId });
```

---

## 9. Data layer

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

**Driver adapter** — Prisma 7 no longer talks to the database directly; it requires a driver adapter. `lib/db.ts` constructs `new PrismaPg({ connectionString: env.DATABASE_URL })` from `@prisma/adapter-pg` and passes it to `new PrismaClient({ adapter })`. Correspondingly `prisma/schema.prisma`'s `datasource db` block has **no `url` field** — the connection string is supplied at runtime by the adapter (and, for the Prisma CLI itself, by `prisma.config.ts`'s own `datasource: { url: env("DATABASE_URL") }`), not by `schema.prisma`. This is a Prisma 7 requirement, not a stylistic choice — omitting the adapter throws at startup.

`lib/db.ts` also guards against Next.js dev-mode hot-reload spawning a new `PrismaClient`/connection pool per edit, by stashing the instance on `globalThis` outside of production.

---

<!-- MODULE:trpc:start -->
## 10. tRPC conventions

- **One router file per domain** under `lib/trpc/routers/` (e.g. `post.ts`, `user.ts`, `billing.ts`). Each exports `createTRPCRouter({ ... })` built from `publicProcedure` (and `protectedProcedure`, while `auth` is kept — see [§4](#4-auth-rules)) from `lib/trpc/init.ts`, with Zod schemas for input validation.
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
  import { PostList } from "@/components/dashboard/post-list"; // client component using useQuery

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

<!-- MODULE:docker:start -->
## 11. Docker services

`docker-compose.yml` is regenerated by `scripts/setup.ts` to include only the services your kept modules need (Postgres if `auth`/`trpc` is kept, Redis if `redis` is kept, MinIO if `minio` is kept) — this doc describes the full, all-modules-kept shape (project name `magic-app`):

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

## 12. Module selection & scaffolding

### `npx create-magic-app` (new project)

`create-magic-app/bin/create-magic-app.mjs` is a small, standalone CLI: prompts for a project name, `git clone --depth 1`s this template repo into that directory, strips the clone's own `.git`, runs your package manager's install, then spawns `<pm> run setup` with stdio inherited — so the interactive module/theme picker below runs right inside your new project, driven by you, not scripted by the CLI. Two invocation paths, same result:

```bash
npx github:Aksaykanthan/magic-app   # works today, no npm publish required
npx create-magic-app@latest                      # works once create-magic-app/ is `npm publish`ed
```

### `bun run setup` (new or existing checkout)

Runs `scripts/setup.ts`, a `@clack/prompts`-driven CLI. Its pure logic functions are all `export`ed specifically so they can be imported and driven from a test harness without triggering the interactive prompt flow — see the functions themselves for exact behavior; this section is a summary. Flow:

1. **Package manager** — bun/pnpm/npm (skippable via the `MAGIC_PM` env var, set automatically when `create-magic-app` spawns this script).
2. **Modules** — multiselect, all kept by default:
   - **auth** — better-auth, Redis-backed sessions, login/register pages, the `(app)`/`(auth)` route groups and everything that only exists to serve them (dashboard shell components, `providers/auth-provider.tsx`), `proxy.ts`'s guard logic, and the `AuthProvider` wrapper in `providers/index.tsx`. If `trpc` is kept while `auth` is dropped, `lib/trpc/init.ts` and `lib/trpc/routers/post.ts` are rewritten to a session-free shape (no `protectedProcedure`, no auth-gated mutations) instead of left with a dangling `@/lib/auth` import.
   - **trpc** — the tRPC layer (`lib/trpc/**`, `app/api/trpc/[trpc]/route.ts`, the `TRPCProvider` wrapper). If `auth` is kept while `trpc` is dropped, `app/(app)/dashboard/page.tsx` is rewritten to drop the sample post list instead of left importing a deleted module.
   - **redis** — `lib/redis.ts` and its docker-compose service. If `auth` is kept while `redis` is dropped, `lib/auth.ts`'s `secondaryStorage` block and its `redis` import are surgically stripped (session reads fall back to Postgres via the Prisma adapter).
   - **minio** — `lib/minio.ts` and its docker-compose service. Nothing else depends on it by default.
   - **docker** — `docker-compose.yml` itself; auto-implied if `redis` or `minio` is kept.
3. **Theme** — which color preset ships as the default, and default light/dark/system mode (see [§6](#6-theming-multi-theme--providers)). Both stay switchable at runtime regardless of this choice.
4. **Apply** — deletes the files for anything you declined, prunes the matching `package.json` dependencies, regenerates `.env.example` and `docker-compose.yml` to match, regex-replaces the theme defaults in `lib/themes.ts`, and strips the corresponding `<!-- MODULE:x:start/end -->` blocks (plus matching env-var table rows) out of this very file.
5. **Git** — removes `.git` and creates one fresh "Initial commit" (skip with `--no-git`).

Re-running is safe: every deletion/edit guards on `fs.existsSync`/content-diff first, so re-running after a partial run (or one that already dropped a module) never throws. `--dry-run` plans without writing anything.

---

## 13. Commands cheat-sheet

| Command | Description |
|---|---|
| `bun run setup` | Interactive module + theme picker (`scripts/setup.ts`). See [§12](#12-module-selection--scaffolding). |
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

---
## 14. Focused AI-agent skills

`AGENTS.md` is the canonical project overview. `skills/*.md` are deliberately
smaller, load-on-demand deep dives: read the one matching the task instead of
loading unrelated conventions. `bun run setup` lets the project owner retain
only the skills useful to this application; do not link to or depend on a skill
file that is absent after setup.

<!-- SKILL:better-auth:start -->
- [`skills/better-auth.md`](skills/better-auth.md) — Better Auth server/client
  boundaries, username and OAuth flows, Turnstile, mailer hooks, tRPC
  protection, and `proxy.ts` guards.
<!-- SKILL:better-auth:end -->
<!-- SKILL:shadcn-ui:start -->
- [`skills/shadcn-ui.md`](skills/shadcn-ui.md) — shadcn/ui on **Base UI** (not
  Radix), its `render` polymorphism API, sidebar composition, Lucide, and
  Sonner.
<!-- SKILL:shadcn-ui:end -->
<!-- SKILL:ui-design:start -->
- [`skills/ui-design.md`](skills/ui-design.md) — color-preset/mode theming,
  CSS tokens, radius scale, typography, spacing, and visual conventions.
<!-- SKILL:ui-design:end -->
<!-- SKILL:backend-conventions:start -->
- [`skills/backend-conventions.md`](skills/backend-conventions.md) — tRPC,
  Prisma, Redis, MinIO, logging, mailer, and validated environment access.
<!-- SKILL:backend-conventions:end -->
<!-- SKILL:frontend-conventions:start -->
- [`skills/frontend-conventions.md`](skills/frontend-conventions.md) — App
  Router route groups, provider composition, server/client boundaries, forms,
  and the dashboard shell.
<!-- SKILL:frontend-conventions:end -->
