#!/usr/bin/env node
/**
 * create-magic-app — scaffolds a new project from magic-nextjs-template.
 *
 * Two ways this gets run today (both work identically, both end up here):
 *   npx github:Aksaykanthan/magic-nextjs-template      (works right now, no npm publish needed)
 *   npx create-magic-app@latest                        (works once this package is `npm publish`ed
 *                                                        from the create-magic-app/ directory)
 *
 * What it does:
 *   1. Prompts for a project name (also the target directory).
 *   2. `git clone --depth 1` the template repo into that directory (fresh
 *      clone every time — even when invoked via `npx github:...`, which
 *      already has its own cached copy — so behavior is identical either
 *      way and there's no fragile "am I already inside the template?"
 *      self-detection).
 *   3. Removes the clone's own .git (its history is the template's, not
 *      yours) — the real, single "Initial commit" gets created by
 *      scripts/setup.ts's own git-reinit step in the next stage.
 *   4. Runs the target's own package manager install (needed before
 *      `scripts/setup.ts` can run — it depends on tsx/@clack/prompts).
 *   5. Spawns `<pm> run setup` INSIDE the new project with stdio inherited,
 *      so the same interactive module + theme prompts you'd see running
 *      `bun run setup` by hand show up here too — this script does not
 *      duplicate that prompt flow, it just gets you to the point where it
 *      can run. MAGIC_PM is set first so scripts/setup.ts skips asking for
 *      the package manager a second time.
 */
import { existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  intro,
  outro,
  text,
  confirm,
  spinner,
  cancel,
  isCancel,
  log,
} from "@clack/prompts";
import pc from "picocolors";

const TEMPLATE_REPO = "https://github.com/Aksaykanthan/magic-nextjs-template.git";

function checkCancel(value) {
  if (isCancel(value)) {
    cancel("Cancelled — nothing was created.");
    process.exit(0);
  }
  return value;
}

function commandExists(cmd) {
  const result = spawnSync(cmd, ["--version"], { stdio: "ignore" });
  return result.status === 0;
}

function detectDefaultPm() {
  if (commandExists("bun")) return "bun";
  if (commandExists("pnpm")) return "pnpm";
  return "npm";
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} exited with code ${result.status}`);
  }
}

async function main() {
  intro(pc.bgMagenta(pc.black(" create-magic-app ")));

  const rawName = checkCancel(
    await text({
      message: "Project name?",
      placeholder: "my-app",
      validate: (value) => {
        if (!value || value.trim().length === 0) return "Required.";
        if (!/^[a-z0-9._-]+$/i.test(value.trim())) {
          return "Use letters, numbers, dots, dashes, or underscores only.";
        }
        return undefined;
      },
    }),
  );

  const projectName = rawName.trim();
  const targetDir = path.resolve(process.cwd(), projectName);

  if (existsSync(targetDir)) {
    log.error(`"${projectName}" already exists at ${targetDir}.`);
    process.exit(1);
  }

  if (!commandExists("git")) {
    log.error("git is required (used to clone the template and to re-initialize your project's history).");
    process.exit(1);
  }

  const pm = detectDefaultPm();
  log.info(`Using ${pc.cyan(pm)} (auto-detected — override by installing your preferred package manager first).`);

  const proceed = checkCancel(
    await confirm({
      message: `Create "${projectName}" from ${pc.dim(TEMPLATE_REPO)}?`,
    }),
  );
  if (!proceed) {
    cancel("Cancelled — nothing was created.");
    process.exit(0);
  }

  const cloneSpinner = spinner();
  cloneSpinner.start(`Cloning template into ./${projectName}...`);
  try {
    run("git", ["clone", "--depth", "1", TEMPLATE_REPO, targetDir], { stdio: "pipe" });
  } catch (error) {
    cloneSpinner.stop("Clone failed.");
    log.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
  rmSync(path.join(targetDir, ".git"), { recursive: true, force: true });
  cloneSpinner.stop("Template cloned.");

  const installSpinner = spinner();
  installSpinner.start(`Running ${pm} install (needed before the module picker can run)...`);
  try {
    run(pm, ["install"], { cwd: targetDir, stdio: "pipe" });
  } catch (error) {
    installSpinner.stop("Install failed.");
    log.error(error instanceof Error ? error.message : String(error));
    log.warn(`You can retry manually: cd ${projectName} && ${pm} install`);
    process.exit(1);
  }
  installSpinner.stop("Dependencies installed.");

  outro(pc.green("Handing off to the module + theme picker...") + pc.dim(" (scripts/setup.ts)"));

  // Inherited stdio — the same interactive prompts as `bun run setup` show
  // up right here, driven by the user, not scripted by this CLI.
  const setupResult = spawnSync(pm, ["run", "setup"], {
    cwd: targetDir,
    stdio: "inherit",
    env: { ...process.env, MAGIC_PM: pm },
  });

  if (setupResult.status !== 0) {
    log.warn(
      `The module picker exited with code ${setupResult.status}. Your project was still cloned to ` +
        `./${projectName} — cd in and run \`${pm} run setup\` again whenever you're ready.`,
    );
    process.exit(setupResult.status ?? 1);
  }
}

main().catch((error) => {
  log.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
