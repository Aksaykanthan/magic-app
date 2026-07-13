# magic-nextjs-template

A modular Next.js 16 starter — pick the modules you need, get everything else pre-wired.

**Stack**: Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui on Base UI · lucide-react · better-auth · tRPC v11 · Prisma 7 · Redis · MinIO · docker-compose · multi-theme design system.

See **[AGENTS.md](./AGENTS.md)** for the full architecture, conventions, and module-selection docs — read it before making changes, whether you're a human or an AI agent.

## Quick start

```bash
# scaffold a new project from this template
npx github:Aksaykanthan/magic-nextjs-template

# already have a checkout? pick your modules in place
bun run setup

# then
cp .env.example .env        # fill in secrets
docker compose up -d        # postgres/redis/minio, if you kept them
bunx prisma generate && bunx prisma db push
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

## What you get

- **Auth** — better-auth (email/password + optional GitHub/Google OAuth), Redis-backed sessions, login/register pages, route protection via `proxy.ts`.
- **API layer** — tRPC v11 end-to-end typed procedures, wired to Prisma.
- **Database** — Prisma 7 with the Postgres driver adapter.
- **Cache & storage** — Redis (`ioredis`) and MinIO (S3-compatible object storage).
- **UI** — shadcn/ui on Base UI (not Radix), lucide icons, a dashboard shell (sidebar + header), auth forms.
- **Theming** — 7 color presets + light/dark/system mode, switchable at runtime, selectable as the install-time default.
- **Env validation** — `@t3-oss/env-nextjs`, fails fast on a missing/malformed variable.
- **Local infra** — `docker-compose.yml` for postgres/redis/minio.
- **Everything above is optional** — `bun run setup` (or `npx create-magic-app`) lets you drop any of it and rewrites the docs/config to match.

## Learn more

- [AGENTS.md](./AGENTS.md) — architecture, conventions, module selection.
- [create-magic-app/README.md](./create-magic-app/README.md) — the scaffolding CLI.
