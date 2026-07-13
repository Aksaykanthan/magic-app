# create-magic-app

Scaffolds a new project from [magic-app](https://github.com/Aksaykanthan/magic-app) — a modular Next.js 16 starter with auth, tRPC, Prisma, Redis, MinIO, shadcn/ui on Base UI, and a multi-theme design system, all select-your-modules at install time.

## Usage

```bash
# works today — no npm publish required
npx github:Aksaykanthan/magic-app

# works once this package is published to npm from this directory
npx create-magic-app@latest
```

Either command:

1. Prompts for a project name.
2. Clones the template (fresh `git clone --depth 1`, its own `.git` stripped).
3. Installs dependencies with an auto-detected package manager (`bun` → `pnpm` → `npm`, whichever is found first on `PATH`).
4. Hands off to the template's own `scripts/setup.ts` — the same interactive picker you'd get running `bun run setup` by hand: package manager, which modules to keep (auth/tRPC/Redis/MinIO/Docker), default color theme, default light/dark/system mode.
5. `scripts/setup.ts` re-initializes git with one clean "Initial commit" once it's done.

See the template's own [AGENTS.md](../AGENTS.md) for everything about what gets scaffolded and how the module picker works.

## Publishing this package

This directory is a standalone npm package (`create-magic-app`), independent of the Next.js app one level up. To publish it so `npx create-magic-app@latest` resolves from the npm registry:

```bash
cd create-magic-app
npm publish --access public
```

The CLI itself (`bin/create-magic-app.mjs`) always `git clone`s the template fresh from GitHub regardless of how it was invoked, so publishing doesn't require bundling the template — only this small script and its two dependencies (`@clack/prompts`, `picocolors`).

## Local development

```bash
node bin/create-magic-app.mjs
```
