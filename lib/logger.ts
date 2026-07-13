/**
 * Colored console logger.
 *
 * Plain `console.log` scattered through server code is hard to scan and
 * impossible to filter by severity. This wraps `console.*` with:
 *  - a colored `[LEVEL]` tag (via picocolors — zero-dependency, no ANSI
 *    escapes leak into non-TTY environments like CI log collectors),
 *  - a `HH:MM:SS.mmm` timestamp,
 *  - an optional scope/namespace prefix (`logger.child("trpc")`),
 *  - `debug()` calls that are silent in production (flip with
 *    `LOG_LEVEL=debug` if you need them in prod for a one-off investigation).
 *
 * This is intentionally NOT a full structured-logging library (pino/winston).
 * If you outgrow it — need JSON output for a log pipeline, log shipping,
 * request-scoped correlation ids — swap the implementation below; every
 * call site only depends on the `Logger` shape exported here.
 */
import pc from "picocolors";

type LogLevel = "debug" | "info" | "warn" | "error" | "success";

const LEVEL_STYLE: Record<LogLevel, { label: string; paint: (s: string) => string }> = {
  debug: { label: "DEBUG", paint: pc.gray },
  info: { label: "INFO", paint: pc.cyan },
  warn: { label: "WARN", paint: pc.yellow },
  error: { label: "ERROR", paint: pc.red },
  success: { label: "OK", paint: pc.green },
};

const isDebugEnabled =
  process.env.LOG_LEVEL === "debug" || process.env.NODE_ENV !== "production";

function timestamp(): string {
  const now = new Date();
  const pad = (n: number, width = 2) => n.toString().padStart(width, "0");
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`;
}

function write(level: LogLevel, scope: string | undefined, args: unknown[]): void {
  if (level === "debug" && !isDebugEnabled) return;

  const { label, paint } = LEVEL_STYLE[level];
  const scopeTag = scope ? pc.dim(`[${scope}] `) : "";
  const prefix = `${pc.dim(timestamp())} ${paint(`[${label}]`)} ${scopeTag}`;

  const consoleMethod = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  consoleMethod(prefix, ...args);
}

export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  success: (...args: unknown[]) => void;
  /** Returns a logger that prefixes every line with `[scope]`, e.g. `logger.child("auth")`. */
  child: (scope: string) => Logger;
}

function createLogger(scope?: string): Logger {
  return {
    debug: (...args) => write("debug", scope, args),
    info: (...args) => write("info", scope, args),
    warn: (...args) => write("warn", scope, args),
    error: (...args) => write("error", scope, args),
    success: (...args) => write("success", scope, args),
    child: (childScope) => createLogger(scope ? `${scope}:${childScope}` : childScope),
  };
}

/**
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info("Server started");
 *   const authLog = logger.child("auth");
 *   authLog.warn("Rate limit hit", { userId });
 */
export const logger: Logger = createLogger();
