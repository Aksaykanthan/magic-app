/**
 * `bun run setup` — interactive module + theme picker for this template.
 *
 * Run once, right after cloning (or automatically by `create-magic-app`,
 * which spawns this script with stdio inherited so the same prompts show up
 * for the end user). Walks through:
 *   1. package manager (bun/pnpm/npm) — skippable via MAGIC_PM env var
 *   2. which optional modules to keep (auth/trpc/redis/minio/docker)
 *   3. which color theme + default light/dark/system mode to ship with
 *   4. applies everything: deletes unused files, prunes package.json deps,
 *      regenerates .env.example / docker-compose.yml / AGENTS.md for the
 *      selection, sets the chosen theme as the default in lib/themes.ts
 *   5. re-initializes git with a single clean "Initial commit" (this repo's
 *      own template history is not meant to become your project's history)
 *
 * Safe to re-run: every step guards on `fs.existsSync` first, so re-running
 * after a partial run (or against a repo that already had a module removed)
 * never throws.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import {
  intro,
  outro,
  select,
  multiselect,
  confirm,
  spinner,
  cancel,
  isCancel,
  note,
  log,
} from "@clack/prompts";
import pc from "picocolors";
import { COLOR_THEMES, DEFAULT_COLOR_THEME, THEME_MODES, type ThemeMode } from "../lib/themes";

const ROOT = process.cwd();
const ARGV = process.argv.slice(2);
const DRY_RUN = ARGV.includes("--dry-run");
const NO_GIT = ARGV.includes("--no-git");

type PackageManager = "bun" | "pnpm" | "npm";
type ModuleId = "auth" | "trpc" | "redis" | "minio" | "docker";

// ---------------------------------------------------------------------------
// Small clack helpers
// ---------------------------------------------------------------------------

function checkCancel<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel("Setup cancelled — no files were changed.");
    process.exit(0);
  }
  return value;
}

function abort(message: string): never {
  cancel(message);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Package manager helpers
// ---------------------------------------------------------------------------

function execCmd(pm: PackageManager): string {
  if (pm === "bun") return "bunx";
  if (pm === "pnpm") return "pnpm dlx";
  return "npx";
}

// ---------------------------------------------------------------------------
// Filesystem helpers (dry-run aware)
// ---------------------------------------------------------------------------

/** Removes a file or directory (recursively) if it exists. Returns whether anything was removed. */
function removeIfExists(relPath: string, dryRun: boolean): boolean {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) return false;
  if (!dryRun) {
    fs.rmSync(abs, { recursive: true, force: true });
  }
  return true;
}

function removeAll(relPaths: string[], dryRun: boolean): string[] {
  const removed: string[] = [];
  for (const relPath of relPaths) {
    if (removeIfExists(relPath, dryRun)) removed.push(relPath);
  }
  return removed;
}

// ---------------------------------------------------------------------------
// package.json dependency pruning
// ---------------------------------------------------------------------------

interface PackageJson {
  [key: string]: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function removeDependencies(depNames: string[], dryRun: boolean): string[] {
  const pkgPath = path.join(ROOT, "package.json");
  if (!fs.existsSync(pkgPath) || depNames.length === 0) return [];

  const raw = fs.readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(raw) as PackageJson;
  const removed: string[] = [];

  if (pkg.dependencies) {
    for (const dep of depNames) {
      if (dep in pkg.dependencies) {
        delete pkg.dependencies[dep];
        removed.push(dep);
      }
    }
  }

  if (removed.length > 0 && !dryRun) {
    fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  }

  return removed;
}

// ---------------------------------------------------------------------------
// lib/auth.ts surgery — strip the Redis-backed secondaryStorage block when
// auth is kept but redis is dropped, so the file no longer imports lib/redis.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// providers/index.tsx surgery — unwrap a specific JSX provider tag (and drop
// its import) when the module backing it gets removed, so AppProviders
// keeps compiling instead of referencing a deleted file.
// ---------------------------------------------------------------------------

/**
 * Removes `<ComponentName>...</ComponentName>` from `source`, replacing it
 * with just its inner children (so everything that WAS inside keeps
 * rendering), and drops the matching `import { ComponentName } from "...";`
 * line. No-ops (returns `source` unchanged) if the exact opening tag
 * `<ComponentName>` (no extra props — see providers/index.tsx's contract
 * comment) isn't found, rather than guessing at a malformed edit.
 */
function unwrapJsxWrapper(source: string, componentName: string): string {
  // Only match the tag when it's ALONE on its own line (just indentation
  // before it, nothing but the tag after it) — this is how real JSX usage
  // looks, and it means a plain-English mention of "<TRPCProvider>" inside
  // a prose comment (like this file's own doc comment) can never be
  // mistaken for the real wrapper. We only ever delete the two tag LINES
  // themselves and leave every line in between byte-for-byte untouched —
  // deliberately not attempting to re-indent the now one-level-too-deep
  // inner content, since indentation has zero effect on JSX correctness
  // and a hand-crafted re-indent is exactly the kind of "clever" string
  // surgery that's easy to get subtly wrong (run `bun run lint` after
  // setup if you want it re-formatted).
  const openLinePattern = new RegExp(`^[ \\t]*<${componentName}>[ \\t]*\\n`, "m");
  const closeLinePattern = new RegExp(`^[ \\t]*</${componentName}>[ \\t]*\\n`, "m");

  const openMatch = openLinePattern.exec(source);
  if (!openMatch) return source;

  const afterOpen = source.slice(openMatch.index + openMatch[0].length);
  const closeMatch = closeLinePattern.exec(afterOpen);
  if (!closeMatch) return source; // no matching close on its own line — leave untouched

  const closeAbsoluteIndex = openMatch.index + openMatch[0].length + closeMatch.index;

  let updated =
    source.slice(0, openMatch.index) +
    source.slice(openMatch.index + openMatch[0].length, closeAbsoluteIndex) +
    source.slice(closeAbsoluteIndex + closeMatch[0].length);

  const importPattern = new RegExp(
    `^import\\s*\\{\\s*${componentName}\\s*\\}\\s*from\\s*["'][^"']+["'];\\n`,
    "m",
  );
  updated = updated.replace(importPattern, "");

  return updated;
}

/** Unwraps a provider tag out of providers/index.tsx. Returns true if the file was edited. */
function dropProviderWrapper(componentName: string, dryRun: boolean): boolean {
  const indexPath = path.join(ROOT, "providers/index.tsx");
  if (!fs.existsSync(indexPath)) return false;

  const original = fs.readFileSync(indexPath, "utf8");
  const updated = unwrapJsxWrapper(original, componentName);
  if (updated === original) return false;

  if (!dryRun) fs.writeFileSync(indexPath, updated, "utf8");
  return true;
}

// ---------------------------------------------------------------------------
// Dashboard page surgery — when trpc is dropped but auth is kept, the sample
// dashboard page (app/(app)/dashboard/page.tsx) can't keep importing the
// tRPC-backed PostList. Replace it with a trpc-free version instead of
// leaving a dangling import.
// ---------------------------------------------------------------------------

const DASHBOARD_PAGE_WITHOUT_TRPC = `import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, {session.user.name}.
        </p>
      </div>
      {/* trpc was removed by \`bun run setup\` — wire up your own data fetching here. */}
    </div>
  );
}
`;

/** Rewrites the dashboard page + removes its tRPC-backed post list. True if anything changed. */
function rewriteDashboardWithoutTrpc(dryRun: boolean): boolean {
  const pagePath = path.join(ROOT, "app/(app)/dashboard/page.tsx");
  if (!fs.existsSync(pagePath)) return false;

  if (!dryRun) {
    fs.writeFileSync(pagePath, DASHBOARD_PAGE_WITHOUT_TRPC, "utf8");
  }
  removeIfExists("components/dashboard/post-list.tsx", dryRun);
  return true;
}

// ---------------------------------------------------------------------------
// tRPC-without-auth surgery — trpc's context/protectedProcedure and the
// sample post router's create/delete mutations depend on a session that no
// longer exists once the `auth` module is dropped. Rewrite both files to a
// session-free shape instead of leaving a dangling `@/lib/auth` import.
// ---------------------------------------------------------------------------

const TRPC_INIT_WITHOUT_AUTH = `import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { prisma } from "@/lib/db";

/** tRPC request context — just the db handle (no session: the \`auth\` module was removed). */
export async function createTRPCContext(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for call-site compatibility with app/api/trpc/[trpc]/route.ts and lib/trpc/server.tsx
  _opts: { headers: Headers },
) {
  return { db: prisma };
}

const t = initTRPC
  .context<Awaited<ReturnType<typeof createTRPCContext>>>()
  .create({
    transformer: superjson,
    errorFormatter({ shape }) {
      return shape;
    },
  });

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;

/** Every procedure is public — re-add auth (\`bun run setup\`) to get protectedProcedure back. */
export const publicProcedure = t.procedure;
`;

const POST_ROUTER_WITHOUT_AUTH = `import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/lib/trpc/init";

/**
 * Sample router demonstrating the tRPC + Prisma + Zod pattern.
 * Delete once you have real routers to replace it with.
 *
 * The \`auth\` module was removed by \`bun run setup\`, so the original
 * create/delete mutations (which required a signed-in user as the post
 * author) were dropped along with it — re-add them once you have your own
 * notion of "current user" (or bring auth back).
 */
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
});
`;

/** Rewrites lib/trpc/init.ts + lib/trpc/routers/post.ts to drop the auth dependency. */
function rewriteTrpcWithoutAuth(dryRun: boolean): string[] {
  const edited: string[] = [];

  const initPath = path.join(ROOT, "lib/trpc/init.ts");
  if (fs.existsSync(initPath)) {
    if (!dryRun) fs.writeFileSync(initPath, TRPC_INIT_WITHOUT_AUTH, "utf8");
    edited.push("lib/trpc/init.ts");
  }

  const postRouterPath = path.join(ROOT, "lib/trpc/routers/post.ts");
  if (fs.existsSync(postRouterPath)) {
    if (!dryRun) fs.writeFileSync(postRouterPath, POST_ROUTER_WITHOUT_AUTH, "utf8");
    edited.push("lib/trpc/routers/post.ts");
  }

  return edited;
}

function stripSecondaryStorageBlock(source: string): string {
  const marker = /secondaryStorage\s*:\s*\{/;
  const match = marker.exec(source);
  if (!match) return source;

  // Include the property's own leading indentation so removing it doesn't
  // leave the next property double-indented.
  let start = match.index;
  while (start > 0 && (source[start - 1] === " " || source[start - 1] === "\t")) start--;

  const braceStart = source.indexOf("{", match.index);
  let depth = 0;
  let closeIndex = -1;
  for (let i = braceStart; i < source.length; i++) {
    const char = source[i];
    if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) {
        closeIndex = i;
        break;
      }
    }
  }
  if (closeIndex === -1) return source; // unbalanced braces — leave untouched

  let end = closeIndex + 1;
  if (source[end] === ",") end++;
  while (source[end] === " " || source[end] === "\t") end++;
  if (source[end] === "\n") end++;

  return source.slice(0, start) + source.slice(end);
}

/** Removes lib/auth.ts's dependency on lib/redis.ts. Returns true if the file was edited. */
function dropAuthRedisDependency(dryRun: boolean): boolean {
  const authPath = path.join(ROOT, "lib/auth.ts");
  if (!fs.existsSync(authPath)) return false;

  const original = fs.readFileSync(authPath, "utf8");
  let updated = original.replace(/^import\s*\{\s*redis\s*\}\s*from\s*["']@\/lib\/redis["'];\n/m, "");
  updated = stripSecondaryStorageBlock(updated);
  updated = updated.replace(
    / \* Session lookups are backed by Redis \(secondaryStorage\) so proxy\.ts can\n \* check auth on every request without hitting Postgres\.\n/,
    " * Session lookups hit Postgres directly (no secondaryStorage cache).\n",
  );
  updated = updated.replace(/skip a Redis round trip/, "skip a database round trip");

  if (updated === original) return false;
  if (!dryRun) {
    fs.writeFileSync(authPath, updated, "utf8");
  }
  return true;
}

// ---------------------------------------------------------------------------
// .env.example generation
// ---------------------------------------------------------------------------

export function buildEnvExample(opts: {
  keepAuth: boolean;
  keepDatabase: boolean;
  keepRedis: boolean;
  keepMinio: boolean;
  keepDockerCompose: boolean;
}): string {
  const lines: string[] = [
    "# ---------------------------------------------------------------------------",
    "# Validated by lib/env.ts (@t3-oss/env-nextjs) — the app fails fast at boot",
    "# if a required var is missing/malformed. Copy this file to .env and fill in",
    "# (bun run setup already did this for the modules you selected).",
    "# ---------------------------------------------------------------------------",
    "",
    "# App",
    'NEXT_PUBLIC_APP_URL="http://localhost:3000"',
  ];

  if (opts.keepDatabase) {
    lines.push(
      "",
      `# Postgres${opts.keepDockerCompose ? " (docker-compose service: postgres)" : ""}`,
      'DATABASE_URL="postgresql://postgres:postgres@localhost:5432/app?schema=public"',
    );
  }

  if (opts.keepAuth) {
    lines.push(
      "",
      "# better-auth",
      "# Generate with: bunx @better-auth/cli@latest secret",
      'BETTER_AUTH_SECRET="replace-with-a-32-byte-random-secret"',
      'BETTER_AUTH_URL="http://localhost:3000"',
    );
  }

  if (opts.keepRedis) {
    lines.push(
      "",
      `# Redis${opts.keepDockerCompose ? " (docker-compose service: redis)" : ""}`,
      'REDIS_URL="redis://localhost:6379"',
    );
  }

  if (opts.keepMinio) {
    lines.push(
      "",
      `# MinIO${opts.keepDockerCompose ? " (docker-compose service: minio)" : ""} — S3-compatible object storage`,
      'MINIO_ENDPOINT="localhost"',
      'MINIO_PORT="9000"',
      'MINIO_USE_SSL="false"',
      'MINIO_ACCESS_KEY="minioadmin"',
      'MINIO_SECRET_KEY="minioadmin"',
      'MINIO_BUCKET="app-uploads"',
    );
  }

  if (opts.keepAuth) {
    lines.push(
      "",
      "# Optional OAuth providers (leave blank to disable in lib/auth.ts)",
      'GITHUB_CLIENT_ID=""',
      'GITHUB_CLIENT_SECRET=""',
      'GOOGLE_CLIENT_ID=""',
      'GOOGLE_CLIENT_SECRET=""',
    );
  }

  lines.push("");
  return lines.join("\n");
}

function writeEnvExample(content: string, dryRun: boolean): void {
  if (dryRun) return;
  fs.writeFileSync(path.join(ROOT, ".env.example"), content, "utf8");
}

// ---------------------------------------------------------------------------
// docker-compose.yml generation — only the services the kept modules need,
// not an all-or-nothing file. Kept in sync by hand with docker-compose.yml's
// original shape (image tags, healthchecks, volumes) rather than templated
// from it, so this stays readable as plain YAML.
// ---------------------------------------------------------------------------

export function buildDockerCompose(opts: { keepDatabase: boolean; keepRedis: boolean; keepMinio: boolean }): string | null {
  if (!opts.keepDatabase && !opts.keepRedis && !opts.keepMinio) return null;

  const services: string[] = [];
  const volumes: string[] = [];

  if (opts.keepDatabase) {
    services.push(
      [
        "  postgres:",
        "    image: postgres:17-alpine",
        "    restart: unless-stopped",
        "    environment:",
        "      POSTGRES_USER: postgres",
        "      POSTGRES_PASSWORD: postgres",
        "      POSTGRES_DB: app",
        "    ports:",
        '      - "5432:5432"',
        "    volumes:",
        "      - postgres_data:/var/lib/postgresql/data",
        "    healthcheck:",
        '      test: ["CMD-SHELL", "pg_isready -U postgres -d app"]',
        "      interval: 5s",
        "      timeout: 5s",
        "      retries: 10",
      ].join("\n"),
    );
    volumes.push("  postgres_data:");
  }

  if (opts.keepRedis) {
    services.push(
      [
        "  redis:",
        "    image: redis:7-alpine",
        "    restart: unless-stopped",
        "    ports:",
        '      - "6379:6379"',
        "    volumes:",
        "      - redis_data:/data",
        "    healthcheck:",
        '      test: ["CMD", "redis-cli", "ping"]',
        "      interval: 5s",
        "      timeout: 5s",
        "      retries: 10",
      ].join("\n"),
    );
    volumes.push("  redis_data:");
  }

  if (opts.keepMinio) {
    services.push(
      [
        "  minio:",
        "    image: minio/minio:latest",
        "    restart: unless-stopped",
        '    command: server /data --console-address ":9001"',
        "    environment:",
        "      MINIO_ROOT_USER: minioadmin",
        "      MINIO_ROOT_PASSWORD: minioadmin",
        "    ports:",
        '      - "9000:9000" # S3 API',
        '      - "9001:9001" # Web console',
        "    volumes:",
        "      - minio_data:/data",
        "    healthcheck:",
        '      test: ["CMD", "mc", "ready", "local"]',
        "      interval: 5s",
        "      timeout: 5s",
        "      retries: 10",
      ].join("\n"),
    );
    volumes.push("  minio_data:");
  }

  return [
    "name: magic-nextjs-template",
    "",
    "services:",
    services.join("\n\n"),
    "",
    "volumes:",
    volumes.join("\n"),
    "",
  ].join("\n");
}

function writeDockerCompose(content: string | null, dryRun: boolean): "written" | "removed" | "unchanged" {
  const composePath = path.join(ROOT, "docker-compose.yml");
  const existed = fs.existsSync(composePath);

  if (content === null) {
    if (!existed) return "unchanged";
    if (!dryRun) fs.rmSync(composePath, { force: true });
    return "removed";
  }

  if (!dryRun) fs.writeFileSync(composePath, content, "utf8");
  return "written";
}

// ---------------------------------------------------------------------------
// AGENTS.md — strip <!-- MODULE:x:start/end --> blocks for dropped modules,
// and drop env-var table rows whose trailing "| module |" column names a
// dropped module. Headings/TOC numbers are intentionally left as-is (a
// generated doc with a gap in "§4, §5, §7" is a fine trade for not having to
// re-derive a table of contents).
// ---------------------------------------------------------------------------

function stripAgentsMdModuleBlock(source: string, moduleId: ModuleId): string {
  const start = `<!-- MODULE:${moduleId}:start -->`;
  const end = `<!-- MODULE:${moduleId}:end -->`;
  const startIndex = source.indexOf(start);
  if (startIndex === -1) return source;
  const endIndex = source.indexOf(end);
  if (endIndex === -1) return source;

  let sliceEnd = endIndex + end.length;
  // Swallow one trailing blank line so we don't leave a double gap.
  if (source[sliceEnd] === "\n") sliceEnd++;

  return source.slice(0, startIndex) + source.slice(sliceEnd);
}

function stripAgentsMdEnvRows(source: string, droppedModules: Set<ModuleId>): string {
  if (droppedModules.size === 0) return source;
  const lines = source.split("\n");
  const kept = lines.filter((line) => {
    if (!line.startsWith("| `")) return true; // not an env-var table row
    for (const moduleId of droppedModules) {
      // Matches the trailing "| ... module_name |" / "| ... module_name (...) |" cell.
      const cellPattern = new RegExp(`\\|\\s*${moduleId}\\b[^|]*\\|\\s*$`);
      if (cellPattern.test(line)) return false;
    }
    return true;
  });
  return kept.join("\n");
}

/** Collapses any run of `---` separators (with only blank lines between them) into one. */
function collapseDuplicateSeparators(source: string): string {
  return source.replace(/(?:^|\n)---(?:\n+---)+/g, "\n---");
}

export function updateAgentsMd(
  modules: Set<ModuleId>,
  colorThemeId: string,
  mode: ThemeMode,
  dryRun: boolean,
): boolean {
  const agentsPath = path.join(ROOT, "AGENTS.md");
  if (!fs.existsSync(agentsPath)) return false;

  let content = fs.readFileSync(agentsPath, "utf8");
  const original = content;

  const droppedModules = new Set<ModuleId>();
  for (const moduleId of ["auth", "trpc", "docker"] as const) {
    if (!modules.has(moduleId)) {
      content = stripAgentsMdModuleBlock(content, moduleId);
      droppedModules.add(moduleId);
    }
  }
  for (const moduleId of ["redis", "minio"] as const) {
    if (!modules.has(moduleId)) droppedModules.add(moduleId);
  }

  content = stripAgentsMdEnvRows(content, droppedModules);
  content = collapseDuplicateSeparators(content);

  // Record what was chosen so the doc doesn't go stale the moment setup runs.
  const banner =
    `> **Generated by \`bun run setup\`** — modules: ${
      modules.size > 0 ? [...modules].sort().join(", ") : "(none)"
    }. Theme: ${colorThemeId} / ${mode}. Sections for modules you declined were removed from this file.\n\n`;
  if (!content.startsWith("> **Generated by")) {
    const headingEnd = content.indexOf("\n\n", content.indexOf("# AGENTS.md"));
    if (headingEnd !== -1) {
      content = content.slice(0, headingEnd + 2) + banner + content.slice(headingEnd + 2);
    }
  }

  if (content === original) return false;
  if (!dryRun) fs.writeFileSync(agentsPath, content, "utf8");
  return true;
}

// ---------------------------------------------------------------------------
// Theme application — regex-replace the two literal defaults in lib/themes.ts
// ---------------------------------------------------------------------------

export function applyThemeSelection(colorThemeId: string, mode: ThemeMode, dryRun: boolean): boolean {
  const themesPath = path.join(ROOT, "lib/themes.ts");
  if (!fs.existsSync(themesPath)) return false;

  const original = fs.readFileSync(themesPath, "utf8");
  let updated = original.replace(
    /export const DEFAULT_COLOR_THEME = ".*?";/,
    `export const DEFAULT_COLOR_THEME = "${colorThemeId}";`,
  );
  updated = updated.replace(
    /export const DEFAULT_THEME_MODE: ThemeMode = ".*?";/,
    `export const DEFAULT_THEME_MODE: ThemeMode = "${mode}";`,
  );

  if (updated === original) return false;
  if (!dryRun) fs.writeFileSync(themesPath, updated, "utf8");
  return true;
}

// ---------------------------------------------------------------------------
// Fresh git history — this repo's template commits aren't your project's
// history. Best-effort: missing git binary or an already-clean repo just
// produces a note, never a crash.
// ---------------------------------------------------------------------------

export function reinitGit(dryRun: boolean): "reinitialized" | "skipped" | "failed" {
  if (dryRun || NO_GIT) return "skipped";
  try {
    execSync("git --version", { stdio: "ignore" });
  } catch {
    return "failed";
  }
  try {
    fs.rmSync(path.join(ROOT, ".git"), { recursive: true, force: true });
    execSync("git init", { cwd: ROOT, stdio: "ignore" });
    execSync("git add -A", { cwd: ROOT, stdio: "ignore" });
    execSync('git commit -m "Initial commit from magic-nextjs-template"', { cwd: ROOT, stdio: "ignore" });
    return "reinitialized";
  } catch {
    return "failed";
  }
}

// ---------------------------------------------------------------------------
// Module metadata
// ---------------------------------------------------------------------------

const MODULE_OPTIONS: { value: ModuleId; label: string; hint: string }[] = [
  {
    value: "auth",
    label: "auth",
    hint: "better-auth (email/password + OAuth), Redis-backed sessions, login/register pages, proxy.ts route guard",
  },
  {
    value: "trpc",
    label: "trpc",
    hint: "tRPC + Prisma sample router/pages wiring",
  },
  {
    value: "redis",
    label: "redis",
    hint: "Redis client + docker-compose service",
  },
  {
    value: "minio",
    label: "minio",
    hint: "MinIO client + docker-compose service",
  },
  {
    value: "docker",
    label: "docker",
    hint: "docker-compose.yml (postgres/redis/minio) — auto-implied if redis or minio is selected",
  },
];

// Everything below exists solely to serve the app/(app) dashboard shell —
// when auth goes, the route group that mounts them goes too, so they'd
// otherwise become orphaned files with dangling imports (tsc would still
// pass, since nothing *else* imports them, but they're 100% dead code).
const AUTH_PATHS = [
  "app/(auth)",
  "app/(app)",
  "app/api/auth",
  "lib/auth.ts",
  "lib/auth-client.ts",
  "proxy.ts",
  "components/auth",
  "components/layout/user-nav.tsx",
  "components/layout/app-sidebar.tsx",
  "components/layout/site-header.tsx",
  "components/dashboard",
  "components/settings",
  "providers/auth-provider.tsx",
];

// components/dashboard/post-list.tsx is only ever removed via AUTH_PATHS
// above (it dies with the whole dashboard shell) OR, if auth is kept but
// trpc alone is dropped, by rewriteDashboardWithoutTrpc() below — never by
// a plain path removal, since app/(app)/dashboard/page.tsx needs a
// replacement written in that second case, not just a deletion.
const TRPC_PATHS = ["lib/trpc", "app/api/trpc", "providers/trpc-provider.tsx"];
const REDIS_PATHS = ["lib/redis.ts"];
const MINIO_PATHS = ["lib/minio.ts"];

const DEP_REMOVALS: Record<Exclude<ModuleId, "docker">, string[]> = {
  auth: ["better-auth"],
  trpc: ["@trpc/server", "@trpc/client", "@trpc/tanstack-react-query", "@tanstack/react-query", "superjson"],
  redis: ["ioredis"],
  minio: ["minio"],
};

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

interface ApplyResult {
  removedPaths: string[];
  editedFiles: string[];
  removedDeps: string[];
  notes: string[];
  dockerCompose: "written" | "removed" | "unchanged";
}

export function applySelection(
  modules: Set<ModuleId>,
  colorThemeId: string,
  mode: ThemeMode,
  dryRun: boolean,
): ApplyResult {
  const keepAuth = modules.has("auth");
  const keepTrpc = modules.has("trpc");
  const keepRedis = modules.has("redis");
  const keepMinio = modules.has("minio");
  const keepDockerCompose = modules.has("docker") || keepRedis || keepMinio;
  const keepDatabase = keepAuth || keepTrpc;

  const removedPaths: string[] = [];
  const editedFiles: string[] = [];
  const removedDeps: string[] = [];
  const notes: string[] = [];

  if (!keepAuth) {
    removedPaths.push(...removeAll(AUTH_PATHS, dryRun));
    removedDeps.push(...removeDependencies(DEP_REMOVALS.auth, dryRun));
    const unwrapped = dropProviderWrapper("AuthProvider", dryRun);
    if (unwrapped) editedFiles.push("providers/index.tsx");
    notes.push(
      "auth was removed, but prisma/schema.prisma still defines the better-auth models " +
        "(User, Session, Account, Verification) and Post.author references User. Edit the " +
        "schema by hand if you don't need them — this script intentionally leaves it alone.",
    );
    if (keepTrpc) {
      const trpcEdited = rewriteTrpcWithoutAuth(dryRun);
      editedFiles.push(...trpcEdited);
      if (trpcEdited.length > 0) {
        notes.push(
          "auth was removed but trpc was kept — lib/trpc/init.ts's context and " +
            "protectedProcedure depended on a session, so this script rewrote it to a " +
            "session-free context (publicProcedure only) and rewrote the sample post router " +
            "to drop its auth-gated create/delete mutations. Re-add them once you have your " +
            "own notion of \"current user\".",
        );
      }
    }
  }

  if (!keepTrpc) {
    removedPaths.push(...removeAll(TRPC_PATHS, dryRun));
    removedDeps.push(...removeDependencies(DEP_REMOVALS.trpc, dryRun));
    const unwrapped = dropProviderWrapper("TRPCProvider", dryRun);
    if (unwrapped) editedFiles.push("providers/index.tsx");
    if (keepAuth) {
      const rewrote = rewriteDashboardWithoutTrpc(dryRun);
      if (rewrote) {
        editedFiles.push("app/(app)/dashboard/page.tsx");
        removedPaths.push("components/dashboard/post-list.tsx");
        notes.push(
          "trpc was removed but auth was kept — app/(app)/dashboard/page.tsx was rewritten to " +
            "drop the sample tRPC post list (it just shows the session greeting now); wire up " +
            "your own data fetching where the removed <PostList /> used to be.",
        );
      }
    }
  }

  if (!keepRedis) {
    removedPaths.push(...removeAll(REDIS_PATHS, dryRun));
    removedDeps.push(...removeDependencies(DEP_REMOVALS.redis, dryRun));
    if (keepAuth) {
      const edited = dropAuthRedisDependency(dryRun);
      if (edited) editedFiles.push("lib/auth.ts");
      notes.push(
        "redis was removed but auth was kept — lib/auth.ts's secondaryStorage block depended " +
          "on lib/redis.ts, so this script automatically stripped the secondaryStorage config " +
          "and the redis import. better-auth now reads sessions straight from Postgres via the " +
          "Prisma adapter. Double check lib/auth.ts still looks right.",
      );
    }
  }

  if (!keepMinio) {
    removedPaths.push(...removeAll(MINIO_PATHS, dryRun));
    removedDeps.push(...removeDependencies(DEP_REMOVALS.minio, dryRun));
  }

  if (!keepAuth && !keepTrpc) {
    notes.push(
      "Neither auth nor trpc was kept, so DATABASE_URL was dropped from .env.example. Prisma " +
        "itself (prisma/, @prisma/client, @prisma/adapter-pg, pg) is left installed — remove it " +
        "by hand if you don't plan to talk to Postgres directly.",
    );
  }

  const envContent = buildEnvExample({ keepAuth, keepDatabase, keepRedis, keepMinio, keepDockerCompose });
  writeEnvExample(envContent, dryRun);
  editedFiles.push(".env.example");

  const dockerComposeContent = keepDockerCompose
    ? buildDockerCompose({ keepDatabase, keepRedis, keepMinio })
    : null;
  const dockerCompose = writeDockerCompose(dockerComposeContent, dryRun);
  if (dockerCompose !== "unchanged") editedFiles.push("docker-compose.yml");

  const themeApplied = applyThemeSelection(colorThemeId, mode, dryRun);
  if (themeApplied) editedFiles.push("lib/themes.ts");

  const agentsMdUpdated = updateAgentsMd(modules, colorThemeId, mode, dryRun);
  if (agentsMdUpdated) editedFiles.push("AGENTS.md");

  return { removedPaths, editedFiles, removedDeps, notes, dockerCompose };
}

// ---------------------------------------------------------------------------
// Next steps
// ---------------------------------------------------------------------------

function buildNextSteps(pm: PackageManager, modules: Set<ModuleId>): string[] {
  const keepAuth = modules.has("auth");
  const keepTrpc = modules.has("trpc");
  const keepRedis = modules.has("redis");
  const keepMinio = modules.has("minio");
  const keepDockerCompose = modules.has("docker") || keepRedis || keepMinio;

  const steps: string[] = [pm === "npm" ? "npm install" : `${pm} install`, "cp .env.example .env"];

  if (keepAuth) {
    steps.push(`${execCmd(pm)} @better-auth/cli@latest secret   # fill BETTER_AUTH_SECRET in .env`);
  }
  if (keepDockerCompose) {
    steps.push("docker compose up -d");
  }
  if (keepTrpc || keepAuth) {
    steps.push(`${execCmd(pm)} prisma generate && ${execCmd(pm)} prisma db push`);
  }
  steps.push(pm === "pnpm" ? "pnpm dev" : `${pm} run dev`);

  return steps;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  intro(pc.bgCyan(pc.black(" Magic Next.js Template setup ")));

  if (DRY_RUN) {
    log.info(pc.dim("Running with --dry-run — no files will be changed."));
  }

  // `create-magic-app` runs the initial `pm install` itself (needed to get
  // tsx available before this script can even run) and already knows which
  // package manager the user picked — MAGIC_PM lets it skip re-asking here.
  const envPm = process.env.MAGIC_PM;
  const pm =
    envPm === "bun" || envPm === "pnpm" || envPm === "npm"
      ? envPm
      : checkCancel(
          await select<PackageManager>({
            message: "Which package manager will you use?",
            options: [
              { value: "bun", label: "bun", hint: "recommended" },
              { value: "pnpm", label: "pnpm" },
              { value: "npm", label: "npm" },
            ],
            initialValue: "bun",
          }),
        );

  const selectedModules = checkCancel(
    await multiselect<ModuleId>({
      message: "Which optional modules do you want to keep?",
      options: MODULE_OPTIONS,
      initialValues: MODULE_OPTIONS.map((option) => option.value),
      required: false,
    }),
  );

  const modules = new Set<ModuleId>(selectedModules);
  const keepDockerImplied =
    !modules.has("docker") && (modules.has("redis") || modules.has("minio"));
  if (keepDockerImplied) modules.add("docker");

  const colorThemeId = checkCancel(
    await select<string>({
      message: "Which color theme should ship as the default?",
      options: COLOR_THEMES.map((theme) => ({
        value: theme.id,
        label: theme.label,
        hint: theme.id === DEFAULT_COLOR_THEME ? "default" : undefined,
      })),
      initialValue: DEFAULT_COLOR_THEME,
    }),
  );

  const mode = checkCancel(
    await select<ThemeMode>({
      message: "Default appearance?",
      options: THEME_MODES.map((m) => ({ value: m, label: m })),
      initialValue: "system" as ThemeMode,
    }),
  );

  note(
    "Every preset (and light/dark/system) stays switchable at runtime via the theme switcher in " +
      "the dashboard header — this only picks what a first-time visitor sees before they touch it.",
    "About theming",
  );

  const summaryLines = [
    `Package manager: ${pc.cyan(pm)}`,
    `Modules: ${
      modules.size > 0
        ? [...modules]
            .sort()
            .map((m) => pc.cyan(m))
            .join(", ")
        : pc.dim("(none — bare Next.js + Tailwind + shadcn/ui base)")
    }`,
    `Theme: ${pc.cyan(colorThemeId)} / ${pc.cyan(mode)}`,
  ];
  note(summaryLines.join("\n"), "Summary");

  const proceed = checkCancel(
    await confirm({
      message: DRY_RUN
        ? "Proceed? (--dry-run: nothing will actually be written)"
        : "Proceed? This deletes files for every module you did not select and re-initializes git.",
    }),
  );
  if (!proceed) abort("Setup cancelled — no files were changed.");

  const s = spinner();
  s.start(DRY_RUN ? "Planning changes..." : "Applying your selection...");
  const result = applySelection(modules, colorThemeId, mode, DRY_RUN);
  s.stop(DRY_RUN ? "Plan complete." : "Selection applied.");

  const actionLines: string[] = [];
  if (result.removedPaths.length > 0) {
    actionLines.push(
      `${DRY_RUN ? "Would remove" : "Removed"}:\n${result.removedPaths.map((p) => `  - ${p}`).join("\n")}`,
    );
  }
  if (result.removedDeps.length > 0) {
    actionLines.push(
      `${DRY_RUN ? "Would drop dependencies" : "Dropped dependencies"}: ${result.removedDeps.join(", ")}`,
    );
  }
  if (result.editedFiles.length > 0) {
    actionLines.push(
      `${DRY_RUN ? "Would rewrite" : "Rewrote"}: ${[...new Set(result.editedFiles)].join(", ")}`,
    );
  }
  if (actionLines.length > 0) {
    note(actionLines.join("\n\n"), "Changes");
  } else {
    note("Every module was kept — nothing to remove.", "Changes");
  }

  if (result.notes.length > 0) {
    note(result.notes.join("\n\n"), "Follow-up");
  }

  const gitResult = reinitGit(DRY_RUN);
  if (gitResult === "reinitialized") {
    note("Removed the template's git history and created a fresh \"Initial commit\".", "Git");
  } else if (gitResult === "failed") {
    note("Could not re-initialize git (no git binary, or a git command failed) — left .git as-is.", "Git");
  }

  const steps = buildNextSteps(pm, modules);
  note(steps.map((step, i) => `${i + 1}. ${step}`).join("\n"), "Next steps");

  outro(pc.green(DRY_RUN ? "Dry run complete — no files were changed." : "Setup complete. Happy shipping!"));
}

// Guarded so this module can be imported (e.g. by a test harness that drives
// applySelection()/buildDockerCompose()/etc. directly) without also
// triggering the interactive prompt flow.
const isDirectlyExecuted =
  process.argv[1] !== undefined &&
  import.meta.url === `file://${path.resolve(process.argv[1])}`;

if (isDirectlyExecuted) {
  main().catch((error: unknown) => {
    log.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exit(1);
  });
}
