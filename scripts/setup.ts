import * as fs from "node:fs";
import * as path from "node:path";
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

const ROOT = process.cwd();
const DRY_RUN = process.argv.slice(2).includes("--dry-run");

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

function buildEnvExample(opts: {
  keepAuth: boolean;
  keepDatabase: boolean;
  keepRedis: boolean;
  keepMinio: boolean;
  keepDockerCompose: boolean;
}): string {
  const lines: string[] = [
    "# ---------------------------------------------------------------------------",
    "# Copy to .env and fill in. `bun run setup` writes this automatically based",
    "# on the modules you select.",
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

const AUTH_PATHS = [
  "app/(auth)",
  "app/(app)",
  "app/api/auth",
  "lib/auth.ts",
  "lib/auth-client.ts",
  "proxy.ts",
  "components/auth",
  "components/layout/user-nav.tsx",
];

const TRPC_PATHS = ["lib/trpc", "app/api/trpc"];
const REDIS_PATHS = ["lib/redis.ts"];
const MINIO_PATHS = ["lib/minio.ts"];
const DOCKER_PATHS = ["docker-compose.yml"];

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
}

function applySelection(modules: Set<ModuleId>, dryRun: boolean): ApplyResult {
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
    notes.push(
      "auth was removed, but prisma/schema.prisma still defines the better-auth models " +
        "(User, Session, Account, Verification) and Post.author references User. Edit the " +
        "schema by hand if you don't need them — this script intentionally leaves it alone.",
    );
  }

  if (!keepTrpc) {
    removedPaths.push(...removeAll(TRPC_PATHS, dryRun));
    removedDeps.push(...removeDependencies(DEP_REMOVALS.trpc, dryRun));
    if (keepAuth) {
      notes.push(
        "trpc was removed but auth was kept — the dashboard page under app/(app)/ still " +
          "imports the sample post list from lib/trpc. Replace that data fetching with your " +
          "own API/DB calls.",
      );
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

  if (!keepDockerCompose) {
    removedPaths.push(...removeAll(DOCKER_PATHS, dryRun));
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

  return { removedPaths, editedFiles, removedDeps, notes };
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

  const pm = checkCancel(
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
  ];
  note(summaryLines.join("\n"), "Summary");

  const proceed = checkCancel(
    await confirm({
      message: DRY_RUN
        ? "Proceed? (--dry-run: nothing will actually be written)"
        : "Proceed? This deletes files for every module you did not select.",
    }),
  );
  if (!proceed) abort("Setup cancelled — no files were changed.");

  const s = spinner();
  s.start(DRY_RUN ? "Planning changes..." : "Applying your selection...");
  const result = applySelection(modules, DRY_RUN);
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

  const steps = buildNextSteps(pm, modules);
  note(steps.map((step, i) => `${i + 1}. ${step}`).join("\n"), "Next steps");

  outro(pc.green(DRY_RUN ? "Dry run complete — no files were changed." : "Setup complete. Happy shipping!"));
}

main().catch((error: unknown) => {
  log.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
